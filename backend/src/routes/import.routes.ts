import { Router } from "express";
import multer from "multer";
import { parse as parseCsv } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { allowRoles } from "../middleware/rbac";
import { hashPassword } from "../utils/password";
import { resolveOrCreateSkillIds } from "../lib/skills";

const router = Router();
router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function parseFile(buffer: Buffer, filename: string): Record<string, any>[] {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) {
    return parseCsv(buffer, { columns: true, skip_empty_lines: true, trim: true });
  }
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
}

// ---- GET /import/list — unified list of all import jobs ----
router.get("/list", allowRoles("ADMIN", "HR"), async (_req, res) => {
  const jobs = await prisma.importJob.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: { select: { name: true } },
      _count: { select: { rows: true } },
    },
  });
  res.json(jobs);
});

// ---- GET /import/:jobId — single import job detail ----
router.get("/:jobId", allowRoles("ADMIN", "HR"), async (req, res) => {
  const job = await prisma.importJob.findUnique({
    where: { id: req.params.jobId },
    include: { rows: { orderBy: { rowNumber: "asc" } } },
  });
  if (!job) return res.status(404).json({ error: "Import job not found" });
  res.json(job);
});

// ---- POST /import/candidates ----
const candidateRowSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  jobId: z.string().min(1),
  skills: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  experience: z.string().optional(),
});

router.post("/candidates", allowRoles("ADMIN", "HR"), upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded — attach a .csv or .xlsx file as 'file'." });

  let rawRows: Record<string, any>[];
  try {
    rawRows = parseFile(req.file.buffer, req.file.originalname);
  } catch (err: any) {
    return res.status(400).json({ error: `Could not parse file: ${err.message}` });
  }
  if (rawRows.length === 0) return res.status(400).json({ error: "File has no rows to import." });

  const importJob = await prisma.importJob.create({
    data: { uploadedById: req.user!.userId, fileName: req.file.originalname, type: "candidates", totalRows: rawRows.length, status: "PROCESSING" },
  });

  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const rowNumber = i + 2;
    const raw = rawRows[i];
    const parsed = candidateRowSchema.safeParse(raw);

    if (!parsed.success) {
      failureCount++;
      await prisma.importRow.create({ data: { jobId: importJob.id, rowNumber, rawData: raw, status: "FAILED", errorReason: parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ") } });
      continue;
    }

    try {
      const jobExists = await prisma.job.findUnique({ where: { id: parsed.data.jobId } });
      if (!jobExists) throw new Error(`No job found with id "${parsed.data.jobId}"`);

      const skillNames = parsed.data.skills ? parsed.data.skills.split(",").map((s) => s.trim()).filter(Boolean) : [];
      const skillIds = await resolveOrCreateSkillIds(skillNames);

      const candidate = await prisma.candidate.create({
        data: {
          name: parsed.data.name,
          email: parsed.data.email,
          jobId: parsed.data.jobId,
          phone: parsed.data.phone,
          location: parsed.data.location,
          experience: parsed.data.experience ? parseInt(parsed.data.experience) : undefined,
          skillLinks: skillIds.length ? { create: skillIds.map((skillId) => ({ skillId, proficiency: "INTERMEDIATE" })) } : undefined,
        },
      });

      successCount++;
      await prisma.importRow.create({ data: { jobId: importJob.id, rowNumber, rawData: raw, status: "IMPORTED", candidateId: candidate.id } });
    } catch (err: any) {
      failureCount++;
      await prisma.importRow.create({ data: { jobId: importJob.id, rowNumber, rawData: raw, status: "FAILED", errorReason: err.message } });
    }
  }

  const updated = await prisma.importJob.update({ where: { id: importJob.id }, data: { status: "COMPLETED", successCount, failureCount } });
  res.status(201).json(updated);
});

// Legacy route aliases kept for backwards compat
router.get("/candidates/:jobId", allowRoles("ADMIN", "HR"), async (req, res) => {
  const job = await prisma.importJob.findUnique({ where: { id: req.params.jobId }, include: { rows: { orderBy: { rowNumber: "asc" } } } });
  if (!job) return res.status(404).json({ error: "Import job not found" });
  res.json(job);
});
router.get("/candidates", allowRoles("ADMIN", "HR"), async (_req, res) => {
  const jobs = await prisma.importJob.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { rows: true } } } });
  res.json(jobs);
});

// ---- POST /import/users ----
const userRowSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  role: z.enum(["ADMIN", "HR", "MANAGER", "INTERVIEWER"]),
  department: z.string().optional(),
});

router.post("/users", allowRoles("ADMIN"), upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  let rawRows: Record<string, any>[];
  try {
    rawRows = parseFile(req.file.buffer, req.file.originalname);
  } catch (err: any) {
    return res.status(400).json({ error: `Could not parse file: ${err.message}` });
  }
  if (rawRows.length === 0) return res.status(400).json({ error: "File has no rows to import." });

  const importJob = await prisma.importJob.create({
    data: { uploadedById: req.user!.userId, fileName: req.file.originalname, type: "users", totalRows: rawRows.length, status: "PROCESSING" },
  });

  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const rowNumber = i + 2;
    const raw = rawRows[i];
    const parsed = userRowSchema.safeParse(raw);

    if (!parsed.success) {
      failureCount++;
      await prisma.importRow.create({ data: { jobId: importJob.id, rowNumber, rawData: raw, status: "FAILED", errorReason: parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ") } });
      continue;
    }

    try {
      const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
      if (existing) throw new Error(`Email "${parsed.data.email}" already in use`);

      const password = await hashPassword(parsed.data.password ?? "TalentFlow@2026");
      await prisma.user.create({
        data: {
          name: parsed.data.name,
          email: parsed.data.email,
          password,
          role: parsed.data.role,
          roles: [parsed.data.role],
          department: parsed.data.department,
        },
      });

      successCount++;
      await prisma.importRow.create({ data: { jobId: importJob.id, rowNumber, rawData: raw, status: "IMPORTED" } });
    } catch (err: any) {
      failureCount++;
      await prisma.importRow.create({ data: { jobId: importJob.id, rowNumber, rawData: raw, status: "FAILED", errorReason: err.message } });
    }
  }

  const updated = await prisma.importJob.update({ where: { id: importJob.id }, data: { status: "COMPLETED", successCount, failureCount } });
  res.status(201).json(updated);
});

export default router;
