import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { allowRoles } from "../middleware/rbac";

const router = Router();
router.use(requireAuth);

// ---- GET /skills — paginated, optionally filtered by category ----
// The Skills Master page is a "browse everything in this category" chip
// cloud, not a page-by-page table, so it requests a generous limit (up to
// 200) per tab rather than paging through — this envelope just brings the
// route in line with every other list route's {data,total,page,limit}
// shape so the frontend/agent tooling doesn't need a special case.
router.get("/", async (req, res) => {
  const category = String(req.query.category || "").trim();
  const search = String(req.query.search || "").trim();
  const page = Math.max(1, parseInt(String(req.query.page || "1")));
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || "200"))));

  const where: any = {
    ...(category ? { category: category as any } : {}),
    ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
  };

  const [skills, total] = await Promise.all([
    prisma.skill.findMany({
      where,
      orderBy: [{ category: "asc" }, { name: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.skill.count({ where }),
  ]);

  res.json({ data: skills, total, page, limit });
});

// ---- GET /skills/:id ----
router.get("/:id", async (req, res) => {
  const skill = await prisma.skill.findUnique({ where: { id: req.params.id } });
  if (!skill) return res.status(404).json({ error: "Skill not found" });
  res.json(skill);
});

const createSkillSchema = z.object({
  name: z.string().min(1),
  category: z.enum(["TECHNICAL", "HUMAN", "MANAGEMENT", "DOMAIN"]),
  description: z.string().optional(),
});

// ---- POST /skills — Admin only ----
router.post("/", allowRoles("ADMIN"), async (req, res) => {
  const parsed = createSkillSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid skill payload" });

  try {
    const skill = await prisma.skill.create({ data: parsed.data });
    res.status(201).json(skill);
  } catch {
    res.status(409).json({ error: "A skill with that name already exists" });
  }
});

const updateSkillSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.enum(["TECHNICAL", "HUMAN", "MANAGEMENT", "DOMAIN"]).optional(),
  description: z.string().optional(),
});

// ---- PATCH /skills/:id — Admin only ----
router.patch("/:id", allowRoles("ADMIN"), async (req, res) => {
  const parsed = updateSkillSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid update payload" });

  try {
    const skill = await prisma.skill.update({ where: { id: req.params.id }, data: parsed.data });
    res.json(skill);
  } catch {
    res.status(404).json({ error: "Skill not found" });
  }
});

// ---- DELETE /skills/:id — Admin only ----
router.delete("/:id", allowRoles("ADMIN"), async (req, res) => {
  try {
    await prisma.skill.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    // P2025 = record to delete not found; P2003 = FK constraint (still
    // referenced by a JobSkill/CandidateSkill row) — these are different
    // problems and were previously both reported as a misleading 404.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return res.status(409).json({ error: "Skill is in use by a job or candidate and can't be deleted" });
    }
    res.status(404).json({ error: "Skill not found" });
  }
});

export default router;
