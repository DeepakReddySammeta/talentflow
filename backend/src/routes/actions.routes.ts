import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { executeConfirmedWrite } from "../agent/tools";
import { WRITE_TOOL_META, reconstructArgsFromForm } from "../agent/forms";
import { clearAgentCaches } from "../agent/orchestrator";

const router = Router();
router.use(requireAuth);

/**
 * Confirms a proposed Level 3 action.
 *
 * For "confirm"-kind tools (archive/restore/approve/delete — nothing to
 * edit) this still takes NO meaningful body: the arguments that execute are
 * exactly what we stored server-side at propose time. A tampered request
 * can't change what gets archived.
 *
 * For "form"-kind tools (create/update/schedule — the user was shown
 * editable fields) the body MAY carry `{ values }`, the user's edited flat
 * field values. This is a deliberate, narrower exception to "never trust
 * the client at confirm time": reconstructArgsFromForm only ever fills in
 * the fields that specific tool's form actually rendered, layered onto the
 * server-stored base args (ids, and anything resolved conversationally
 * before the form was shown) — a client still cannot change WHICH tool
 * runs, whose PendingAction this is, or any field outside that tool's own
 * form. Values are then re-validated by the same Prisma layer
 * executeConfirmedWrite already goes through.
 */
router.post("/:id/confirm", async (req, res) => {
  const action = await prisma.pendingAction.findUnique({ where: { id: req.params.id } });

  if (!action || action.userId !== req.user!.userId) {
    return res.status(404).json({ error: "Action not found" });
  }
  if (action.status !== "PENDING") {
    return res.status(409).json({ error: `Action already ${action.status.toLowerCase()}` });
  }
  if (action.expiresAt < new Date()) {
    await prisma.pendingAction.update({ where: { id: action.id }, data: { status: "EXPIRED" } });
    return res.status(410).json({ error: "This proposal has expired — ask again to get a fresh one." });
  }

  const meta = WRITE_TOOL_META[action.tool];
  const values = req.body?.values;
  const args =
    meta?.kind === "form" && values && typeof values === "object"
      ? reconstructArgsFromForm(action.tool, action.args, values)
      : action.args;

  try {
    const result = await executeConfirmedWrite(action.tool, args, req.user!);
    await prisma.pendingAction.update({ where: { id: action.id }, data: { status: "CONFIRMED" } });
    clearAgentCaches();
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to execute the confirmed action." });
  }
});

router.post("/:id/cancel", async (req, res) => {
  const action = await prisma.pendingAction.findUnique({ where: { id: req.params.id } });
  if (!action || action.userId !== req.user!.userId) {
    return res.status(404).json({ error: "Action not found" });
  }
  if (action.status !== "PENDING") {
    return res.status(409).json({ error: `Action already ${action.status.toLowerCase()}` });
  }
  await prisma.pendingAction.update({ where: { id: action.id }, data: { status: "CANCELLED" } });
  res.json({ ok: true });
});

export default router;
