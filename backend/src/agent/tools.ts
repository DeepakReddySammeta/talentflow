import { prisma } from "../lib/prisma";
import { JwtPayload } from "../types";
import { Role, Prisma } from "@prisma/client";
import { resolveOrCreateSkillIds } from "../lib/skills";
import { hashPassword } from "../utils/password";

/**
 * Agent tools.
 *
 * IMPORTANT: every tool takes `caller` and applies its own scoping based on
 * caller.role — this is the enforcement layer described in the HLD/LLD doc.
 * The agent choosing which tool to call is not what keeps data safe; these
 * functions are. Even if the LLM were tricked into requesting a broader
 * query, the WHERE clause below would still narrow it.
 */

// Write-capable tools are never auto-executed by the orchestrator loop —
// see agent/orchestrator.ts. They're proposed (stored as a PendingAction)
// and only actually run when the user explicitly confirms, and confirming
// re-executes the arguments WE stored, never whatever a client might send.
export const WRITE_TOOLS = new Set([
  "schedule_interview",
  "create_job",
  "update_job",
  "archive_job",
  "restore_job",
  "create_candidate",
  "update_candidate",
  "archive_candidate",
  "restore_candidate",
  "reschedule_interview",
  "submit_scorecard",
  "archive_interview",
  "restore_interview",
  "create_offer",
  "update_offer",
  "approve_offer",
  "archive_offer",
  "restore_offer",
  "create_skill",
  "update_skill",
  "delete_skill",
  "create_user",
  "update_user",
  "archive_user",
  "restore_user",
]);

const JOB_STATUS_ENUM = ["OPEN", "CLOSED", "ON_HOLD", "DRAFT", null];
const EMPLOYMENT_TYPE_ENUM = ["FULL_TIME", "PART_TIME", "CONTRACT", "FREELANCE", "INTERNSHIP", null];
const JOB_LEVEL_ENUM = ["INTERN", "JUNIOR", "MID", "SENIOR", "LEAD", "MANAGER", "DIRECTOR", null];
const PAY_CURRENCY_ENUM = ["INR", "USD", null];
const CANDIDATE_STATUS_ENUM = ["APPLIED", "IN_PROCESS", "OFFERED", "HIRED", "REJECTED", null];

export function getToolDefinitionsForRole(role: Role) {
  const definitions: any[] = [
    {
      name: "search_interviews",
      description:
        "Search interviews by job, round number, and status, or look up a single one by id. Use " +
        "this to answer questions like 'who cleared round 2 for the SDE role' — call search_jobs " +
        "first to resolve the job title to a jobId.",
      parametersJsonSchema: {
        type: "object",
        properties: {
          interviewId: { type: ["string", "null"] },
          jobId: { type: ["string", "null"] },
          round: { type: ["number", "null"] },
          status: { type: ["string", "null"], enum: ["SCHEDULED", "CLEARED", "REJECTED", "NO_SHOW", null] },
          archived: {
            type: ["string", "null"],
            enum: ["active", "archived", null],
            description: "Defaults to active (non-archived) interviews only.",
          },
        },
      },
    },
    {
      // Open to every role — GET /skills has no allowRoles gate either;
      // the master skill list is reference data, not access-restricted.
      name: "search_skills",
      description: "Search the skill master list by category and/or name.",
      parametersJsonSchema: {
        type: "object",
        properties: {
          category: { type: ["string", "null"], enum: ["TECHNICAL", "HUMAN", "MANAGEMENT", "DOMAIN", null] },
          search: { type: ["string", "null"], description: "Partial skill name to match" },
        },
      },
    },
  ];

  // Jobs/Candidates data (and derived profile detail) mirrors the REST RBAC
  // on GET /jobs and GET /candidates (allowRoles ADMIN, HR, MANAGER) — an
  // Interviewer can't reach these via the UI/REST, so the chat agent must
  // not offer a side-channel to the same data.
  if (role !== "INTERVIEWER") {
    definitions.push(
      {
        name: "search_jobs",
        description: "Search job openings by title or department.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            title: { type: ["string", "null"], description: "Partial or full job title to match" },
            department: { type: ["string", "null"], description: "Department name to filter by" },
            status: {
              type: ["string", "null"],
              enum: ["active", "archived", null],
              description: "Defaults to active (non-archived) jobs only.",
            },
          },
        },
      },
      {
        name: "search_candidates",
        description: "Search candidates by name, skill, or the job they applied for.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            name: { type: ["string", "null"] },
            skill: { type: ["string", "null"], description: "A single skill to filter by, e.g. React" },
            jobId: { type: ["string", "null"] },
            status: {
              type: ["string", "null"],
              enum: ["active", "archived", null],
              description: "Defaults to active (non-archived) candidates only.",
            },
            sortBy: {
              type: ["string", "null"],
              enum: ["experience", "name", "createdAt", null],
              description: "Sort field, if the user asked to sort/order the results.",
            },
            sortOrder: { type: ["string", "null"], enum: ["asc", "desc", null] },
          },
        },
      },
      {
        name: "get_candidate_profile",
        description: "Get full profile detail for a single candidate by id.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            candidateId: { type: "string" },
          },
          required: ["candidateId"],
        },
      }
    );
  }

  // Offers/salary data is not exposed to Interviewers at all — the tool
  // doesn't exist in their toolset, so the agent can't call it no matter
  // what the prompt asks.
  if (role !== "INTERVIEWER") {
    definitions.push({
      name: "search_offers",
      description: "Search offers by candidate or status. Includes salary — restricted data.",
      parametersJsonSchema: {
        type: "object",
        properties: {
          candidateId: { type: ["string", "null"] },
          status: { type: ["string", "null"], enum: ["DRAFT", "SENT", "ACCEPTED", "DECLINED", null] },
          archived: {
            type: ["string", "null"],
            enum: ["active", "archived", null],
            description: "Defaults to active (non-archived) offers only.",
          },
        },
      },
    });
  }

  // Approve is offered to MANAGER too (mirrors PATCH /offers/:id/approve's
  // RBAC), distinct from the ADMIN/HR-only create/update/archive block below.
  if (role === "ADMIN" || role === "MANAGER") {
    definitions.push({
      name: "approve_offer",
      description:
        "Propose approving a draft offer, moving it to SENT. A Manager can only approve offers " +
        "within their own department.",
      parametersJsonSchema: {
        type: "object",
        properties: { offerId: { type: "string" } },
        required: ["offerId"],
      },
    });
  }

  // Level 3: write-capable tools. Only offered to roles allowed to write
  // these entities at all (mirrors the RBAC on the matching REST routes).
  // Never auto-executed — see WRITE_TOOLS handling in the orchestrator.
  if (role === "ADMIN" || role === "HR") {
    definitions.push(
      {
        name: "schedule_interview",
        description:
          "Propose scheduling an interview for a candidate. This does NOT execute immediately — " +
          "it requires explicit user confirmation before anything is written.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            candidateId: { type: "string" },
            jobId: { type: "string" },
            interviewerId: { type: "string" },
            stageId: { type: "string" },
            round: { type: "number" },
            scheduledAt: { type: "string", description: "ISO 8601 datetime" },
          },
          required: ["candidateId", "jobId", "interviewerId", "round", "scheduledAt"],
        },
      },
      {
        name: "create_job",
        description:
          "Propose creating a new job opening. Does not execute immediately — requires explicit " +
          "user confirmation. A default single 'Screening' pipeline stage is created if none is given. " +
          "Call this immediately with whatever fields the request already specifies — do not ask the " +
          "user clarifying questions for title, department, or any other field first. Any field you " +
          "omit is shown to the user as an editable, pre-filled field (with a sensible default for " +
          "status/employment type/currency) in a confirmation form before anything is written, so it's " +
          "fine to leave gaps for the user to fill in there instead of asking now.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            title: { type: ["string", "null"] },
            department: { type: ["string", "null"] },
            status: { type: ["string", "null"], enum: JOB_STATUS_ENUM },
            description: { type: ["string", "null"] },
            employmentType: { type: ["string", "null"], enum: EMPLOYMENT_TYPE_ENUM },
            jobLevel: { type: ["string", "null"], enum: JOB_LEVEL_ENUM },
            payMin: { type: ["number", "null"] },
            payMax: { type: ["number", "null"] },
            payCurrency: { type: ["string", "null"], enum: PAY_CURRENCY_ENUM },
            skillIds: { type: ["array", "null"], items: { type: "string" }, description: "Skill master ids required for this role" },
            skillNames: { type: ["array", "null"], items: { type: "string" }, description: "Skill names, matched case-insensitively against the skill master (creates a new master skill if unmatched) — an alternative to skillIds" },
            stages: {
              type: ["array", "null"],
              items: {
                type: "object",
                properties: { name: { type: "string" }, kras: { type: "array", items: { type: "string" } } },
                required: ["name"],
              },
              description: "Pipeline stages in order; defaults to a single 'Screening' stage if omitted",
            },
          },
        },
      },
      {
        name: "update_job",
        description:
          "Propose changes to an existing job. Only include fields that should actually change. " +
          "Does not cover pipeline stage editing — direct the user to the job's edit page for that.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            jobId: { type: "string" },
            title: { type: ["string", "null"] },
            department: { type: ["string", "null"] },
            status: { type: ["string", "null"], enum: JOB_STATUS_ENUM },
            description: { type: ["string", "null"] },
            employmentType: { type: ["string", "null"], enum: EMPLOYMENT_TYPE_ENUM },
            jobLevel: { type: ["string", "null"], enum: JOB_LEVEL_ENUM },
            payMin: { type: ["number", "null"] },
            payMax: { type: ["number", "null"] },
            payCurrency: { type: ["string", "null"], enum: PAY_CURRENCY_ENUM },
            skillIds: { type: ["array", "null"], items: { type: "string" } },
            skillNames: { type: ["array", "null"], items: { type: "string" }, description: "Replaces the job's full required-skill list if given" },
            stages: {
              type: ["array", "null"],
              items: {
                type: "object",
                properties: { name: { type: "string" }, kras: { type: "array", items: { type: "string" } } },
                required: ["name"],
              },
              description: "Replaces the job's full pipeline if given",
            },
          },
          required: ["jobId"],
        },
      },
      {
        name: "archive_job",
        description:
          "Propose archiving (soft-deleting) a job. It stops appearing in default job searches; " +
          "its data and history are preserved and it can be restored later.",
        parametersJsonSchema: {
          type: "object",
          properties: { jobId: { type: "string" } },
          required: ["jobId"],
        },
      },
      {
        name: "restore_job",
        description: "Propose restoring a previously archived job.",
        parametersJsonSchema: {
          type: "object",
          properties: { jobId: { type: "string" } },
          required: ["jobId"],
        },
      },
      {
        name: "create_candidate",
        description:
          "Propose adding a new candidate for a job. Resolve the job title to a jobId with " +
          "search_jobs first if needed. Skill names are matched against the skill master by name " +
          "(case-insensitive); an unmatched name creates a new master skill.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string" },
            jobId: { type: "string" },
            skillNames: { type: ["array", "null"], items: { type: "string" }, description: "e.g. [\"React\", \"Node.js\"]" },
            phone: { type: ["string", "null"] },
            location: { type: ["string", "null"] },
            experience: { type: ["number", "null"], description: "Years of experience" },
            linkedinUrl: { type: ["string", "null"] },
            portfolioUrl: { type: ["string", "null"] },
          },
          required: ["name", "email", "jobId"],
        },
      },
      {
        name: "update_candidate",
        description: "Propose changes to an existing candidate. Only include fields that should actually change.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            candidateId: { type: "string" },
            name: { type: ["string", "null"] },
            email: { type: ["string", "null"] },
            phone: { type: ["string", "null"] },
            location: { type: ["string", "null"] },
            experience: { type: ["number", "null"] },
            status: { type: ["string", "null"], enum: CANDIDATE_STATUS_ENUM },
            linkedinUrl: { type: ["string", "null"] },
            portfolioUrl: { type: ["string", "null"] },
            skillNames: { type: ["array", "null"], items: { type: "string" }, description: "Replaces the candidate's full skill list if given" },
          },
          required: ["candidateId"],
        },
      },
      {
        name: "archive_candidate",
        description:
          "Propose archiving (soft-deleting) a candidate. It stops appearing in default candidate " +
          "searches; its data and history are preserved and it can be restored later.",
        parametersJsonSchema: {
          type: "object",
          properties: { candidateId: { type: "string" } },
          required: ["candidateId"],
        },
      },
      {
        name: "restore_candidate",
        description: "Propose restoring a previously archived candidate.",
        parametersJsonSchema: {
          type: "object",
          properties: { candidateId: { type: "string" } },
          required: ["candidateId"],
        },
      },
      {
        name: "reschedule_interview",
        description:
          "Propose moving an already-scheduled interview to a new date/time, optionally reassigning " +
          "the interviewer. Resets its status to SCHEDULED.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            interviewId: { type: "string" },
            scheduledAt: { type: "string", description: "ISO 8601 datetime" },
            interviewerId: { type: ["string", "null"] },
          },
          required: ["interviewId", "scheduledAt"],
        },
      },
      {
        name: "archive_interview",
        description: "Propose archiving (soft-deleting) an interview record. Its data and history are preserved.",
        parametersJsonSchema: {
          type: "object",
          properties: { interviewId: { type: "string" } },
          required: ["interviewId"],
        },
      },
      {
        name: "restore_interview",
        description: "Propose restoring a previously archived interview.",
        parametersJsonSchema: {
          type: "object",
          properties: { interviewId: { type: "string" } },
          required: ["interviewId"],
        },
      },
      {
        name: "create_offer",
        description: "Propose creating a draft offer for a candidate. Resolve names to ids with search_candidates/search_jobs first if needed.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            candidateId: { type: "string" },
            jobId: { type: "string" },
            salary: { type: "number" },
          },
          required: ["candidateId", "jobId", "salary"],
        },
      },
      {
        name: "update_offer",
        description: "Propose changing an offer's salary or status. Only include fields that should actually change.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            offerId: { type: "string" },
            salary: { type: ["number", "null"] },
            status: { type: ["string", "null"], enum: ["DRAFT", "SENT", "ACCEPTED", "DECLINED", null] },
          },
          required: ["offerId"],
        },
      },
      {
        name: "archive_offer",
        description: "Propose archiving (soft-deleting) an offer. Its data and history are preserved.",
        parametersJsonSchema: {
          type: "object",
          properties: { offerId: { type: "string" } },
          required: ["offerId"],
        },
      },
      {
        name: "restore_offer",
        description: "Propose restoring a previously archived offer.",
        parametersJsonSchema: {
          type: "object",
          properties: { offerId: { type: "string" } },
          required: ["offerId"],
        },
      }
    );
  }

  // Scorecards: an Interviewer submits their own; an Admin can submit on
  // anyone's behalf (mirrors allowRoles("ADMIN","INTERVIEWER") on
  // POST /interviews/:id/scorecard). Ownership of the specific interview is
  // still re-checked server-side in executeConfirmedWrite, same as the REST
  // route — role gating here only controls whether the tool is offered.
  if (role === "ADMIN" || role === "INTERVIEWER") {
    definitions.push({
      name: "submit_scorecard",
      description:
        "Propose submitting interview feedback: a hire/no-hire recommendation, per-competency (KRA) " +
        "ratings 1-5, and notes. An Interviewer can only submit for their own interviews, and only " +
        "once per interview.",
      parametersJsonSchema: {
        type: "object",
        properties: {
          interviewId: { type: "string" },
          recommendation: { type: "string", enum: ["STRONG_HIRE", "HIRE", "NO_HIRE", "STRONG_NO_HIRE"] },
          kraRatings: {
            type: "object",
            description: "Map of competency name to a 1-5 rating, e.g. {\"Communication\": 4}",
            additionalProperties: { type: "number" },
          },
          notes: { type: "string" },
        },
        required: ["interviewId", "recommendation", "notes"],
      },
    });
  }

  // Users: everything ADMIN-only, matching users.routes.ts's router-level
  // allowRoles("ADMIN") — unlike every other entity, there's no partial
  // exposure to HR/MANAGER here at all.
  if (role === "ADMIN") {
    definitions.push(
      {
        name: "search_users",
        description: "Search TalentFlow users (staff accounts) by name, email, or role.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            search: { type: ["string", "null"] },
            role: { type: ["string", "null"], enum: ["ADMIN", "HR", "MANAGER", "INTERVIEWER", null] },
            status: {
              type: ["string", "null"],
              enum: ["active", "archived", null],
              description: "Defaults to active (non-archived) users only.",
            },
          },
        },
      },
      {
        name: "create_user",
        description: "Propose creating a new staff account.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string" },
            password: { type: "string", description: "At least 8 characters" },
            role: { type: "string", enum: ["ADMIN", "HR", "MANAGER", "INTERVIEWER"] },
            department: { type: ["string", "null"] },
          },
          required: ["name", "email", "password", "role"],
        },
      },
      {
        name: "update_user",
        description: "Propose changing a user's name, email, role, or department. Only include fields that should actually change.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            userId: { type: "string" },
            name: { type: ["string", "null"] },
            email: { type: ["string", "null"] },
            role: { type: ["string", "null"], enum: ["ADMIN", "HR", "MANAGER", "INTERVIEWER", null] },
            department: { type: ["string", "null"] },
          },
          required: ["userId"],
        },
      },
      {
        name: "archive_user",
        description: "Propose archiving (deactivating) a staff account. Preserves their history and can be restored later.",
        parametersJsonSchema: {
          type: "object",
          properties: { userId: { type: "string" } },
          required: ["userId"],
        },
      },
      {
        name: "restore_user",
        description: "Propose restoring a previously archived staff account.",
        parametersJsonSchema: {
          type: "object",
          properties: { userId: { type: "string" } },
          required: ["userId"],
        },
      }
    );
  }

  // Skills Master mutations are ADMIN-only — mirrors POST/PATCH/DELETE
  // /skills all being allowRoles("ADMIN") (unlike GET /skills above, which
  // is open to everyone). Note HR does NOT get these, unlike its access to
  // Job/Candidate/Interview/Offer writes.
  if (role === "ADMIN") {
    definitions.push(
      {
        name: "create_skill",
        description: "Propose adding a new skill to the master list.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            category: { type: "string", enum: ["TECHNICAL", "HUMAN", "MANAGEMENT", "DOMAIN"] },
            description: { type: ["string", "null"] },
          },
          required: ["name", "category"],
        },
      },
      {
        name: "update_skill",
        description: "Propose changing a skill's name, category, or description.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            skillId: { type: "string" },
            name: { type: ["string", "null"] },
            category: { type: ["string", "null"], enum: ["TECHNICAL", "HUMAN", "MANAGEMENT", "DOMAIN", null] },
            description: { type: ["string", "null"] },
          },
          required: ["skillId"],
        },
      },
      {
        name: "delete_skill",
        description:
          "Propose permanently deleting a skill from the master list. This is a hard delete, not " +
          "an archive — it fails if the skill is still attached to any job or candidate.",
        parametersJsonSchema: {
          type: "object",
          properties: { skillId: { type: "string" } },
          required: ["skillId"],
        },
      }
    );
  }

  return definitions;
}

/**
 * Builds a short "field: old → new" diff string for update_* tools' confirm
 * text — only lists fields present in `args` whose value actually differs
 * from `before`. Shared across every entity's update tool so the confirm
 * dialog always shows exactly what will change, never a full field dump.
 */
export function diffFields(before: Record<string, any>, args: Record<string, any>, labels: Record<string, string>): string {
  const changes: string[] = [];
  for (const key of Object.keys(args)) {
    if (!(key in labels) || args[key] === undefined) continue;
    const newVal = args[key];
    const oldVal = before[key];
    const fmt = (v: any) => (v instanceof Date ? v.toLocaleString() : v === null || v === undefined ? "—" : String(v));
    const oldStr = fmt(oldVal);
    const newStr = fmt(newVal);
    if (oldStr !== newStr) changes.push(`${labels[key]}: ${oldStr} → ${newStr}`);
  }
  return changes.length > 0 ? changes.join(", ") : "no changes";
}

/**
 * Executes a write tool for real. Only ever called from the /search/actions
 * confirm route, using the args WE stored in PendingAction at propose time —
 * never args supplied fresh by the client at confirm time. `confirmedBy` is
 * the authenticated confirmer (already verified by actions.routes.ts to be
 * the same user who proposed it) — used where a write needs to record who
 * performed it (e.g. Job.createdById) or re-check role-scoped ownership that
 * can't be expressed purely by which tools were offered at propose time
 * (e.g. an Interviewer submitting a scorecard only for their own interview —
 * the REST route POST /interviews/:id/scorecard enforces the identical
 * check, this mirrors it for the chat path).
 */
export async function executeConfirmedWrite(tool: string, args: any, confirmedBy: JwtPayload) {
  const confirmedByUserId = confirmedBy.userId;
  switch (tool) {
    case "schedule_interview": {
      const interview = await prisma.interview.create({
        data: {
          candidateId: args.candidateId,
          jobId: args.jobId,
          interviewerId: args.interviewerId,
          stageId: args.stageId || undefined,
          round: args.round,
          scheduledAt: new Date(args.scheduledAt),
        },
      });
      await prisma.notification.create({
        data: {
          userId: args.interviewerId,
          message: `You've been assigned round ${args.round} — ${new Date(args.scheduledAt).toLocaleString()}`,
          link: "/interviews",
        },
      });
      return interview;
    }

    case "create_job": {
      const { skillIds, skillNames, stages, ...jobFields } = args;
      const resolvedSkillIds = skillNames?.length ? await resolveOrCreateSkillIds(skillNames) : (skillIds ?? []);
      const stageList = Array.isArray(stages) && stages.length ? stages : [{ name: "Screening", kras: [] }];
      return prisma.job.create({
        data: {
          ...jobFields,
          status: jobFields.status ?? "OPEN",
          createdById: confirmedByUserId,
          stages: { create: stageList.map((s: any, i: number) => ({ order: i + 1, name: s.name, kras: s.kras ?? [] })) },
          ...(resolvedSkillIds.length
            ? { skills: { create: resolvedSkillIds.map((skillId: string) => ({ skillId, proficiency: "INTERMEDIATE" })) } }
            : {}),
        },
        include: { stages: true, skills: { include: { skill: true } } },
      });
    }

    case "update_job": {
      const { jobId, skillIds, skillNames, stages, ...jobData } = args;
      const resolvedSkillIds = skillNames !== undefined ? await resolveOrCreateSkillIds(skillNames ?? []) : skillIds;
      return prisma.$transaction(async (tx) => {
        await tx.job.update({ where: { id: jobId }, data: jobData });
        if (Array.isArray(stages)) {
          await tx.pipelineStage.deleteMany({ where: { jobId } });
          if (stages.length > 0) {
            await tx.pipelineStage.createMany({
              data: stages.map((s: any, i: number) => ({ jobId, order: i + 1, name: s.name, kras: s.kras ?? [] })),
            });
          }
        }
        if (resolvedSkillIds !== undefined) {
          await tx.jobSkill.deleteMany({ where: { jobId } });
          if (resolvedSkillIds.length > 0) {
            await tx.jobSkill.createMany({
              data: resolvedSkillIds.map((skillId: string) => ({ jobId, skillId, proficiency: "INTERMEDIATE" })),
            });
          }
        }
        return tx.job.findUnique({
          where: { id: jobId },
          include: { stages: { orderBy: { order: "asc" } }, skills: { include: { skill: true } } },
        });
      });
    }

    case "archive_job":
      return prisma.job.update({ where: { id: args.jobId }, data: { archivedAt: new Date() } });

    case "restore_job":
      return prisma.job.update({ where: { id: args.jobId }, data: { archivedAt: null } });

    case "create_candidate": {
      const { skillNames, ...fields } = args;
      const skillIds = skillNames?.length ? await resolveOrCreateSkillIds(skillNames) : [];
      return prisma.candidate.create({
        data: {
          ...fields,
          skillLinks: skillIds.length ? { create: skillIds.map((skillId: string) => ({ skillId, proficiency: "INTERMEDIATE" })) } : undefined,
        },
        include: { skillLinks: { include: { skill: true } } },
      });
    }

    case "update_candidate": {
      const { candidateId, skillNames, ...fields } = args;
      const skillIds = skillNames !== undefined ? await resolveOrCreateSkillIds(skillNames ?? []) : undefined;
      return prisma.$transaction(async (tx) => {
        await tx.candidate.update({ where: { id: candidateId }, data: fields });
        if (skillIds !== undefined) {
          await tx.candidateSkill.deleteMany({ where: { candidateId } });
          if (skillIds.length > 0) {
            await tx.candidateSkill.createMany({
              data: skillIds.map((skillId) => ({ candidateId, skillId, proficiency: "INTERMEDIATE" })),
            });
          }
        }
        return tx.candidate.findUnique({ where: { id: candidateId }, include: { skillLinks: { include: { skill: true } } } });
      });
    }

    case "archive_candidate":
      return prisma.candidate.update({ where: { id: args.candidateId }, data: { archivedAt: new Date() } });

    case "restore_candidate":
      return prisma.candidate.update({ where: { id: args.candidateId }, data: { archivedAt: null } });

    case "reschedule_interview": {
      const interview = await prisma.interview.findUnique({
        where: { id: args.interviewId },
        include: { candidate: { select: { name: true } } },
      });
      if (!interview) throw new Error("Interview not found");
      const updated = await prisma.interview.update({
        where: { id: args.interviewId },
        data: {
          scheduledAt: new Date(args.scheduledAt),
          ...(args.interviewerId ? { interviewerId: args.interviewerId } : {}),
          status: "SCHEDULED",
        },
      });
      const notifyId = args.interviewerId ?? interview.interviewerId;
      await prisma.notification.create({
        data: {
          userId: notifyId,
          message: `Interview rescheduled: ${interview.candidate?.name ?? "Candidate"} — round ${interview.round} is now on ${new Date(args.scheduledAt).toLocaleDateString()}`,
          link: "/interviews",
        },
      });
      return updated;
    }

    case "submit_scorecard": {
      const interview = await prisma.interview.findUnique({
        where: { id: args.interviewId },
        include: { job: { include: { stages: { orderBy: { order: "asc" } } } }, candidate: true, scorecard: true },
      });
      if (!interview) throw new Error("Interview not found");
      // Same ownership check as POST /interviews/:id/scorecard — the tool
      // being offered to this role isn't enough on its own, since an
      // Interviewer's `submit_scorecard` args could in principle reference
      // any interviewId, not just their own.
      if (confirmedBy.role === "INTERVIEWER" && interview.interviewerId !== confirmedByUserId) {
        throw new Error("You can only submit a scorecard for your own interviews");
      }
      if (interview.scorecard) {
        throw new Error("A scorecard has already been submitted for this interview");
      }

      const passed = args.recommendation === "STRONG_HIRE" || args.recommendation === "HIRE";
      const newInterviewStatus = passed ? "CLEARED" : "REJECTED";
      const newCandidateStatus = passed ? "IN_PROCESS" : "REJECTED";

      const [scorecard] = await prisma.$transaction([
        prisma.scorecard.create({
          data: {
            interviewId: interview.id,
            recommendation: args.recommendation,
            kraRatings: args.kraRatings ?? {},
            notes: args.notes,
          },
        }),
        prisma.interview.update({ where: { id: interview.id }, data: { status: newInterviewStatus } }),
        prisma.candidate.update({ where: { id: interview.candidateId }, data: { status: newCandidateStatus } }),
      ]);

      await prisma.notification.create({
        data: {
          userId: interview.job.createdById,
          message: `${interview.candidate.name} — round ${interview.round} feedback: ${String(args.recommendation).replace(/_/g, " ")}`,
          link: `/candidates/${interview.candidateId}`,
        },
      });

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

      return scorecard;
    }

    case "archive_interview":
      return prisma.interview.update({ where: { id: args.interviewId }, data: { archivedAt: new Date() } });

    case "restore_interview":
      return prisma.interview.update({ where: { id: args.interviewId }, data: { archivedAt: null } });

    case "create_offer":
      return prisma.offer.create({ data: { candidateId: args.candidateId, jobId: args.jobId, salary: args.salary } });

    case "update_offer": {
      const { offerId, ...fields } = args;
      return prisma.offer.update({ where: { id: offerId }, data: fields });
    }

    case "approve_offer": {
      const offer = await prisma.offer.findUnique({ where: { id: args.offerId }, include: { job: true } });
      if (!offer) throw new Error("Offer not found");
      // Same department-scope check as PATCH /offers/:id/approve.
      if (confirmedBy.role === "MANAGER" && offer.job.department !== confirmedBy.department) {
        throw new Error("You can only approve offers within your own department");
      }
      return prisma.offer.update({
        where: { id: args.offerId },
        data: { status: "SENT", approvedById: confirmedByUserId },
      });
    }

    case "archive_offer":
      return prisma.offer.update({ where: { id: args.offerId }, data: { archivedAt: new Date() } });

    case "restore_offer":
      return prisma.offer.update({ where: { id: args.offerId }, data: { archivedAt: null } });

    case "create_skill":
      try {
        return await prisma.skill.create({ data: { name: args.name, category: args.category, description: args.description } });
      } catch {
        throw new Error(`A skill named "${args.name}" already exists`);
      }

    case "update_skill": {
      const { skillId, ...fields } = args;
      return prisma.skill.update({ where: { id: skillId }, data: fields });
    }

    case "delete_skill":
      try {
        await prisma.skill.delete({ where: { id: args.skillId } });
        return { ok: true };
      } catch (err) {
        // Same P2003-vs-other distinction as DELETE /skills/:id.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
          throw new Error("This skill is still attached to a job or candidate and can't be deleted");
        }
        throw new Error("Skill not found");
      }

    case "create_user": {
      const password = await hashPassword(args.password);
      return prisma.user.create({
        data: {
          name: args.name,
          email: args.email,
          password,
          role: args.role,
          roles: [args.role],
          department: args.department || undefined,
        },
        select: { id: true, name: true, email: true, role: true, department: true },
      });
    }

    case "update_user": {
      const { userId, ...fields } = args;
      return prisma.user.update({
        where: { id: userId },
        data: fields,
        select: { id: true, name: true, email: true, role: true, department: true },
      });
    }

    case "archive_user":
      return prisma.user.update({ where: { id: args.userId }, data: { archivedAt: new Date() }, select: { id: true, name: true, archivedAt: true } });

    case "restore_user":
      return prisma.user.update({ where: { id: args.userId }, data: { archivedAt: null }, select: { id: true, name: true, archivedAt: true } });

    default:
      throw new Error(`Unknown write tool: ${tool}`);
  }
}

const JOB_FIELD_LABELS: Record<string, string> = {
  title: "title",
  department: "department",
  status: "status",
  description: "description",
  employmentType: "employment type",
  jobLevel: "level",
  payMin: "min pay",
  payMax: "max pay",
  payCurrency: "currency",
};

const CANDIDATE_FIELD_LABELS: Record<string, string> = {
  name: "name",
  email: "email",
  phone: "phone",
  location: "location",
  experience: "experience",
  status: "status",
};

/** Builds a short, human-readable proposal description for a write tool call. */
export async function describeProposedAction(tool: string, args: any): Promise<string> {
  switch (tool) {
    case "schedule_interview": {
      const [candidate, interviewer] = await Promise.all([
        prisma.candidate.findUnique({ where: { id: args.candidateId } }),
        prisma.user.findUnique({ where: { id: args.interviewerId } }),
      ]);
      const when = new Date(args.scheduledAt).toLocaleString();
      return `Schedule ${candidate?.name ?? "candidate"} — round ${args.round} with ${
        interviewer?.name ?? "interviewer"
      }, ${when}`;
    }

    case "create_job":
      return `Create job "${args.title}" in ${args.department}${args.status ? ` (${args.status})` : ""}`;

    case "update_job": {
      const before = await prisma.job.findUnique({ where: { id: args.jobId } });
      if (!before) return `Update job ${args.jobId}`;
      const { jobId, skillIds, ...changes } = args;
      let diff = diffFields(before, changes, JOB_FIELD_LABELS);
      if (skillIds !== undefined) diff += diff === "no changes" ? "required skills updated" : ", required skills updated";
      return `Update job "${before.title}" — ${diff}`;
    }

    case "archive_job": {
      const job = await prisma.job.findUnique({ where: { id: args.jobId } });
      return `Archive job "${job?.title ?? args.jobId}"`;
    }

    case "restore_job": {
      const job = await prisma.job.findUnique({ where: { id: args.jobId } });
      return `Restore job "${job?.title ?? args.jobId}"`;
    }

    case "create_candidate": {
      const skillsPart = args.skillNames?.length ? ` — skills: ${args.skillNames.join(", ")}` : "";
      return `Add candidate "${args.name}"${skillsPart}`;
    }

    case "update_candidate": {
      const before = await prisma.candidate.findUnique({ where: { id: args.candidateId } });
      if (!before) return `Update candidate ${args.candidateId}`;
      const { candidateId, skillNames, ...changes } = args;
      let diff = diffFields(before, changes, CANDIDATE_FIELD_LABELS);
      if (skillNames !== undefined) diff += diff === "no changes" ? "skills updated" : ", skills updated";
      return `Update candidate "${before.name}" — ${diff}`;
    }

    case "archive_candidate": {
      const candidate = await prisma.candidate.findUnique({ where: { id: args.candidateId } });
      return `Archive candidate "${candidate?.name ?? args.candidateId}"`;
    }

    case "restore_candidate": {
      const candidate = await prisma.candidate.findUnique({ where: { id: args.candidateId } });
      return `Restore candidate "${candidate?.name ?? args.candidateId}"`;
    }

    case "reschedule_interview": {
      const interview = await prisma.interview.findUnique({
        where: { id: args.interviewId },
        include: { candidate: { select: { name: true } } },
      });
      const when = new Date(args.scheduledAt).toLocaleString();
      return `Reschedule ${interview?.candidate?.name ?? "candidate"}'s round ${interview?.round ?? "?"} interview to ${when}`;
    }

    case "submit_scorecard": {
      const interview = await prisma.interview.findUnique({
        where: { id: args.interviewId },
        include: { candidate: { select: { name: true } } },
      });
      return `Submit round ${interview?.round ?? "?"} feedback for ${interview?.candidate?.name ?? "candidate"}: ${String(args.recommendation).replace(/_/g, " ")}`;
    }

    case "archive_interview": {
      const interview = await prisma.interview.findUnique({ where: { id: args.interviewId }, include: { candidate: { select: { name: true } } } });
      return `Archive round ${interview?.round ?? "?"} interview for ${interview?.candidate?.name ?? args.interviewId}`;
    }

    case "restore_interview": {
      const interview = await prisma.interview.findUnique({ where: { id: args.interviewId }, include: { candidate: { select: { name: true } } } });
      return `Restore round ${interview?.round ?? "?"} interview for ${interview?.candidate?.name ?? args.interviewId}`;
    }

    case "create_offer": {
      const candidate = await prisma.candidate.findUnique({ where: { id: args.candidateId } });
      return `Create a draft offer for ${candidate?.name ?? "candidate"} — ${args.salary.toLocaleString()}`;
    }

    case "update_offer": {
      const before = await prisma.offer.findUnique({ where: { id: args.offerId }, include: { candidate: { select: { name: true } } } });
      if (!before) return `Update offer ${args.offerId}`;
      const { offerId, ...changes } = args;
      const diff = diffFields(before, changes, { salary: "salary", status: "status" });
      return `Update offer for ${before.candidate.name} — ${diff}`;
    }

    case "approve_offer": {
      const offer = await prisma.offer.findUnique({ where: { id: args.offerId }, include: { candidate: { select: { name: true } } } });
      return `Approve offer for ${offer?.candidate?.name ?? args.offerId}${offer ? ` — ${offer.salary.toString()}` : ""}`;
    }

    case "archive_offer": {
      const offer = await prisma.offer.findUnique({ where: { id: args.offerId }, include: { candidate: { select: { name: true } } } });
      return `Archive offer for ${offer?.candidate?.name ?? args.offerId}`;
    }

    case "restore_offer": {
      const offer = await prisma.offer.findUnique({ where: { id: args.offerId }, include: { candidate: { select: { name: true } } } });
      return `Restore offer for ${offer?.candidate?.name ?? args.offerId}`;
    }

    case "create_skill":
      return `Add skill "${args.name}" (${args.category})`;

    case "update_skill": {
      const before = await prisma.skill.findUnique({ where: { id: args.skillId } });
      if (!before) return `Update skill ${args.skillId}`;
      const { skillId, ...changes } = args;
      const diff = diffFields(before, changes, { name: "name", category: "category", description: "description" });
      return `Update skill "${before.name}" — ${diff}`;
    }

    case "delete_skill": {
      const skill = await prisma.skill.findUnique({ where: { id: args.skillId } });
      return `Permanently delete skill "${skill?.name ?? args.skillId}"`;
    }

    case "create_user":
      return `Create ${args.role} account for "${args.name}" (${args.email})`;

    case "update_user": {
      const before = await prisma.user.findUnique({ where: { id: args.userId } });
      if (!before) return `Update user ${args.userId}`;
      const { userId, ...changes } = args;
      const diff = diffFields(before, changes, { name: "name", email: "email", role: "role", department: "department" });
      return `Update user "${before.name}" — ${diff}`;
    }

    case "archive_user": {
      const u = await prisma.user.findUnique({ where: { id: args.userId } });
      return `Archive user "${u?.name ?? args.userId}"`;
    }

    case "restore_user": {
      const u = await prisma.user.findUnique({ where: { id: args.userId } });
      return `Restore user "${u?.name ?? args.userId}"`;
    }

    default:
      return `Run ${tool}`;
  }
}
export async function executeTool(name: string, args: any, caller: JwtPayload) {
  switch (name) {
    case "search_jobs":
      if (caller.role === "INTERVIEWER") {
        // Defense in depth — this tool isn't even registered for
        // Interviewers, but block it here too in case of a bug upstream.
        throw new Error("Jobs are not accessible to this role");
      }
      return prisma.job.findMany({
        where: {
          title: args.title ? { contains: args.title, mode: "insensitive" } : undefined,
          department: args.department ? { contains: args.department, mode: "insensitive" } : undefined,
          archivedAt: args.status === "archived" ? { not: null } : null,
        },
        include: { _count: { select: { candidates: true } }, skills: { include: { skill: true } } },
        take: 30,
      });

    case "search_candidates":
      if (caller.role === "INTERVIEWER") {
        throw new Error("Candidates are not accessible to this role");
      }
      return prisma.candidate.findMany({
        where: {
          name: args.name ? { contains: args.name, mode: "insensitive" } : undefined,
          // Matches against the governed Skill master relation now, not a
          // free-text array — a partial, case-insensitive name match.
          skillLinks: args.skill
            ? { some: { skill: { name: { contains: args.skill, mode: "insensitive" } } } }
            : undefined,
          jobId: args.jobId || undefined,
          archivedAt: args.status === "archived" ? { not: null } : null,
          // Managers only see candidates within their own department
          job:
            caller.role === "MANAGER" && caller.department
              ? { department: caller.department }
              : undefined,
        },
        include: { job: true, skillLinks: { include: { skill: true } } },
        // Allow-listed field set — args.sortBy is model-supplied and must
        // never be passed straight through into a dynamic Prisma orderBy key.
        orderBy: ["experience", "name", "createdAt"].includes(args.sortBy)
          ? { [args.sortBy]: args.sortOrder === "desc" ? "desc" : "asc" }
          : undefined,
        take: 30,
      });

    case "search_interviews":
      return prisma.interview.findMany({
        where: {
          id: args.interviewId || undefined,
          jobId: args.jobId || undefined,
          round: args.round != null ? args.round : undefined,
          status: args.status || undefined,
          archivedAt: args.archived === "archived" ? { not: null } : null,
          // Interviewers only ever see their own interviews — hardcoded
          // regardless of what the agent decides to pass as args.
          interviewerId: caller.role === "INTERVIEWER" ? caller.userId : undefined,
        },
        include: { candidate: true, job: true, interviewer: { select: { name: true } }, stage: { select: { name: true } }, scorecard: { select: { id: true } } },
        take: 35,
      });

    case "get_candidate_profile":
      if (caller.role === "INTERVIEWER") {
        throw new Error("Candidate profiles are not accessible to this role");
      }
      return prisma.candidate.findUnique({
        where: { id: args.candidateId },
        include: { job: true, interviews: true, skillLinks: { include: { skill: true } } },
      });

    case "search_offers":
      if (caller.role === "INTERVIEWER") {
        // Defense in depth — this tool isn't even registered for
        // Interviewers, but block it here too in case of a bug upstream.
        throw new Error("Offers are not accessible to this role");
      }
      return prisma.offer.findMany({
        where: {
          candidateId: args.candidateId || undefined,
          status: args.status || undefined,
          archivedAt: args.archived === "archived" ? { not: null } : null,
          job:
            caller.role === "MANAGER" && caller.department
              ? { department: caller.department }
              : undefined,
        },
        include: { candidate: true, job: true },
        take: 30,
      });

    case "search_skills":
      return prisma.skill.findMany({
        where: {
          category: args.category || undefined,
          name: args.search ? { contains: args.search, mode: "insensitive" } : undefined,
        },
        orderBy: [{ category: "asc" }, { name: "asc" }],
        take: 150,
      });

    case "search_users":
      if (caller.role !== "ADMIN") {
        // Defense in depth — this tool isn't even registered for
        // non-Admins, but block it here too in case of a bug upstream.
        throw new Error("Users are not accessible to this role");
      }
      return prisma.user.findMany({
        where: {
          archivedAt: args.status === "archived" ? { not: null } : null,
          role: args.role || undefined,
          OR: args.search
            ? [
                { name: { contains: args.search, mode: "insensitive" } },
                { email: { contains: args.search, mode: "insensitive" } },
              ]
            : undefined,
        },
        select: { id: true, name: true, email: true, role: true, department: true, archivedAt: true },
        take: 30,
      });

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * The UI needs full Prisma records (nested job/candidate/skill objects) to
 * render result cards, but feeding that same nesting back to the LLM as a
 * tool result blows through small-provider token budgets fast — a page of
 * jobs with full descriptions and denormalized skill objects easily runs
 * several thousand tokens. This trims each read tool's result down to the
 * handful of fields the model actually needs to answer/summarize with,
 * right before it goes into the next completion request. The full,
 * untrimmed result (used for the UI surface and the API response's `data`)
 * is untouched — this only affects what the model sees.
 */
export function summarizeToolResultForModel(name: string, result: any): any {
  if (result == null || (typeof result === "object" && "error" in result)) return result;

  const job = (j: any) => ({
    id: j.id,
    title: j.title,
    department: j.department,
    status: j.status,
    employmentType: j.employmentType,
    jobLevel: j.jobLevel,
    candidateCount: j._count?.candidates,
    skills: (j.skills ?? []).map((s: any) => s.skill?.name).filter(Boolean),
    archivedAt: j.archivedAt,
  });

  const candidate = (c: any) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    experience: c.experience,
    location: c.location,
    jobTitle: c.job?.title,
    skills: (c.skillLinks ?? []).map((s: any) => s.skill?.name).filter(Boolean),
    archivedAt: c.archivedAt,
  });

  const interview = (iv: any) => ({
    id: iv.id,
    round: iv.round,
    status: iv.status,
    scheduledAt: iv.scheduledAt,
    candidateName: iv.candidate?.name,
    jobTitle: iv.job?.title,
    interviewerName: iv.interviewer?.name,
    stageName: iv.stage?.name,
    hasScorecard: !!iv.scorecard,
    archivedAt: iv.archivedAt,
  });

  const offer = (o: any) => ({
    id: o.id,
    status: o.status,
    salary: o.salary,
    candidateName: o.candidate?.name,
    jobTitle: o.job?.title,
    archivedAt: o.archivedAt,
  });

  // search_skills returns every column (including description, createdAt,
  // updatedAt) — with 100+ skills in the master list that's easily the
  // single largest read result the model ever sees, so it gets the same
  // name/category-only trim as everything else above.
  const skill = (s: any) => ({
    id: s.id,
    name: s.name,
    category: s.category,
  });

  switch (name) {
    case "search_jobs":
      return Array.isArray(result) ? result.map(job) : result;
    case "search_candidates":
      return Array.isArray(result) ? result.map(candidate) : result;
    case "search_interviews":
      return Array.isArray(result) ? result.map(interview) : result;
    case "search_offers":
      return Array.isArray(result) ? result.map(offer) : result;
    case "search_skills":
      return Array.isArray(result) ? result.map(skill) : result;
    case "get_candidate_profile":
      return {
        ...candidate(result),
        interviews: (result.interviews ?? []).map((iv: any) => ({
          id: iv.id,
          round: iv.round,
          status: iv.status,
          scheduledAt: iv.scheduledAt,
        })),
      };
    default:
      return result;
  }
}
