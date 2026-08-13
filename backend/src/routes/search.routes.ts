import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { runAgent } from "../agent/orchestrator";

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

export default router;
