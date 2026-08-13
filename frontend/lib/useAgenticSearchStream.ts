"use client";

import { useCallback, useRef, useState } from "react";
import { getSearchSocketUrl, apiRequest, signalSessionExpired } from "./apiClient";
import { SearchResult } from "./types";
import type { SurfaceModel } from "@a2ui/web_core/v0_9";
import { MessageProcessor, Catalog, getValue } from "@a2ui/web_core/v0_9";
import type { ReactComponentImplementation } from "@a2ui/react/v0_9";

/**
 * Streaming counterpart to useAgenticSearch (which stays REST-based and
 * unchanged for anything that doesn't need live progress). This is the
 * data-fetching/plumbing half of the WebSocket + A2UI work — wiring this
 * into an actual Chat Window / A2UI renderer component is intentionally
 * left for the design-system integration, not built here.
 *
 * Usage sketch once that UI exists:
 *   const { status, progress, result, pendingAction, send, confirmAction } = useAgenticSearchStream();
 *   send("who cleared round 2 for the SDE role");
 *   // progress: string[] — e.g. "Searching interviews...", to show as it streams
 *   // result.a2uiSurface — validated A2UI JSON, feed into your renderer's catalog
 *   // pendingAction — Level 3 proposal; render its `description` + Confirm/Cancel
 */

export type StreamStatus = "idle" | "connecting" | "streaming" | "done" | "error";

export interface PendingActionFormField {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "datetime" | "password" | "stageList";
  value: string | number;
  options?: { label: string; value: string }[];
  required?: boolean;
  placeholder?: string;
  step?: number;
  stepTitle?: string;
}

export interface PendingActionState {
  actionId: string;
  description: string;
  kind: "form" | "confirm";
  submitLabel: string;
  fields: PendingActionFormField[] | null;
}

export interface StreamedResult extends SearchResult {
  conversationId: string;
  a2uiMessages: unknown[] | null;
  surfaceModel?: SurfaceModel<ReactComponentImplementation> | null;
}

export function useAgenticSearchStream(catalog?: Catalog<ReactComponentImplementation>) {
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [progress, setProgress] = useState<string[]>([]);
  const [result, setResult] = useState<StreamedResult | null>(null);
  const [partialSurface, setPartialSurface] = useState<SurfaceModel<ReactComponentImplementation> | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingActionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const processorRef = useRef<MessageProcessor<ReactComponentImplementation> | null>(null);
  const surfaceModelRef = useRef<SurfaceModel<ReactComponentImplementation> | null>(null);

  /**
   * Opens a fresh WebSocket and sends one initial message over it. Every
   * turn — a typed prompt, or a surface button dispatching an action —
   * gets its own connection: the server closes the socket after each
   * action_proposed/final/error, so a later turn reusing a stale
   * socketRef would silently no-op (ws.readyState !== OPEN). This is the
   * one place a turn gets started; `send` and `dispatchSurfaceAction`
   * just supply the initial message.
   */
  const openTurn = useCallback((buildInitialMessage: () => Record<string, unknown>) => {
    setStatus("connecting");
    setProgress([]);
    setResult(null);
    setPartialSurface(null);
    setPendingAction(null);
    setError(null);
    processorRef.current = null;
    surfaceModelRef.current = null;

    const ws = new WebSocket(getSearchSocketUrl());
    socketRef.current = ws;

    ws.onopen = () => {
      setStatus("streaming");
      // Client capabilities handshake — lets the server know which catalogs
      // this client supports before it starts processing messages.
      ws.send(JSON.stringify({
        type: "hello",
        supportedCatalogIds: ["https://talentflow.internal/catalog/v1"],
        version: "v0.9",
      }));
      ws.send(JSON.stringify(buildInitialMessage()));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case "progress":
          setProgress((prev) => [...prev, msg.message]);
          break;
        case "surface_update":
          if (catalog && Array.isArray(msg.a2uiMessages)) {
            if (!processorRef.current) {
              processorRef.current = new MessageProcessor([catalog]);
              processorRef.current.onSurfaceCreated((m) => {
                const model = m as SurfaceModel<ReactComponentImplementation>;
                surfaceModelRef.current = model;
                setPartialSurface(model);
              });
            }
            try {
              processorRef.current.processMessages(msg.a2uiMessages);
            } catch (e) {
              console.error("[A2UI] surface_update failed:", e);
              // If this was the first surface_update this turn, the user has
              // nothing rendered yet — surface an error instead of leaving
              // them on an indefinite progress spinner. If the backend still
              // sends a working "final" message afterwards, its handler
              // unconditionally sets status back to "done", so this
              // self-corrects rather than getting the socket stuck.
              if (!surfaceModelRef.current) {
                setError("The agent sent a surface update that couldn't be rendered.");
                setStatus("error");
              }
            }
          }
          break;
        case "action_proposed":
          conversationIdRef.current = msg.conversationId;
          setPendingAction({
            actionId: msg.actionId,
            description: msg.description,
            kind: msg.kind === "form" ? "form" : "confirm",
            submitLabel: msg.submitLabel || "Confirm",
            fields: Array.isArray(msg.fields) ? msg.fields : null,
          });
          setStatus("done");
          ws.close();
          break;
        case "final":
          conversationIdRef.current = msg.conversationId;
          setResult({
            ...(msg as StreamedResult),
            surfaceModel: surfaceModelRef.current,
          });
          setStatus("done");
          ws.close();
          break;
        case "error":
          setError(msg.error);
          setStatus("error");
          ws.close();
          break;
      }
    };

    ws.onerror = () => {
      setError("Connection to the search agent failed.");
      setStatus("error");
    };

    ws.onclose = (event) => {
      setStatus((prev) => {
        if (prev === "connecting" || prev === "streaming") {
          // code 1000 = user-initiated stop, not an error
          if (event.code === 1000) return "idle";
          if (event.code === 4001) {
            signalSessionExpired();
            setError("Authentication failed — please log in again.");
          } else {
            setError("Connection closed unexpectedly.");
          }
          return "error";
        }
        return prev;
      });
    };
  }, [catalog]);

  const send = useCallback((prompt: string) => {
    // Capture current filter state BEFORE the turn resets — this is what
    // gets sent with the new query so the agent starts with the user's
    // active filter. Reads via getValue() rather than signal.value
    // directly: as of web_core 0.10.3's setSignalImplementation support,
    // Signal is an abstract brand type (no guaranteed .value property) so
    // consumers go through the exported accessor instead of assuming a
    // concrete signals-library shape.
    const filterSignal = surfaceModelRef.current?.dataModel?.getSignal<string>("filter/status");
    const prevFilterStatus = filterSignal ? getValue(filterSignal) : undefined;
    const dataModel = prevFilterStatus ? { filter: { status: prevFilterStatus } } : undefined;

    openTurn(() => ({ type: "search", prompt, conversationId: conversationIdRef.current, dataModel }));
  }, [openTurn]);

  const stop = useCallback(() => {
    const ws = socketRef.current;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close(1000);
    }
    setStatus("idle");
  }, []);

  const dispatchSurfaceAction = useCallback((envelope: {
    name: string;
    sourceComponentId: string;
    timestamp: string;
    context: Record<string, unknown>;
  }) => {
    openTurn(() => ({
      type: "action",
      actionName: envelope.name,
      payload: envelope.context,
      sourceComponentId: envelope.sourceComponentId,
      surfaceId: "main",
      timestamp: envelope.timestamp,
      conversationId: conversationIdRef.current,
    }));
  }, [openTurn]);

  const clearPendingAction = useCallback(() => {
    setPendingAction(null);
  }, []);

  const confirmAction = useCallback(async (actionId: string, values?: Record<string, string | number>) => {
    return apiRequest(`/search/actions/${actionId}/confirm`, {
      method: "POST",
      body: values ? { values } : undefined,
    });
  }, []);

  const cancelAction = useCallback(async (actionId: string) => {
    return apiRequest(`/search/actions/${actionId}/cancel`, { method: "POST" });
  }, []);

  const startNewConversation = useCallback(() => {
    // Dispose the current surface before clearing refs — signals and subscriptions
    // get cleaned up by the A2UI runtime rather than leaking across conversations.
    if (processorRef.current) {
      try {
        processorRef.current.processMessages([{
          version: "v0.9",
          deleteSurface: { surfaceId: "main" },
        }]);
      } catch {
        // ignore if surface was already gone
      }
    }
    conversationIdRef.current = null;
    processorRef.current = null;
    surfaceModelRef.current = null;
  }, []);

  return {
    status, progress, result, partialSurface, pendingAction, error,
    send, stop, dispatchSurfaceAction, confirmAction, cancelAction, clearPendingAction, startNewConversation,
  };
}
