import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { comparePassword, hashPassword } from "../utils/password";
import { signToken } from "../utils/jwt";
import { requireAuth } from "../middleware/auth";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid email or password format" });
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  // Same generic error whether the email doesn't exist or the password is
  // wrong — don't leak which one it was.
  if (!user || !(await comparePassword(password, user.password))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = signToken({
    userId: user.id,
    role: user.role,
    department: user.department,
    name: user.name,
  });

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
    },
  });
});

// Lets the frontend re-derive "who am I" from a stored token on page load
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

router.patch("/change-password", requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user || !(await comparePassword(parsed.data.currentPassword, user.password))) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }

  const hashed = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
  res.json({ ok: true });
});

export default router;
