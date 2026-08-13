import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { allowRoles } from "../middleware/rbac";

const router = Router();
router.use(requireAuth);

// Interviewer is deliberately excluded here — salary data never reaches
// their role, at the route level as well as the agent tool level.
router.get("/", allowRoles("ADMIN", "HR", "MANAGER"), async (req, res) => {
  const archiveState = String(req.query.archived || "active");
  const where: any = { archivedAt: archiveState === "archived" ? { not: null } : null };
  if (req.user!.role === "MANAGER" && req.user!.department) {
    where.job = { department: req.user!.department };
  }
  const offers = await prisma.offer.findMany({
    where,
    include: { candidate: true, job: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(offers);
});

const createOfferSchema = z.object({
  candidateId: z.string().min(1),
  jobId: z.string().min(1),
  salary: z.number().positive(),
});

router.post("/", allowRoles("ADMIN", "HR"), async (req, res) => {
  const parsed = createOfferSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid offer payload" });

  const offer = await prisma.offer.create({ data: parsed.data });
  res.status(201).json(offer);
});

const updateOfferSchema = z.object({
  salary: z.number().positive().optional(),
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "DECLINED"]).optional(),
});

// ---- PATCH /offers/:id — generic update (salary/status), not the approval
// workflow. Approval stays its own endpoint below since it has its own
// RBAC (MANAGER allowed) and side effects (sets approvedById).
router.patch("/:id", allowRoles("ADMIN", "HR"), async (req, res) => {
  const parsed = updateOfferSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid update payload" });
  try {
    const offer = await prisma.offer.update({ where: { id: req.params.id }, data: parsed.data });
    res.json(offer);
  } catch {
    res.status(404).json({ error: "Offer not found" });
  }
});

router.patch("/:id/approve", allowRoles("ADMIN", "MANAGER"), async (req, res) => {
  const offer = await prisma.offer.findUnique({ where: { id: req.params.id }, include: { job: true } });
  if (!offer) return res.status(404).json({ error: "Offer not found" });

  if (req.user!.role === "MANAGER" && offer.job.department !== req.user!.department) {
    return res.status(403).json({ error: "You can only approve offers within your own department" });
  }

  const updated = await prisma.offer.update({
    where: { id: req.params.id },
    data: { status: "SENT", approvedById: req.user!.userId },
  });
  res.json(updated);
});

// ---- PATCH /offers/:id/archive ----
router.patch("/:id/archive", allowRoles("ADMIN", "HR"), async (req, res) => {
  try {
    const offer = await prisma.offer.update({
      where: { id: req.params.id },
      data: { archivedAt: new Date() },
      select: { id: true, archivedAt: true },
    });
    res.json(offer);
  } catch {
    res.status(404).json({ error: "Offer not found" });
  }
});

// ---- PATCH /offers/:id/restore ----
router.patch("/:id/restore", allowRoles("ADMIN", "HR"), async (req, res) => {
  try {
    const offer = await prisma.offer.update({
      where: { id: req.params.id },
      data: { archivedAt: null },
      select: { id: true, archivedAt: true },
    });
    res.json(offer);
  } catch {
    res.status(404).json({ error: "Offer not found" });
  }
});

export default router;
