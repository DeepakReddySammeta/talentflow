import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { verifyToken } from "../utils/jwt";
import { JwtPayload } from "../types";
import { runAgentStreaming, proposeActionDirect } from "../agent/orchestrator";

interface AuthedSocket extends WebSocket {
  user?: JwtPayload;
}

/**
 * One WebSocket endpoint (/ws/search) replaces the old single-request
 * POST /search for anything that wants live progress + A2UI payloads.
 * The plain POST /search route (search.routes.ts) is left in place for
 * simple/non-streaming callers.
 *
 * Auth: the client connects with ?token=<jwt> in the URL (WebSocket
 * requests can't carry custom headers from the browser), which is then
 * verified exactly like requireAuth does for REST routes — every message
 * on this socket is scoped to that verified user for its whole lifetime.
 */
export function attachWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws/search" });

  wss.on("connection", (ws: AuthedSocket, req) => {
    const url = new URL(req.url || "", "http://localhost");
    const token = url.searchParams.get("token");

    if (!token) {
      ws.close(4001, "Missing token");
      return;
    }

    try {
      ws.user = verifyToken(token);
    } catch {
      ws.close(4001, "Invalid or expired token");
      return;
    }

    // Allowlist of action names that surface buttons are permitted to trigger.
    // Keep this in sync with what the orchestrator actually emits as TFButton
    // actionNames (orchestrator.ts) — no placeholder names with no handler
    // behind them, since hitting one just falls through to a generic
    // free-text prompt rather than doing anything resembling the action.
    const ALLOWED_ACTIONS = new Set([
      "view_candidate",
      "schedule_interview",
      "edit_job",
      "archive_job",
      "restore_job",
      "edit_candidate",
      "archive_candidate",
      "restore_candidate",
      "reschedule_interview",
      "archive_interview",
      "restore_interview",
      "submit_scorecard",
      "edit_offer",
      "approve_offer",
      "archive_offer",
      "restore_offer",
      "edit_skill",
      "delete_skill",
      "edit_user",
      "archive_user",
      "restore_user",
    ]);

    // Actions that map 1:1 onto a known write tool are proposed directly —
    // no LLM round trip. This is deliberately not just "reuse the action
    // name as the tool name": several of these (edit_job -> update_job,
    // edit_candidate -> update_candidate, ...) have DIFFERENT names, and
    // relying on the LLM to infer that mapping from a synthesized prompt is
    // unreliable — it would sometimes ask a clarifying question instead of
    // calling the tool. Keep this in sync with WRITE_TOOL_META in forms.ts.
    const ACTION_TO_WRITE_TOOL: Record<string, string> = {
      edit_job: "update_job",
      archive_job: "archive_job",
      restore_job: "restore_job",
      edit_candidate: "update_candidate",
      archive_candidate: "archive_candidate",
      restore_candidate: "restore_candidate",
      schedule_interview: "schedule_interview",
      reschedule_interview: "reschedule_interview",
      submit_scorecard: "submit_scorecard",
      archive_interview: "archive_interview",
      restore_interview: "restore_interview",
      edit_offer: "update_offer",
      approve_offer: "approve_offer",
      archive_offer: "archive_offer",
      restore_offer: "restore_offer",
      edit_skill: "update_skill",
      delete_skill: "delete_skill",
      edit_user: "update_user",
      archive_user: "archive_user",
      restore_user: "restore_user",
    };

    const emit = (event: Record<string, any>) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(event));
      }
    };

    ws.on("message", async (raw) => {
      let payload: any;
      try {
        payload = JSON.parse(raw.toString());
      } catch {
        emit({ type: "error", error: "Malformed message" });
        return;
      }

      // Client capabilities handshake — no-op, just acknowledge the connection.
      if (payload.type === "hello") return;

      if (payload.type === "action") {
        const { actionName, payload: context } = payload;
        if (typeof actionName !== "string" || !ALLOWED_ACTIONS.has(actionName)) {
          emit({ type: "error", error: `Unknown or disallowed action: ${actionName}` });
          return;
        }

        const tool = ACTION_TO_WRITE_TOOL[actionName];
        if (tool) {
          try {
            await proposeActionDirect(tool, context ?? {}, ws.user!, payload.conversationId ?? null, emit);
          } catch (err: any) {
            console.error("[ws] direct action propose error:", err);
            emit({ type: "error", error: "Couldn't prepare that action." });
          }
          return;
        }

        const synthesizedPrompt = `User triggered action "${actionName}" with context: ${JSON.stringify(context ?? {})}`;
        try {
          await runAgentStreaming(synthesizedPrompt, ws.user!, payload.conversationId ?? null, emit);
        } catch (err: any) {
          console.error("[ws] action agent error:", err);
          emit({ type: "error", error: "The action agent failed to complete this request." });
        }
        return;
      }

      if (payload.type !== "search" || typeof payload.prompt !== "string") {
        emit({ type: "error", error: "Expected { type: 'search', prompt } or { type: 'action', actionName }" });
        return;
      }

      try {
        await runAgentStreaming(
          payload.prompt,
          ws.user!,
          payload.conversationId ?? null,
          emit,
          payload.dataModel ?? null
        );
      } catch (err: any) {
        console.error("[ws] agent error:", err);
        emit({ type: "error", error: "The search agent failed to complete this request." });
      }
    });
  });

  console.log("WebSocket server attached at /ws/search");
  return wss;
}
