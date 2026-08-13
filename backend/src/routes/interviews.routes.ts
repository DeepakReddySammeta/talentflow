import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { allowRoles } from "../middleware/rbac";

const router = Router();
router.use(requireAuth);

// ---- GET /interviews — paginated, filterable ----
router.get("/", allowRoles("ADMIN", "HR", "MANAGER", "INTERVIEWER"), async (req, res) => {
  const role = req.user!.role;
  const page = Math.max(1, parseInt(String(req.query.page || "1")));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"))));
  const search = String(req.query.search || "").trim();
  const statusFilter = String(req.query.status || "").trim();
  const jobId = String(req.query.jobId || "").trim();
  const candidateId = String(req.query.candidateId || "").trim();
  const interviewerId = String(req.query.interviewerId || "").trim();
  const round = req.query.round ? parseInt(String(req.query.round)) : undefined;
  const archiveState = String(req.query.archived || "active");

  const where: any = { archivedAt: archiveState === "archived" ? { not: null } : null };
  if (role === "INTERVIEWER") where.interviewerId = req.user!.userId;
  else if (role === "MANAGER" && req.user!.department) where.job = { department: req.user!.department };

  if (statusFilter) where.status = statusFilter;
  if (jobId) where.jobId = jobId;
  if (candidateId) where.candidateId = candidateId;
  if (interviewerId && role !== "INTERVIEWER") where.interviewerId = interviewerId;
  if (round) where.round = round;
  if (search) {
    where.OR = [
      { candidate: { name: { contains: search, mode: "insensitive" } } },
      { job: { title: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [interviews, total] = await Promise.all([
    prisma.interview.findMany({
      where,
      include: {
        candidate: { select: { name: true, email: true } },
        job: { select: { title: true, department: true } },
        interviewer: { select: { id: true, name: true } },
        stage: { select: { name: true, kras: true } },
        scorecard: true,
      },
      orderBy: { scheduledAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.interview.count({ where }),
  ]);

  res.json({ data: interviews, total, page, limit });
});

// ---- GET /interviews/slots — interviewer unavailability slots ----
router.get("/slots", allowRoles("ADMIN", "HR", "MANAGER", "INTERVIEWER"), async (req, res) => {
  const interviewerId = String(req.query.interviewerId || req.user!.userId);
  const month = String(req.query.month || "").trim(); // YYYY-MM

  const where: any = { interviewerId };
  if (month) {
    const start = new Date(`${month}-01`);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    where.date = { gte: start, lt: end };
  }

  const slots = await prisma.interviewerSlot.findMany({
    where,
    orderBy: { date: "asc" },
  });
  res.json(slots);
});

// ---- POST /interviews/slots — mark unavailable date ----
router.post("/slots", allowRoles("ADMIN", "HR", "MANAGER", "INTERVIEWER"), async (req, res) => {
  const schema = z.object({
    date: z.string(),
    note: z.string().optional(),
    interviewerId: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid slot payload" });

  const interviewerId =
    req.user!.role === "INTERVIEWER" ? req.user!.userId : (parsed.data.interviewerId ?? req.user!.userId);

  try {
    const slot = await prisma.interviewerSlot.create({
      data: {
        interviewerId,
        date: new Date(parsed.data.date),
        note: parsed.data.note,
      },
    });
    res.status(201).json(slot);
  } catch {
    res.status(409).json({ error: "Slot already exists for this date" });
  }
});

// ---- DELETE /interviews/slots/:id ----
router.delete("/slots/:id", allowRoles("ADMIN", "HR", "MANAGER", "INTERVIEWER"), async (req, res) => {
  const slot = await prisma.interviewerSlot.findUnique({ where: { id: req.params.id } });
  if (!slot) return res.status(404).json({ error: "Slot not found" });
  if (req.user!.role === "INTERVIEWER" && slot.interviewerId !== req.user!.userId) {
    return res.status(403).json({ error: "Not your slot" });
  }
  await prisma.interviewerSlot.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

const createInterviewSchema = z.object({
  candidateId: z.string().min(1),
  jobId: z.string().min(1),
  interviewerId: z.string().min(1),
  stageId: z.string().optional(),
  round: z.number().int().positive(),
  scheduledAt: z.string(),
});

// ---- POST /interviews ----
router.post("/", allowRoles("ADMIN", "HR"), async (req, res) => {
  const parsed = createInterviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid interview payload" });

  const [candidate, interviewer] = await Promise.all([
    prisma.candidate.findUnique({ where: { id: parsed.data.candidateId }, select: { name: true } }),
    prisma.user.findUnique({ where: { id: parsed.data.interviewerId }, select: { name: true } }),
  ]);

  const interview = await prisma.interview.create({
    data: { ...parsed.data, scheduledAt: new Date(parsed.data.scheduledAt) },
  });

  await prisma.notification.create({
    data: {
      userId: parsed.data.interviewerId,
      message: `You've been assigned to interview ${candidate?.name ?? "a candidate"} — round ${parsed.data.round} on ${new Date(parsed.data.scheduledAt).toLocaleDateString()}`,
      link: "/interviews",
    },
  });

  res.status(201).json(interview);
});

// ---- PATCH /interviews/:id/reschedule ----
router.patch("/:id/reschedule", allowRoles("ADMIN", "HR"), async (req, res) => {
  const schema = z.object({
    scheduledAt: z.string(),
    interviewerId: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid reschedule payload" });

  const interview = await prisma.interview.findUnique({
    where: { id: req.params.id },
    include: { candidate: { select: { name: true } } },
  });
  if (!interview) return res.status(404).json({ error: "Interview not found" });

  const updated = await prisma.interview.update({
    where: { id: req.params.id },
    data: {
      scheduledAt: new Date(parsed.data.scheduledAt),
      ...(parsed.data.interviewerId ? { interviewerId: parsed.data.interviewerId } : {}),
      status: "SCHEDULED",
    },
  });

  const notifyId = parsed.data.interviewerId ?? interview.interviewerId;
  await prisma.notification.create({
    data: {
      userId: notifyId,
      message: `Interview rescheduled: ${interview.candidate?.name ?? "Candidate"} — round ${interview.round} is now on ${new Date(parsed.data.scheduledAt).toLocaleDateString()}`,
      link: "/interviews",
    },
  });

  res.json(updated);
});

const scorecardSchema = z.object({
  recommendation: z.enum(["STRONG_HIRE", "HIRE", "NO_HIRE", "STRONG_NO_HIRE"]),
  kraRatings: z.record(z.string(), z.number().min(1).max(5)).default({}),
  notes: z.string().min(1),
});

// ---- POST /interviews/:id/scorecard ----
router.post("/:id/scorecard", allowRoles("ADMIN", "INTERVIEWER"), async (req, res) => {
  const parsed = scorecardSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid scorecard payload" });

  const interview = await prisma.interview.findUnique({
    where: { id: req.params.id },
    include: {
      job: { include: { stages: { orderBy: { order: "asc" } } } },
      candidate: true,
      scorecard: true,
    },
  });
  if (!interview) return res.status(404).json({ error: "Interview not found" });

  if (req.user!.role === "INTERVIEWER" && interview.interviewerId !== req.user!.userId) {
    return res.status(403).json({ error: "You can only submit a scorecard for your own interviews" });
  }
  if (interview.scorecard) {
    return res.status(409).json({ error: "A scorecard has already been submitted for this interview" });
  }

  const passed = parsed.data.recommendation === "STRONG_HIRE" || parsed.data.recommendation === "HIRE";
  const newInterviewStatus = passed ? "CLEARED" : "REJECTED";
  const newCandidateStatus = passed ? "IN_PROCESS" : "REJECTED";

  const [scorecard] = await prisma.$transaction([
    prisma.scorecard.create({
      data: {
        interviewId: interview.id,
        recommendation: parsed.data.recommendation,
        kraRatings: parsed.data.kraRatings,
        notes: parsed.data.notes,
      },
    }),
    prisma.interview.update({ where: { id: interview.id }, data: { status: newInterviewStatus } }),
    prisma.candidate.update({ where: { id: interview.candidateId }, data: { status: newCandidateStatus } }),
  ]);

  // Notify job creator
  await prisma.notification.create({
    data: {
      userId: interview.job.createdById,
      message: `${interview.candidate.name} — round ${interview.round} feedback: ${parsed.data.recommendation.replace(/_/g, " ")}`,
      link: `/candidates/${interview.candidateId}`,
    },
  });

  // If cleared, check if there's a next stage and notify HR/creator to schedule next round
  if (passed) {
    const currentStageOrder = interview.stageId
      ? interview.job.stages.find((s) => s.id === interview.stageId)?.order ?? 0
      : interview.round;
    const nextStage = interview.job.stages.find((s) => s.order === currentStageOrder + 1);
    if (nextStage) {
      await prisma.notification.create({
        data: {
          userId: interview.job.createdById,
          message: `${interview.candidate.name} cleared round ${interview.round}. Ready to schedule round ${interview.round + 1} (${nextStage.name}).`,
          link: `/candidates/${interview.candidateId}`,
        },
      });
    }
  }

  res.status(201).json(scorecard);
});

// ---- PATCH /interviews/:id/archive ----
router.patch("/:id/archive", allowRoles("ADMIN", "HR"), async (req, res) => {
  try {
    const interview = await prisma.interview.update({
      where: { id: req.params.id },
      data: { archivedAt: new Date() },
      select: { id: true, archivedAt: true },
    });
    res.json(interview);
  } catch {
    res.status(404).json({ error: "Interview not found" });
  }
});

// ---- PATCH /interviews/:id/restore ----
router.patch("/:id/restore", allowRoles("ADMIN", "HR"), async (req, res) => {
  try {
    const interview = await prisma.interview.update({
      where: { id: req.params.id },
      data: { archivedAt: null },
      select: { id: true, archivedAt: true },
    });
    res.json(interview);
  } catch {
    res.status(404).json({ error: "Interview not found" });
  }
});

export default router;
