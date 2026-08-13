import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

/**
 * Stats are scoped per role rather than gated by allowRoles — an
 * Interviewer gets a personal view (their upcoming interviews, pending
 * feedback), while Admin/HR/Manager get the company-wide funnel. Manager
 * is additionally scoped to their department, same pattern as every other
 * route in this app.
 */
router.get("/stats", async (req, res) => {
  const { role, userId, department } = req.user!;

  if (role === "INTERVIEWER") {
    const [upcoming, pendingFeedback, completed] = await Promise.all([
      prisma.interview.count({
        where: { interviewerId: userId, status: "SCHEDULED", scheduledAt: { gte: new Date() } },
      }),
      prisma.interview.count({ where: { interviewerId: userId, status: "SCHEDULED", scheduledAt: { lt: new Date() } } }),
      prisma.interview.count({ where: { interviewerId: userId, status: { in: ["CLEARED", "REJECTED"] } } }),
    ]);
    return res.json({ scope: "personal", upcoming, pendingFeedback, completed });
  }

  const jobWhere = role === "MANAGER" && department ? { department } : {};

  const [candidatesByStatus, interviewsByStatus, jobs, offers] = await Promise.all([
    prisma.candidate.groupBy({
      by: ["status"],
      _count: true,
      where: { job: jobWhere },
    }),
    prisma.interview.groupBy({
      by: ["status"],
      _count: true,
      where: { job: jobWhere },
    }),
    prisma.job.findMany({
      where: jobWhere,
      include: { _count: { select: { candidates: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.offer.groupBy({
      by: ["status"],
      _count: true,
      where: { job: jobWhere },
    }),
  ]);

  // "Top ongoing hiring processes" — open jobs ranked by active candidate count
  const topJobs = jobs
    .filter((j) => j.status === "OPEN")
    .sort((a, b) => b._count.candidates - a._count.candidates)
    .slice(0, 6)
    .map((j) => ({ id: j.id, title: j.title, department: j.department, candidateCount: j._count.candidates }));

  res.json({
    scope: "company",
    candidatesByStatus,
    interviewsByStatus,
    offersByStatus: offers,
    topJobs,
    openJobCount: jobs.filter((j) => j.status === "OPEN").length,
  });
});

export default router;
