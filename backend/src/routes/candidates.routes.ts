import { Router } from "express";
import { z } from "zod";
import * as XLSX from "xlsx";
import multer from "multer";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { allowRoles } from "../middleware/rbac";

const router = Router();
router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ---- GET /candidates — paginated, filterable ----
router.get("/", allowRoles("ADMIN", "HR", "MANAGER"), async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1")));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"))));
  const search = String(req.query.search || "").trim();
  const statusFilter = String(req.query.status || "").trim();
  const jobId = String(req.query.jobId || "").trim();
  // Renamed from the old free-text `skill` param (which did an exact-string
  // array-contains match against the legacy skills column) now that skills
  // are a governed relation — filter by the master skill's id instead.
  const skillId = String(req.query.skillId || "").trim();
  const skillCategory = String(req.query.skillCategory || "").trim();
  const archiveState = String(req.query.archived || "active");

  const where: any = { archivedAt: archiveState === "archived" ? { not: null } : null };
  if (req.user!.role === "MANAGER" && req.user!.department) {
    where.job = { department: req.user!.department };
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }
  if (statusFilter) where.status = statusFilter;
  if (jobId) where.jobId = jobId;
  if (skillId || skillCategory) {
    where.skillLinks = {
      some: {
        ...(skillId ? { skillId } : {}),
        ...(skillCategory ? { skill: { category: skillCategory } } : {}),
      },
    };
  }

  const [candidates, total] = await Promise.all([
    prisma.candidate.findMany({
      where,
      include: {
        job: { select: { title: true, department: true } },
        skillLinks: { include: { skill: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.candidate.count({ where }),
  ]);

  res.json({ data: candidates, total, page, limit });
});

// ---- GET /candidates/export — CSV download ----
router.get("/export", allowRoles("ADMIN", "HR", "MANAGER"), async (req, res) => {
  const search = String(req.query.search || "").trim();
  const statusFilter = String(req.query.status || "").trim();
  const jobId = String(req.query.jobId || "").trim();

  const where: any = { archivedAt: null };
  if (req.user!.role === "MANAGER" && req.user!.department) where.job = { department: req.user!.department };
  if (search) where.OR = [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }];
  if (statusFilter) where.status = statusFilter;
  if (jobId) where.jobId = jobId;

  const candidates = await prisma.candidate.findMany({
    where,
    include: { job: { select: { title: true } }, skillLinks: { include: { skill: true } } },
    orderBy: { createdAt: "desc" },
  });

  const rows = candidates.map((c) => ({
    ID: c.id,
    Name: c.name,
    Email: c.email,
    Phone: c.phone ?? "",
    Location: c.location ?? "",
    "Experience (yrs)": c.experience ?? "",
    Skills: c.skillLinks.map((sl) => sl.skill.name).join(", "),
    "Job Applied": c.job?.title ?? "",
    Status: c.status,
    "Created At": c.createdAt.toISOString(),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Candidates");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "csv" });
  res.setHeader("Content-Disposition", `attachment; filename="candidates.csv"`);
  res.setHeader("Content-Type", "text/csv");
  res.send(buf);
});

// ---- GET /candidates/:id ----
router.get("/:id", allowRoles("ADMIN", "HR", "MANAGER"), async (req, res) => {
  const candidate = await prisma.candidate.findUnique({
    where: { id: req.params.id },
    include: {
      job: true,
      skillLinks: { include: { skill: true }, orderBy: { skill: { name: "asc" } } },
      interviews: {
        include: {
          scorecard: true,
          stage: true,
          interviewer: { select: { name: true } },
        },
        orderBy: { round: "asc" },
      },
      offer: true,
    },
  });
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });
  res.json(candidate);
});

const createCandidateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  jobId: z.string().min(1),
  skillIds: z.array(z.string()).default([]),
  phone: z.string().optional(),
  location: z.string().optional(),
  experience: z.number().int().min(0).optional(),
  linkedinUrl: z.string().url().optional().or(z.literal("")),
  portfolioUrl: z.string().url().optional().or(z.literal("")),
});

// ---- POST /candidates ----
router.post("/", allowRoles("ADMIN", "HR"), async (req, res) => {
  const parsed = createCandidateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid candidate payload" });
  const { skillIds, ...fields } = parsed.data;
  const candidate = await prisma.candidate.create({
    data: {
      ...fields,
      skillLinks: skillIds.length ? { create: skillIds.map((skillId) => ({ skillId, proficiency: "INTERMEDIATE" })) } : undefined,
    },
    include: { skillLinks: { include: { skill: true } } },
  });
  res.status(201).json(candidate);
});

const updateCandidateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  experience: z.number().int().min(0).optional(),
  skillIds: z.array(z.string()).optional(),
  status: z.enum(["APPLIED", "IN_PROCESS", "OFFERED", "HIRED", "REJECTED"]).optional(),
  linkedinUrl: z.string().optional(),
  portfolioUrl: z.string().optional(),
  education: z.any().optional(),
  projects: z.any().optional(),
});

// ---- PATCH /candidates/:id ----
router.patch("/:id", allowRoles("ADMIN", "HR"), async (req, res) => {
  const parsed = updateCandidateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid update payload" });
  const { skillIds, ...fields } = parsed.data;
  try {
    const candidate = await prisma.$transaction(async (tx) => {
      await tx.candidate.update({ where: { id: req.params.id }, data: fields });
      if (skillIds !== undefined) {
        await tx.candidateSkill.deleteMany({ where: { candidateId: req.params.id } });
        if (skillIds.length > 0) {
          await tx.candidateSkill.createMany({
            data: skillIds.map((skillId) => ({ candidateId: req.params.id, skillId, proficiency: "INTERMEDIATE" })),
          });
        }
      }
      return tx.candidate.findUnique({
        where: { id: req.params.id },
        include: { skillLinks: { include: { skill: true } } },
      });
    });
    res.json(candidate);
  } catch {
    res.status(404).json({ error: "Candidate not found" });
  }
});

// ---- PATCH /candidates/:id/archive ----
router.patch("/:id/archive", allowRoles("ADMIN", "HR"), async (req, res) => {
  try {
    const candidate = await prisma.candidate.update({
      where: { id: req.params.id },
      data: { archivedAt: new Date() },
      select: { id: true, name: true, archivedAt: true },
    });
    res.json(candidate);
  } catch {
    res.status(404).json({ error: "Candidate not found" });
  }
});

// ---- PATCH /candidates/:id/restore ----
router.patch("/:id/restore", allowRoles("ADMIN", "HR"), async (req, res) => {
  try {
    const candidate = await prisma.candidate.update({
      where: { id: req.params.id },
      data: { archivedAt: null },
      select: { id: true, name: true, archivedAt: true },
    });
    res.json(candidate);
  } catch {
    res.status(404).json({ error: "Candidate not found" });
  }
});

// ---- POST /candidates/:id/upload-resume — file upload ----
router.post("/:id/upload-resume", allowRoles("ADMIN", "HR"), upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const filename = `${req.params.id}_${req.file.originalname}`;
  try {
    const candidate = await prisma.candidate.update({
      where: { id: req.params.id },
      data: { resumeUrl: filename },
      select: { id: true, resumeUrl: true },
    });
    res.json(candidate);
  } catch {
    res.status(404).json({ error: "Candidate not found" });
  }
});

// ---- GET /candidates/:id/debrief ----
router.get("/:id/debrief", allowRoles("ADMIN", "HR", "MANAGER"), async (req, res) => {
  const candidate = await prisma.candidate.findUnique({
    where: { id: req.params.id },
    include: {
      job: { include: { stages: { orderBy: { order: "asc" } } } },
      interviews: {
        include: { scorecard: true, stage: true, interviewer: { select: { name: true } } },
        orderBy: { round: "asc" },
      },
      offer: true,
    },
  });
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });
  res.json(candidate);
});

export default router;
