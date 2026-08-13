import { Router } from "express";
import { z } from "zod";
import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { allowRoles } from "../middleware/rbac";

const router = Router();
router.use(requireAuth);

// ---- GET /jobs — paginated, filterable ----
router.get("/", allowRoles("ADMIN", "HR", "MANAGER"), async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1")));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"))));
  const search = String(req.query.search || "").trim();
  const statusFilter = String(req.query.status || "").trim();
  const department = String(req.query.department || "").trim();
  const archiveState = String(req.query.archived || "active");

  const where: any = {};
  if (archiveState === "archived") {
    where.archivedAt = { not: null };
  } else {
    where.archivedAt = null;
  }

  if (req.user!.role === "MANAGER" && req.user!.department) {
    where.department = req.user!.department;
  }
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { department: { contains: search, mode: "insensitive" } },
    ];
  }
  if (statusFilter) where.status = statusFilter;
  if (department && req.user!.role !== "MANAGER") where.department = { contains: department, mode: "insensitive" };

  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where,
      include: {
        _count: { select: { candidates: true, stages: true, interviews: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.job.count({ where }),
  ]);

  res.json({ data: jobs, total, page, limit });
});

// ---- GET /jobs/export — CSV download ----
router.get("/export", allowRoles("ADMIN", "HR", "MANAGER"), async (req, res) => {
  const search = String(req.query.search || "").trim();
  const statusFilter = String(req.query.status || "").trim();

  const where: any = { archivedAt: null };
  if (req.user!.role === "MANAGER" && req.user!.department) where.department = req.user!.department;
  if (search) where.OR = [{ title: { contains: search, mode: "insensitive" } }];
  if (statusFilter) where.status = statusFilter;

  const jobs = await prisma.job.findMany({
    where,
    include: { _count: { select: { candidates: true } }, createdBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const rows = jobs.map((j) => ({
    ID: j.id,
    Title: j.title,
    Department: j.department,
    Status: j.status,
    Candidates: j._count.candidates,
    "Created By": j.createdBy.name,
    "Created At": j.createdAt.toISOString(),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Jobs");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "csv" });
  res.setHeader("Content-Disposition", `attachment; filename="jobs.csv"`);
  res.setHeader("Content-Type", "text/csv");
  res.send(buf);
});

// ---- GET /jobs/:id ----
router.get("/:id", allowRoles("ADMIN", "HR", "MANAGER"), async (req, res) => {
  const job = await prisma.job.findUnique({
    where: { id: req.params.id },
    include: {
      stages: { orderBy: { order: "asc" } },
      createdBy: { select: { name: true } },
      skills: { include: { skill: true }, orderBy: { skill: { name: "asc" } } },
      _count: { select: { candidates: true, interviews: true, offers: true } },
    },
  });
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(job);
});

// ---- GET /jobs/:id/candidates — paginated ----
router.get("/:id/candidates", allowRoles("ADMIN", "HR", "MANAGER"), async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1")));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"))));
  const [candidates, total] = await Promise.all([
    prisma.candidate.findMany({
      where: { jobId: req.params.id },
      include: { skillLinks: { include: { skill: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.candidate.count({ where: { jobId: req.params.id } }),
  ]);
  res.json({ data: candidates, total, page, limit });
});

// ---- GET /jobs/:id/interviews — paginated ----
router.get("/:id/interviews", allowRoles("ADMIN", "HR", "MANAGER"), async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1")));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"))));
  const [interviews, total] = await Promise.all([
    prisma.interview.findMany({
      where: { jobId: req.params.id },
      include: {
        candidate: { select: { name: true } },
        interviewer: { select: { name: true } },
        stage: { select: { name: true } },
        scorecard: { select: { recommendation: true } },
      },
      orderBy: { scheduledAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.interview.count({ where: { jobId: req.params.id } }),
  ]);
  res.json({ data: interviews, total, page, limit });
});

const createJobSchema = z.object({
  title: z.string().min(1),
  department: z.string().min(1),
  // "ARCHIVED" intentionally excluded — archival is now the separate
  // archivedAt flag (PATCH /:id/archive), not a status value, to avoid
  // two parallel "archived" concepts. Historical rows may still carry it.
  status: z.enum(["OPEN", "CLOSED", "ON_HOLD", "DRAFT"]).optional(),
  description: z.string().optional(),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "FREELANCE", "INTERNSHIP"]).optional(),
  jobLevel: z.enum(["INTERN", "JUNIOR", "MID", "SENIOR", "LEAD", "MANAGER", "DIRECTOR"]).optional(),
  payMin: z.number().positive().optional(),
  payMax: z.number().positive().optional(),
  payCurrency: z.enum(["INR", "USD"]).optional(),
  stages: z
    .array(z.object({ name: z.string().min(1), kras: z.array(z.string()).default([]) }))
    .min(1)
    .default([{ name: "Screening", kras: [] }]),
  skillIds: z.array(z.string()).optional(),
});

// ---- POST /jobs ----
router.post("/", allowRoles("ADMIN", "HR"), async (req, res) => {
  const parsed = createJobSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid job payload" });

  const { stages, skillIds, ...jobFields } = parsed.data;

  const job = await prisma.job.create({
    data: {
      ...jobFields,
      status: jobFields.status ?? "OPEN",
      createdById: req.user!.userId,
      stages: {
        create: stages.map((s, i) => ({ order: i + 1, name: s.name, kras: s.kras })),
      },
      ...(skillIds?.length
        ? {
            skills: {
              create: skillIds.map((skillId) => ({ skillId, proficiency: "INTERMEDIATE" })),
            },
          }
        : {}),
    },
    include: {
      stages: { orderBy: { order: "asc" } },
      skills: { include: { skill: true } },
    },
  });
  res.status(201).json(job);
});

const updateJobSchema = z.object({
  title: z.string().min(1).optional(),
  department: z.string().min(1).optional(),
  // "ARCHIVED" intentionally excluded — archival is now the separate
  // archivedAt flag (PATCH /:id/archive), not a status value, to avoid
  // two parallel "archived" concepts. Historical rows may still carry it.
  status: z.enum(["OPEN", "CLOSED", "ON_HOLD", "DRAFT"]).optional(),
  description: z.string().optional(),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "FREELANCE", "INTERNSHIP"]).nullable().optional(),
  jobLevel: z.enum(["INTERN", "JUNIOR", "MID", "SENIOR", "LEAD", "MANAGER", "DIRECTOR"]).nullable().optional(),
  payMin: z.number().positive().nullable().optional(),
  payMax: z.number().positive().nullable().optional(),
  payCurrency: z.enum(["INR", "USD"]).nullable().optional(),
  stages: z
    .array(z.object({ id: z.string().optional(), name: z.string().min(1), kras: z.array(z.string()).default([]) }))
    .optional(),
  skillIds: z.array(z.string()).optional(),
});

// ---- PATCH /jobs/:id ----
router.patch("/:id", allowRoles("ADMIN", "HR"), async (req, res) => {
  const parsed = updateJobSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid update payload" });

  const { stages, skillIds, ...jobData } = parsed.data;

  try {
    const job = await prisma.$transaction(async (tx) => {
      await tx.job.update({ where: { id: req.params.id }, data: jobData });
      if (stages) {
        await tx.pipelineStage.deleteMany({ where: { jobId: req.params.id } });
        await tx.pipelineStage.createMany({
          data: stages.map((s, i) => ({ jobId: req.params.id, order: i + 1, name: s.name, kras: s.kras })),
        });
      }
      if (skillIds !== undefined) {
        await tx.jobSkill.deleteMany({ where: { jobId: req.params.id } });
        if (skillIds.length > 0) {
          await tx.jobSkill.createMany({
            data: skillIds.map((skillId) => ({ jobId: req.params.id, skillId, proficiency: "INTERMEDIATE" })),
          });
        }
      }
      return tx.job.findUnique({
        where: { id: req.params.id },
        include: {
          stages: { orderBy: { order: "asc" } },
          skills: { include: { skill: true } },
        },
      });
    });
    res.json(job);
  } catch {
    res.status(404).json({ error: "Job not found" });
  }
});

// ---- PATCH /jobs/:id/archive ----
// The one soft-delete flag for Job — status (OPEN/CLOSED/ON_HOLD/DRAFT)
// keeps its lifecycle meaning; ARCHIVED stays in the JobStatus enum only
// for historical rows, nothing writes it going forward.
router.patch("/:id/archive", allowRoles("ADMIN", "HR"), async (req, res) => {
  try {
    const job = await prisma.job.update({
      where: { id: req.params.id },
      data: { archivedAt: new Date() },
      select: { id: true, title: true, archivedAt: true },
    });
    res.json(job);
  } catch {
    res.status(404).json({ error: "Job not found" });
  }
});

// ---- PATCH /jobs/:id/restore ----
router.patch("/:id/restore", allowRoles("ADMIN", "HR"), async (req, res) => {
  try {
    const job = await prisma.job.update({
      where: { id: req.params.id },
      data: { archivedAt: null },
      select: { id: true, title: true, archivedAt: true },
    });
    res.json(job);
  } catch {
    res.status(404).json({ error: "Job not found" });
  }
});

// ---- GET /jobs/:id/pipeline ----
router.get("/:id/pipeline", allowRoles("ADMIN", "HR", "MANAGER"), async (req, res) => {
  const stages = await prisma.pipelineStage.findMany({
    where: { jobId: req.params.id },
    orderBy: { order: "asc" },
  });
  res.json(stages);
});

export default router;
