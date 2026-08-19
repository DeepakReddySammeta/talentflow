import type { Response } from "express";
import { EventType } from "@ag-ui/core";
import { v4 as uuidv4 } from "uuid";

/**
 * Initialises an SSE response and returns:
 *  - emit(event) — sends one AG-UI event as an SSE data line
 *  - toOrchestratorEmit() — adapts the internal custom event format
 *    (used by runAgentStreaming) into AG-UI standard events
 */
export function createAGUIEmitter(res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const runId = uuidv4();
  let textMsgId: string | null = null;
  let toolCallId: string | null = null;
  let activeStepName: string | null = null;

  function sendEvent(event: Record<string, unknown>) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  // Emit RUN_STARTED immediately
  sendEvent({ type: EventType.RUN_STARTED, runId, threadId: runId });

  /**
   * Translates the orchestrator's internal emit format into AG-UI events.
   *
   * Internal format → AG-UI mapping:
   *   progress          → STEP_STARTED (label) + close prior text msg
   *   surface_update    → CUSTOM (tf:surface_update)
   *   action_proposed   → CUSTOM (tf:action_proposed) + RUN_FINISHED
   *   final             → TEXT_MESSAGE_* (summary) + STATE_SNAPSHOT + RUN_FINISHED
   *   error             → RUN_ERROR
   */
  function toOrchestratorEmit(event: Record<string, unknown>) {
    switch (event.type) {
      case "progress": {
        // Close any open text message
        if (textMsgId) {
          sendEvent({ type: EventType.TEXT_MESSAGE_END, messageId: textMsgId });
          textMsgId = null;
        }
        // Close the previous step before opening a new one
        if (activeStepName) {
          sendEvent({ type: EventType.STEP_FINISHED, stepName: activeStepName });
        }
        activeStepName = event.message as string;
        sendEvent({ type: EventType.STEP_STARTED, stepName: activeStepName });
        break;
      }

      case "surface_update": {
        sendEvent({
          type: EventType.CUSTOM,
          name: "tf:surface_update",
          value: { a2uiMessages: event.a2uiMessages },
        });
        break;
      }

      case "action_proposed": {
        if (activeStepName) {
          sendEvent({ type: EventType.STEP_FINISHED, stepName: activeStepName });
          activeStepName = null;
        }
        sendEvent({
          type: EventType.CUSTOM,
          name: "tf:action_proposed",
          value: {
            actionId: event.actionId,
            description: event.description,
            kind: event.kind,
            submitLabel: event.submitLabel,
            fields: event.fields,
            conversationId: event.conversationId,
          },
        });
        sendEvent({
          type: EventType.RUN_FINISHED,
          runId,
          threadId: runId,
        });
        res.end();
        break;
      }

      case "final": {
        if (activeStepName) {
          sendEvent({ type: EventType.STEP_FINISHED, stepName: activeStepName });
          activeStepName = null;
        }
        // Emit the summary as a text message
        const summary = (event.summary as string) || "";
        if (summary) {
          const msgId = uuidv4();
          sendEvent({ type: EventType.TEXT_MESSAGE_START, messageId: msgId, role: "assistant" });
          sendEvent({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: msgId, delta: summary });
          sendEvent({ type: EventType.TEXT_MESSAGE_END, messageId: msgId });
        }

        // Carry the full result payload in STATE_SNAPSHOT so the client
        // can reconstruct the same StreamedResult shape the WS path returns.
        sendEvent({
          type: EventType.STATE_SNAPSHOT,
          snapshot: {
            conversationId: event.conversationId,
            summary: event.summary,
            steps: event.steps,
            data: event.data,
            a2uiMessages: event.a2uiMessages ?? null,
          },
        });

        sendEvent({ type: EventType.RUN_FINISHED, runId, threadId: runId });
        res.end();
        break;
      }

      case "error": {
        if (activeStepName) {
          sendEvent({ type: EventType.STEP_FINISHED, stepName: activeStepName });
          activeStepName = null;
        }
        sendEvent({
          type: EventType.RUN_ERROR,
          message: (event.error as string) || "Unknown error",
        });
        res.end();
        break;
      }
    }
  }

  return { toOrchestratorEmit, runId };
}
