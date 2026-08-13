import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { allowRoles } from "../middleware/rbac";

const router = Router();
router.use(requireAuth);

// Every authenticated role needs to READ flags (e.g. the frontend checks
// voice_search_enabled before rendering the mic button) — only writing is
// admin-only.
router.get("/", async (_req, res) => {
  const flags = await prisma.featureFlag.findMany();
  res.json(flags);
});

const updateSchema = z.object({ enabled: z.boolean() });

router.patch("/:key", allowRoles("ADMIN"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const flag = await prisma.featureFlag.upsert({
    where: { key: req.params.key },
    update: { enabled: parsed.data.enabled },
    create: { key: req.params.key, enabled: parsed.data.enabled },
  });
  res.json(flag);
});

export default router;
