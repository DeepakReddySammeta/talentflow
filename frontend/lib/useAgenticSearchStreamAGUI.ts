"use client";

import { useCallback, useRef, useState } from "react";
import { HttpAgent, EventType } from "@ag-ui/client";
import { apiRequest, signalSessionExpired } from "./apiClient";
import type { StreamStatus, PendingActionState, StreamedResult } from "./useAgenticSearchStream";
import { MessageProcessor, Catalog } from "@a2ui/web_core/v0_9";
import type { SurfaceModel } from "@a2ui/web_core/v0_9";
import type { ReactComponentImplementation } from "@a2ui/react/v0_9";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("ats_token");
}

/**
 * Drop-in replacement for useAgenticSearchStream that uses the AG-UI
 * HttpAgent (SSE over POST /search/stream) instead of a raw WebSocket.
 *
 * Exposes the exact same return shape so ChatWindow needs no changes
 * beyond swapping which hook it calls.
 */
export function useAgenticSearchStreamAGUI(catalog?: Catalog<ReactComponentImplementation>) {
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [progress, setProgress] = useState<string[]>([]);
  const [result, setResult] = useState<StreamedResult | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingActionState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const agentRef = useRef<InstanceType<typeof HttpAgent> | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const processorRef = useRef<MessageProcessor<ReactComponentImplementation> | null>(null);
  const surfaceModelRef = useRef<SurfaceModel<ReactComponentImplementation> | null>(null);

  const runTurn = useCallback((prompt: string) => {
    agentRef.current?.abortRun();

    setStatus("connecting");
    setProgress([]);
    setResult(null);
    setPendingAction(null);
    setError(null);
    processorRef.current = null;
    surfaceModelRef.current = null;

    const token = getToken();
    const conversationId = conversationIdRef.current;

    // Use a custom fetch to inject our extra body fields (prompt,
    // conversationId) since HttpAgentConfig has no requestInit option.
    const customFetch: (url: string, init: RequestInit) => Promise<Response> = (url, init) => {
      const body = JSON.stringify({
        prompt,
        conversationId,
      });
      return fetch(url, {
        ...init,
        body,
        headers: {
          ...(init.headers as Record<string, string> | undefined),
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    };

    const agent = new HttpAgent({
      url: `${API_URL}/search/stream`,
      fetch: customFetch,
      initialMessages: [{ id: crypto.randomUUID(), role: "user", content: prompt }],
    });

    agentRef.current = agent;

    agent.subscribe({
      onRunStartedEvent() {
        setStatus("streaming");
      },
      onStepStartedEvent({ event }: any) {
        setProgress((prev) => [...prev, event.stepName as string]);
      },
      onStateSnapshotEvent({ event }: any) {
        const snap = event.snapshot as any;
        conversationIdRef.current = snap.conversationId ?? null;
        setResult({
          conversationId: snap.conversationId,
          summary: snap.summary,
          steps: snap.steps,
          data: snap.data,
          a2uiMessages: snap.a2uiMessages ?? null,
          surfaceModel: surfaceModelRef.current, // attach the built A2UI surface model
        });
      },
      onCustomEvent({ event }: any) {
        if (event.name === "tf:surface_update" && catalog) {
          const messages = event.value?.a2uiMessages;
          if (!Array.isArray(messages)) return;
          if (!processorRef.current) {
            processorRef.current = new MessageProcessor([catalog]);
            processorRef.current.onSurfaceCreated((m) => {
              surfaceModelRef.current = m as SurfaceModel<ReactComponentImplementation>;
            });
          }
          try {
            processorRef.current.processMessages(messages);
          } catch (e) {
            console.error("[A2UI] surface_update failed:", e);
          }
        }
        if (event.name === "tf:action_proposed") {
          const v = event.value as any;
          conversationIdRef.current = v.conversationId ?? null;
          setPendingAction({
            actionId: v.actionId,
            description: v.description,
            kind: v.kind === "form" ? "form" : "confirm",
            submitLabel: v.submitLabel || "Confirm",
            fields: Array.isArray(v.fields) ? v.fields : null,
          });
        }
      },
      onRunFinishedEvent() {
        setStatus("done");
      },
      onRunErrorEvent({ event }: any) {
        const msg = (event.message as string) || "Agent run failed.";
        if (msg.includes("401")) signalSessionExpired();
        setError(msg);
        setStatus("error");
      },
      onRunFailed({ error: err }: any) {
        setError(err?.message || "Connection failed.");
        setStatus("error");
      },
    });

    agent.runAgent({}).catch((err: any) => {
      setError(err?.message || "Agent run failed.");
      setStatus("error");
    });
  }, []);

  const send = useCallback((prompt: string) => runTurn(prompt), [runTurn]);

  const stop = useCallback(() => {
    agentRef.current?.abortRun();
    setStatus("idle");
  }, []);

  const clearPendingAction = useCallback(() => setPendingAction(null), []);

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
    agentRef.current?.abortRun();
    // dispose the surface before clearing refs, same as the WS hook — prevents signal/subscription leaks
    if (processorRef.current) {
      try {
        processorRef.current.processMessages([{ version: "v0.9", deleteSurface: { surfaceId: "main" } }]);
      } catch { /* ignore */ }
    }
    conversationIdRef.current = null;
    processorRef.current = null;
    surfaceModelRef.current = null;
  }, []);

  // dispatchSurfaceAction — not supported on the SSE path (surface buttons
  // need a WS round trip). No-op so ChatWindow compiles without changes.
  const dispatchSurfaceAction = useCallback((_envelope: any) => {}, []);

  return {
    status, progress, result,
    partialSurface: null,
    pendingAction, error,
    send, stop, dispatchSurfaceAction,
    confirmAction, cancelAction, clearPendingAction, startNewConversation,
  };
}
