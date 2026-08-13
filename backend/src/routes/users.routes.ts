import { Router } from "express";
import { z } from "zod";
import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { allowRoles } from "../middleware/rbac";
import { hashPassword } from "../utils/password";

const router = Router();
router.use(requireAuth, allowRoles("ADMIN"));

// ---- GET /users — paginated, filterable ----
router.get("/", async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1")));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"))));
  const search = String(req.query.search || "").trim();
  const roleFilter = String(req.query.role || "").trim();
  const status = String(req.query.status || "active");

  const where: any = {};

  if (status === "archived") {
    where.archivedAt = { not: null };
  } else {
    where.archivedAt = null;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }
  if (roleFilter) {
    where.role = roleFilter;
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true, name: true, email: true, role: true, roles: true,
        department: true, createdAt: true, archivedAt: true,
        _count: { select: { interviewsGiven: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  res.json({ data: users, total, page, limit });
});

// ---- GET /users/export — CSV download ----
router.get("/export", async (req, res) => {
  const search = String(req.query.search || "").trim();
  const roleFilter = String(req.query.role || "").trim();
  const status = String(req.query.status || "active");

  const where: any = {};
  if (status === "archived") { where.archivedAt = { not: null }; } else { where.archivedAt = null; }
  if (search) { where.OR = [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }]; }
  if (roleFilter) { where.role = roleFilter; }

  const users = await prisma.user.findMany({
    where,
    select: { id: true, name: true, email: true, role: true, roles: true, department: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const rows = users.map((u) => ({
    ID: u.id,
    Name: u.name,
    Email: u.email,
    "Primary Role": u.role,
    "All Roles": u.roles.join(", "),
    Department: u.department ?? "",
    "Created At": u.createdAt.toISOString(),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Users");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "csv" });

  res.setHeader("Content-Disposition", `attachment; filename="users.csv"`);
  res.setHeader("Content-Type", "text/csv");
  res.send(buf);
});

// ---- GET /users/:id — single user detail ----
router.get("/:id", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true, name: true, email: true, role: true, roles: true,
      department: true, createdAt: true, archivedAt: true,
      interviewsGiven: {
        include: {
          candidate: { select: { name: true } },
          job: { select: { title: true } },
          scorecard: { select: { recommendation: true } },
        },
        orderBy: { scheduledAt: "desc" },
        take: 50,
      },
      _count: { select: { interviewsGiven: true } },
    },
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "HR", "MANAGER", "INTERVIEWER"]),
  roles: z.array(z.enum(["ADMIN", "HR", "MANAGER", "INTERVIEWER"])).optional(),
  department: z.string().optional(),
});

// ---- POST /users ----
router.post("/", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid user payload" });

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return res.status(409).json({ error: "Email already in use" });

  const password = await hashPassword(parsed.data.password);
  const roles = parsed.data.roles?.length ? parsed.data.roles : [parsed.data.role];
  const user = await prisma.user.create({
    data: { ...parsed.data, password, roles },
    select: { id: true, name: true, email: true, role: true, roles: true, department: true },
  });
  res.status(201).json(user);
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(["ADMIN", "HR", "MANAGER", "INTERVIEWER"]).optional(),
  roles: z.array(z.enum(["ADMIN", "HR", "MANAGER", "INTERVIEWER"])).optional(),
  department: z.string().nullable().optional(),
});

// ---- PATCH /users/:id ----
router.patch("/:id", async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid update payload" });

  const update: any = { ...parsed.data };
  // Sync primary role to first element of roles array if roles changed
  if (parsed.data.roles?.length && !parsed.data.role) {
    update.role = parsed.data.roles[0];
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: update,
      select: { id: true, name: true, email: true, role: true, roles: true, department: true },
    });
    res.json(user);
  } catch {
    res.status(404).json({ error: "User not found" });
  }
});

// ---- PATCH /users/:id/archive ----
router.patch("/:id/archive", async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { archivedAt: new Date() },
      select: { id: true, name: true, archivedAt: true },
    });
    res.json(user);
  } catch {
    res.status(404).json({ error: "User not found" });
  }
});

// ---- PATCH /users/:id/restore ----
router.patch("/:id/restore", async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { archivedAt: null },
      select: { id: true, name: true, archivedAt: true },
    });
    res.json(user);
  } catch {
    res.status(404).json({ error: "User not found" });
  }
});

export default router;
