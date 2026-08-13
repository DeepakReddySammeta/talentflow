import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// A user's own conversation history — the "remember conversation" feature.
// Scoped to the caller only; there's no cross-user visibility here, unlike
// the RBAC-scoped entity routes.
router.get("/", async (req, res) => {
  const conversations = await prisma.conversation.findMany({
    where: { userId: req.user!.userId },
    orderBy: { updatedAt: "desc" },
    take: 30,
  });
  res.json(conversations);
});

router.get("/:id/messages", async (req, res) => {
  const conversation = await prisma.conversation.findUnique({ where: { id: req.params.id } });
  if (!conversation || conversation.userId !== req.user!.userId) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  const messages = await prisma.message.findMany({
    where: { conversationId: req.params.id },
    orderBy: { createdAt: "asc" },
  });
  res.json(messages);
});

export default router;
