import { PrismaClient, Role, JobStatus, CandidateStatus, InterviewStatus, OfferStatus, Recommendation } from "@prisma/client";
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
  const hr2 = await prisma.user.create({
    data: { name: "Divya Krishnan", email: "hr2@talentflow.dev", password, role: Role.HR, department: "Design" },
  });
  const manager = await prisma.user.create({
    data: { name: "Rahul Verma", email: "manager@talentflow.dev", password, role: Role.MANAGER, department: "Engineering" },
  });
  const manager2 = await prisma.user.create({
    data: { name: "Nisha Bhatt", email: "manager2@talentflow.dev", password, role: Role.MANAGER, department: "Product" },
  });
  const interviewer1 = await prisma.user.create({
    data: { name: "Deepak Reddy", email: "interviewer@talentflow.dev", password, role: Role.INTERVIEWER, department: "Engineering" },
  });
  const interviewer2 = await prisma.user.create({
    data: { name: "Sneha Iyer", email: "interviewer2@talentflow.dev", password, role: Role.INTERVIEWER, department: "Engineering" },
  });
  const interviewer3 = await prisma.user.create({
    data: { name: "Arjun Nair", email: "interviewer3@talentflow.dev", password, role: Role.INTERVIEWER, department: "Design" },
  });
  const interviewer4 = await prisma.user.create({
    data: { name: "Fatima Sheikh", email: "interviewer4@talentflow.dev", password, role: Role.INTERVIEWER, department: "Data" },
  });

  // ---- Jobs with pipeline stages ----
  const sdeJob = await prisma.job.create({
    data: {
      title: "SDE - Frontend",
      department: "Engineering",
      status: JobStatus.OPEN,
      employmentType: "FULL_TIME",
      jobLevel: "MID",
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
      employmentType: "FULL_TIME",
      jobLevel: "MID",
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
      employmentType: "FULL_TIME",
      jobLevel: "SENIOR",
      createdById: hr2.id,
      stages: {
        create: [
          { order: 1, name: "Portfolio Review", kras: ["Visual Design", "UX Reasoning"] },
          { order: 2, name: "Culture Fit", kras: ["Communication", "Culture Fit"] },
        ],
      },
    },
    include: { stages: true },
  });

  const seniorBackendJob = await prisma.job.create({
    data: {
      title: "Senior Backend Engineer",
      department: "Engineering",
      status: JobStatus.OPEN,
      employmentType: "FULL_TIME",
      jobLevel: "SENIOR",
      createdById: hr.id,
      stages: {
        create: [
          { order: 1, name: "Screening", kras: ["Communication"] },
          { order: 2, name: "Technical", kras: ["Problem Solving", "Distributed Systems"] },
          { order: 3, name: "System Design", kras: ["System Design"] },
        ],
      },
    },
    include: { stages: true },
  });

  const devOpsJob = await prisma.job.create({
    data: {
      title: "DevOps Engineer",
      department: "Engineering",
      status: JobStatus.OPEN,
      employmentType: "FULL_TIME",
      jobLevel: "MID",
      createdById: hr.id,
      stages: {
        create: [
          { order: 1, name: "Screening", kras: ["Communication"] },
          { order: 2, name: "Technical", kras: ["System Design", "Problem Solving"] },
        ],
      },
    },
    include: { stages: true },
  });

  const qaJob = await prisma.job.create({
    data: {
      title: "QA Engineer",
      department: "Engineering",
      status: JobStatus.OPEN,
      employmentType: "FULL_TIME",
      jobLevel: "JUNIOR",
      createdById: hr.id,
      stages: {
        create: [
          { order: 1, name: "Screening", kras: ["Communication"] },
          { order: 2, name: "Technical", kras: ["Attention to Detail", "Problem Solving"] },
        ],
      },
    },
    include: { stages: true },
  });

  const emJob = await prisma.job.create({
    data: {
      title: "Engineering Manager",
      department: "Engineering",
      status: JobStatus.ON_HOLD,
      employmentType: "FULL_TIME",
      jobLevel: "LEAD",
      createdById: hr.id,
      stages: {
        create: [
          { order: 1, name: "Screening", kras: ["Communication"] },
          { order: 2, name: "Leadership Panel", kras: ["Leadership", "Mentoring"] },
        ],
      },
    },
    include: { stages: true },
  });

  const dataScientistJob = await prisma.job.create({
    data: {
      title: "Data Scientist",
      department: "Data",
      status: JobStatus.OPEN,
      employmentType: "FULL_TIME",
      jobLevel: "MID",
      createdById: hr.id,
      stages: {
        create: [
          { order: 1, name: "Screening", kras: ["Communication"] },
          { order: 2, name: "Technical", kras: ["Problem Solving"] },
          { order: 3, name: "Case Study", kras: ["Critical Thinking"] },
        ],
      },
    },
    include: { stages: true },
  });

  const dataAnalystJob = await prisma.job.create({
    data: {
      title: "Data Analyst",
      department: "Data",
      status: JobStatus.OPEN,
      employmentType: "FULL_TIME",
      jobLevel: "JUNIOR",
      createdById: hr.id,
      stages: {
        create: [
          { order: 1, name: "Screening", kras: ["Communication"] },
          { order: 2, name: "Technical", kras: ["Attention to Detail"] },
        ],
      },
    },
    include: { stages: true },
  });

  const pmJob = await prisma.job.create({
    data: {
      title: "Product Manager",
      department: "Product",
      status: JobStatus.OPEN,
      employmentType: "FULL_TIME",
      jobLevel: "SENIOR",
      createdById: hr2.id,
      stages: {
        create: [
          { order: 1, name: "Screening", kras: ["Communication"] },
          { order: 2, name: "Product Sense", kras: ["Critical Thinking", "Decision Making"] },
          { order: 3, name: "Culture Fit", kras: ["Culture Fit"] },
        ],
      },
    },
    include: { stages: true },
  });

  const salesJob = await prisma.job.create({
    data: {
      title: "Sales Executive",
      department: "Sales",
      status: JobStatus.OPEN,
      employmentType: "FULL_TIME",
      jobLevel: "MID",
      createdById: hr2.id,
      stages: {
        create: [
          { order: 1, name: "Screening", kras: ["Communication"] },
          { order: 2, name: "Role Play", kras: ["Negotiation"] },
        ],
      },
    },
    include: { stages: true },
  });

  const marketingJob = await prisma.job.create({
    data: {
      title: "Marketing Specialist",
      department: "Marketing",
      status: JobStatus.DRAFT,
      employmentType: "FULL_TIME",
      jobLevel: "JUNIOR",
      createdById: hr2.id,
      stages: {
        create: [
          { order: 1, name: "Screening", kras: ["Communication"] },
          { order: 2, name: "Portfolio Review", kras: ["Creativity"] },
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

  const LOCATIONS = [
    "Bengaluru, Karnataka", "Mumbai, Maharashtra", "Pune, Maharashtra", "Hyderabad, Telangana",
    "Chennai, Tamil Nadu", "Delhi NCR", "Kochi, Kerala", "Ahmedabad, Gujarat",
  ];

  interface CandidateSeed {
    name: string;
    skills: string[];
    job: typeof sdeJob;
    status?: CandidateStatus;
    experience?: number;
  }

  // ---- Candidates ----
  // First three drive the hand-crafted interview/scorecard narrative below
  // (Alex fully cleared, Meera mid-pipeline, Vikram rejected) — kept as
  // explicit variables. Everything after is broader coverage across every
  // job/department so list/grid/table views have enough volume to actually
  // demonstrate pagination and infinite scroll.
  const candidateSeeds: CandidateSeed[] = [
    { name: "Alex Thomas", skills: ["React", "TypeScript", "HTML/CSS"], job: sdeJob, experience: 4 },
    { name: "Meera Nair", skills: ["React", "Node.js", "GraphQL"], job: sdeJob, experience: 3 },
    { name: "Vikram Shah", skills: ["Java", "Spring Boot", "SQL"], job: backendJob, experience: 5 },
    { name: "Kavya Pillai", skills: ["Node.js", "PostgreSQL", "AWS"], job: backendJob, experience: 6 },
    { name: "Rohan Gupta", skills: ["Figma", "UX Research"], job: designJob, experience: 4 },
    { name: "Ananya Krishnan", skills: ["React", "TypeScript", "Redux"], job: sdeJob, experience: 2 },
    { name: "Siddharth Menon", skills: ["React", "Next.js", "Tailwind CSS"], job: sdeJob, experience: 3, status: CandidateStatus.APPLIED },
    { name: "Priyanka Das", skills: ["Vue.js", "JavaScript", "HTML/CSS"], job: sdeJob, experience: 2, status: CandidateStatus.APPLIED },
    { name: "Arnav Kapoor", skills: ["Angular", "TypeScript"], job: sdeJob, experience: 5, status: CandidateStatus.OFFERED },
    { name: "Ishita Rao", skills: ["React Native", "Flutter"], job: sdeJob, experience: 3, status: CandidateStatus.IN_PROCESS },
    { name: "Karan Malhotra", skills: ["Python", "Django", "PostgreSQL"], job: backendJob, experience: 4, status: CandidateStatus.APPLIED },
    { name: "Tanvi Joshi", skills: ["Go", "Microservices", "Docker"], job: backendJob, experience: 6, status: CandidateStatus.IN_PROCESS },
    { name: "Aditya Kulkarni", skills: ["Node.js", "Express.js", "MongoDB"], job: backendJob, experience: 3, status: CandidateStatus.APPLIED },
    { name: "Riya Sharma", skills: ["Java", "Message Queues (Kafka/RabbitMQ)"], job: backendJob, experience: 5, status: CandidateStatus.REJECTED },
    { name: "Manish Agarwal", skills: ["Spring Boot", "SQL", "REST API Design"], job: seniorBackendJob, experience: 8, status: CandidateStatus.IN_PROCESS },
    { name: "Neha Choudhary", skills: ["Distributed Systems", "System Design", "Go"], job: seniorBackendJob, experience: 9, status: CandidateStatus.IN_PROCESS },
    { name: "Varun Reddy", skills: ["Microservices", "Kubernetes", "AWS"], job: seniorBackendJob, experience: 7, status: CandidateStatus.APPLIED },
    { name: "Pooja Iyer", skills: ["Docker", "Kubernetes", "Terraform"], job: devOpsJob, experience: 5, status: CandidateStatus.IN_PROCESS },
    { name: "Sameer Khan", skills: ["AWS", "CI/CD", "Terraform"], job: devOpsJob, experience: 4, status: CandidateStatus.APPLIED },
    { name: "Divya Nambiar", skills: ["Linux", "Docker", "GCP"], job: devOpsJob, experience: 3, status: CandidateStatus.APPLIED },
    { name: "Harsh Vardhan", skills: ["Selenium", "Test Automation", "Jest"], job: qaJob, experience: 2, status: CandidateStatus.APPLIED },
    { name: "Ritika Bansal", skills: ["Cypress", "Playwright", "Postman"], job: qaJob, experience: 3, status: CandidateStatus.IN_PROCESS },
    { name: "Yash Trivedi", skills: ["JUnit", "Performance Testing"], job: qaJob, experience: 4, status: CandidateStatus.APPLIED },
    { name: "Anjali Deshmukh", skills: ["Leadership", "Mentoring", "System Design"], job: emJob, experience: 10, status: CandidateStatus.IN_PROCESS },
    { name: "Rajeev Menon", skills: ["Leadership", "Project Management", "Agile / Scrum"], job: emJob, experience: 11, status: CandidateStatus.APPLIED },
    { name: "Swati Kulkarni", skills: ["Machine Learning", "Python", "TensorFlow"], job: dataScientistJob, experience: 5, status: CandidateStatus.IN_PROCESS },
    { name: "Abhishek Pandey", skills: ["Machine Learning", "PyTorch", "Data Analysis"], job: dataScientistJob, experience: 4, status: CandidateStatus.APPLIED },
    { name: "Nikita Sinha", skills: ["Apache Spark", "Python", "SQL"], job: dataScientistJob, experience: 6, status: CandidateStatus.OFFERED },
    { name: "Faisal Ahmed", skills: ["Data Analysis", "SQL", "Tableau"], job: dataAnalystJob, experience: 2, status: CandidateStatus.APPLIED },
    { name: "Sonal Kapoor", skills: ["Power BI", "SQL", "Data Analysis"], job: dataAnalystJob, experience: 3, status: CandidateStatus.IN_PROCESS },
    { name: "Gaurav Saxena", skills: ["Product Management", "Strategic Planning"], job: pmJob, experience: 6, status: CandidateStatus.IN_PROCESS },
    { name: "Lakshmi Venkatesh", skills: ["Product Management", "Stakeholder Management", "OKR Setting"], job: pmJob, experience: 8, status: CandidateStatus.APPLIED },
    { name: "Rahul Bose", skills: ["Negotiation", "Communication"], job: salesJob, experience: 3, status: CandidateStatus.APPLIED },
    { name: "Meenakshi Iyer", skills: ["Negotiation", "Customer Success"], job: salesJob, experience: 5, status: CandidateStatus.IN_PROCESS },
    { name: "Devansh Chawla", skills: ["Digital Marketing", "SEO / SEM"], job: marketingJob, experience: 2, status: CandidateStatus.APPLIED },
    { name: "Ayesha Khan", skills: ["Creativity", "Digital Marketing"], job: designJob, experience: 3, status: CandidateStatus.APPLIED },
    { name: "Vivek Rathore", skills: ["Sketch", "Adobe XD", "UX Research"], job: designJob, experience: 4, status: CandidateStatus.IN_PROCESS },
    { name: "Shreya Pillai", skills: ["Figma", "Creativity", "Presentation Skills"], job: designJob, experience: 2, status: CandidateStatus.HIRED },
  ];

  const candidates = [];
  for (let i = 0; i < candidateSeeds.length; i++) {
    const seed = candidateSeeds[i];
    const c = await prisma.candidate.create({
      data: {
        name: seed.name,
        email: `${seed.name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
        location: LOCATIONS[i % LOCATIONS.length],
        experience: seed.experience,
        skillLinks: { create: skillIds(seed.skills).map((skillId) => ({ skillId, proficiency: "INTERMEDIATE" })) },
        jobId: seed.job.id,
        status: seed.status ?? CandidateStatus.IN_PROCESS,
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

  // ---- Broader interview coverage — one or two rounds each for a spread
  // of the newly-added candidates, across every interviewer and a mix of
  // statuses, so the Interviews table has enough rows to actually paginate.
  const interviewers = [interviewer1, interviewer2, interviewer3, interviewer4];
  const interviewStatuses: InterviewStatus[] = [
    InterviewStatus.SCHEDULED, InterviewStatus.SCHEDULED, InterviewStatus.CLEARED,
    InterviewStatus.CLEARED, InterviewStatus.REJECTED, InterviewStatus.NO_SHOW,
  ];
  let interviewDay = 20;
  for (let i = 6; i < candidateSeeds.length; i++) {
    const seed = candidateSeeds[i];
    const candidate = candidates[i];
    const job = seed.job;
    const stage = job.stages[0];
    const interviewer = interviewers[i % interviewers.length];
    const status = interviewStatuses[i % interviewStatuses.length];
    interviewDay += 1;
    const hour = String(9 + (i % 6)).padStart(2, "0");
    const scheduledAt = new Date(`2026-07-${String(Math.min(interviewDay, 28)).padStart(2, "0")}T${hour}:00:00Z`);
    const interview = await prisma.interview.create({
      data: {
        candidateId: candidate.id,
        jobId: job.id,
        interviewerId: interviewer.id,
        stageId: stage.id,
        round: 1,
        scheduledAt,
        status,
      },
    });
    if (status === InterviewStatus.CLEARED || status === InterviewStatus.REJECTED) {
      await prisma.scorecard.create({
        data: {
          interviewId: interview.id,
          recommendation: status === InterviewStatus.CLEARED ? Recommendation.HIRE : Recommendation.NO_HIRE,
          kraRatings: { Communication: status === InterviewStatus.CLEARED ? 4 : 2 },
          notes: status === InterviewStatus.CLEARED ? "Solid round overall." : "Did not meet the bar for this round.",
        },
      });
    }
  }

  // ---- Offers — a spread of statuses across several candidates ----
  await prisma.offer.create({
    data: { candidateId: candidates[0].id, jobId: sdeJob.id, salary: 1800000, status: OfferStatus.SENT },
  });
  const offerCandidateIdxByStatus: [number, OfferStatus, number][] = [
    // candidate index (into candidateSeeds), status, salary
    [8, OfferStatus.SENT, 2200000],   // Arnav Kapoor — OFFERED
    [27, OfferStatus.SENT, 2600000],  // Nikita Sinha — OFFERED
    [36, OfferStatus.ACCEPTED, 1500000], // Shreya Pillai — HIRED
    [14, OfferStatus.DRAFT, 3200000], // Manish Agarwal — senior backend
    [22, OfferStatus.DRAFT, 1400000], // Ritika Bansal — QA
    [29, OfferStatus.DECLINED, 2400000], // Sonal Kapoor — data analyst
    [1, OfferStatus.DRAFT, 1900000],  // Meera Nair
  ];
  for (const [idx, status, salary] of offerCandidateIdxByStatus) {
    const candidate = candidates[idx];
    const seed = candidateSeeds[idx];
    await prisma.offer.create({
      data: { candidateId: candidate.id, jobId: seed.job.id, salary, status },
    });
  }

  // ---- Sample notifications ----
  await prisma.notification.createMany({
    data: [
      { userId: interviewer1.id, message: "You've been assigned round 1 for Kavya Pillai", link: "/interviews" },
      { userId: hr.id, message: "Alex Thomas — round 2 feedback: STRONG HIRE", link: "/candidates" },
      { userId: manager.id, message: "Offer awaiting your approval — Alex Thomas", link: "/offers" },
    ],
  });

  console.log(`Seeded ${candidateSeeds.length} candidates across 12 jobs.`);
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
