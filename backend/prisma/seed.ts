import { PrismaClient, Role, JobStatus, CandidateStatus, InterviewStatus, Recommendation } from "@prisma/client";
import bcrypt from "bcryptjs";
import { skillsData } from "./skills-data";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const password = await bcrypt.hash("password123", 10);

  // ---- Feature flags ----
  await prisma.featureFlag.createMany({
    data: [
      { key: "voice_search_enabled", enabled: true },
      { key: "agent_actions_enabled", enabled: false },
      { key: "dashboard_charts_beta", enabled: true },
    ],
    skipDuplicates: true,
  });

  // ---- Users ----
  const admin = await prisma.user.create({
    data: { name: "Asha Rao", email: "admin@talentflow.dev", password, role: Role.ADMIN },
  });
  const hr = await prisma.user.create({
    data: { name: "Priya Menon", email: "hr@talentflow.dev", password, role: Role.HR, department: "Engineering" },
  });
  const manager = await prisma.user.create({
    data: { name: "Rahul Verma", email: "manager@talentflow.dev", password, role: Role.MANAGER, department: "Engineering" },
  });
  const interviewer1 = await prisma.user.create({
    data: { name: "Deepak Reddy", email: "interviewer@talentflow.dev", password, role: Role.INTERVIEWER, department: "Engineering" },
  });
  const interviewer2 = await prisma.user.create({
    data: { name: "Sneha Iyer", email: "interviewer2@talentflow.dev", password, role: Role.INTERVIEWER, department: "Engineering" },
  });

  // ---- Jobs with pipeline stages ----
  const sdeJob = await prisma.job.create({
    data: {
      title: "SDE - Frontend",
      department: "Engineering",
      status: JobStatus.OPEN,
      createdById: hr.id,
      stages: {
        create: [
          { order: 1, name: "Screening", kras: ["Communication", "Culture Fit"] },
          { order: 2, name: "Technical", kras: ["Problem Solving", "Code Quality"] },
          { order: 3, name: "System Design", kras: ["System Design", "Trade-off Reasoning"] },
        ],
      },
    },
    include: { stages: true },
  });

  const backendJob = await prisma.job.create({
    data: {
      title: "SDE - Backend",
      department: "Engineering",
      status: JobStatus.OPEN,
      createdById: hr.id,
      stages: {
        create: [
          { order: 1, name: "Screening", kras: ["Communication"] },
          { order: 2, name: "Technical", kras: ["Problem Solving", "Distributed Systems"] },
        ],
      },
    },
    include: { stages: true },
  });

  const designJob = await prisma.job.create({
    data: {
      title: "Product Designer",
      department: "Design",
      status: JobStatus.OPEN,
      createdById: hr.id,
      stages: {
        create: [
          { order: 1, name: "Portfolio Review", kras: ["Visual Design", "UX Reasoning"] },
          { order: 2, name: "Culture Fit", kras: ["Communication", "Culture Fit"] },
        ],
      },
    },
    include: { stages: true },
  });

  // ---- Skills Master (list lives in prisma/skills-data.ts) ----
  // Seeded before candidates so their skillLinks can reference real ids.
  await prisma.skill.createMany({ data: skillsData, skipDuplicates: true });
  console.log(`Seeded ${skillsData.length} skills.`);
  const allSkills = await prisma.skill.findMany({ select: { id: true, name: true } });
  const skillIdByName = new Map(allSkills.map((s) => [s.name, s.id]));
  const skillIds = (names: string[]) =>
    names.map((n) => skillIdByName.get(n)).filter((id): id is string => !!id);

  // ---- Candidates ----
  const candidateData: [string, string[], typeof sdeJob][] = [
    ["Alex Thomas", ["React", "TypeScript", "HTML/CSS"], sdeJob],
    ["Meera Nair", ["React", "Node.js", "GraphQL"], sdeJob],
    ["Vikram Shah", ["Java", "Spring Boot", "SQL"], backendJob],
    ["Kavya Pillai", ["Node.js", "PostgreSQL", "AWS"], backendJob],
    ["Rohan Gupta", ["Figma", "UX Research"], designJob],
    ["Ananya Krishnan", ["React", "TypeScript", "Redux"], sdeJob],
  ];

  const candidates = [];
  for (const [name, skillNames, job] of candidateData) {
    const c = await prisma.candidate.create({
      data: {
        name,
        email: `${name.toLowerCase().replace(" ", ".")}@example.com`,
        skillLinks: { create: skillIds(skillNames).map((skillId) => ({ skillId, proficiency: "INTERMEDIATE" })) },
        jobId: job.id,
        status: CandidateStatus.IN_PROCESS,
      },
    });
    candidates.push(c);
  }

  // ---- Interviews + scorecards (Alex fully cleared 2 rounds, Meera mid-pipeline, Vikram rejected) ----
  const alexRound1 = await prisma.interview.create({
    data: {
      candidateId: candidates[0].id,
      jobId: sdeJob.id,
      interviewerId: interviewer1.id,
      stageId: sdeJob.stages[0].id,
      round: 1,
      scheduledAt: new Date("2026-07-10T10:00:00Z"),
      status: InterviewStatus.CLEARED,
    },
  });
  await prisma.scorecard.create({
    data: {
      interviewId: alexRound1.id,
      recommendation: Recommendation.HIRE,
      kraRatings: { Communication: 4, "Culture Fit": 4 },
      notes: "Strong fundamentals, good communication.",
    },
  });

  const alexRound2 = await prisma.interview.create({
    data: {
      candidateId: candidates[0].id,
      jobId: sdeJob.id,
      interviewerId: interviewer2.id,
      stageId: sdeJob.stages[1].id,
      round: 2,
      scheduledAt: new Date("2026-07-15T10:00:00Z"),
      status: InterviewStatus.CLEARED,
    },
  });
  await prisma.scorecard.create({
    data: {
      interviewId: alexRound2.id,
      recommendation: Recommendation.STRONG_HIRE,
      kraRatings: { "Problem Solving": 5, "Code Quality": 4 },
      notes: "Solved the system design problem cleanly.",
    },
  });

  await prisma.interview.create({
    data: {
      candidateId: candidates[1].id,
      jobId: sdeJob.id,
      interviewerId: interviewer1.id,
      stageId: sdeJob.stages[0].id,
      round: 1,
      scheduledAt: new Date("2026-07-11T11:00:00Z"),
      status: InterviewStatus.CLEARED,
    },
  });
  await prisma.interview.create({
    data: {
      candidateId: candidates[1].id,
      jobId: sdeJob.id,
      interviewerId: interviewer2.id,
      stageId: sdeJob.stages[1].id,
      round: 2,
      scheduledAt: new Date("2026-07-16T11:00:00Z"),
      status: InterviewStatus.SCHEDULED,
    },
  });

  const vikramRound1 = await prisma.interview.create({
    data: {
      candidateId: candidates[2].id,
      jobId: backendJob.id,
      interviewerId: interviewer1.id,
      stageId: backendJob.stages[0].id,
      round: 1,
      scheduledAt: new Date("2026-07-12T09:00:00Z"),
      status: InterviewStatus.REJECTED,
    },
  });
  await prisma.scorecard.create({
    data: {
      interviewId: vikramRound1.id,
      recommendation: Recommendation.NO_HIRE,
      kraRatings: { Communication: 2 },
      notes: "Weak on distributed systems concepts.",
    },
  });
  await prisma.candidate.update({ where: { id: candidates[2].id }, data: { status: CandidateStatus.REJECTED } });

  // ---- Offer for the fully-cleared candidate ----
  await prisma.offer.create({
    data: { candidateId: candidates[0].id, jobId: sdeJob.id, salary: 1800000 },
  });

  // ---- Sample notifications ----
  await prisma.notification.createMany({
    data: [
      { userId: interviewer1.id, message: "You've been assigned round 1 for Kavya Pillai", link: "/interviews" },
      { userId: hr.id, message: "Alex Thomas — round 2 feedback: STRONG HIRE", link: "/candidates" },
      { userId: manager.id, message: "Offer awaiting your approval — Alex Thomas", link: "/offers" },
    ],
  });

  console.log("Seed complete.");
  console.log("Login with password123 for: admin@talentflow.dev, hr@talentflow.dev, manager@talentflow.dev, interviewer@talentflow.dev");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
