import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { runAgent, runAgentStreaming } from "../agent/orchestrator";
import { createAGUIEmitter } from "../lib/agui";

const router = Router();

const searchSchema = z.object({
  prompt: z.string().min(1).max(500),
});

// Every role can use agentic search — the scoping happens inside the
// agent's tools (see agent/tools.ts), not by gating this route.
router.post("/", requireAuth, async (req, res) => {
  const parsed = searchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Missing or invalid 'prompt'" });
  }

  try {
    const result = await runAgent(parsed.data.prompt, req.user!);
    res.json(result);
  } catch (err: any) {
    console.error("[search] agent error:", err);
    res.status(500).json({ error: "The search agent failed to complete this request." });
  }
});

/**
 * AG-UI streaming endpoint — POST /search/stream
 * Accepts { prompt, conversationId? } with a Bearer token,
 * streams AG-UI standard events as SSE.
 */
router.post("/stream", requireAuth, async (req, res) => {
  const parsed = searchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Missing or invalid 'prompt'" });
  }

  const { toOrchestratorEmit } = createAGUIEmitter(res);

  try {
    await runAgentStreaming(
      parsed.data.prompt,
      req.user!,
      req.body.conversationId ?? null,
      toOrchestratorEmit,
      req.body.dataModel ?? null
    );
  } catch (err: any) {
    console.error("[agui] stream error:", err);
    // res may already be ended if the orchestrator emitted final/error
    if (!res.writableEnded) {
      toOrchestratorEmit({ type: "error", error: "The search agent failed." });
    }
  }
});

export default router;
