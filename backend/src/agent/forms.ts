import { prisma } from "../lib/prisma";

/**
 * Turns a proposed write action into either an editable form (create/update/
 * schedule — anything with real fields for the user to review before it's
 * written) or a plain confirm (archive/restore/approve/delete — nothing to
 * edit, just a yes/no on an already-fully-specified action).
 *
 * This is the fix for showing a bare "Confirm action" dialog on every write:
 * WRITE_TOOL_META classifies each tool once, buildFormFields renders the
 * fields (pre-filled from whatever the LLM inferred from the prompt, or —
 * for updates — the record's current values), and reconstructArgsFromForm
 * turns the user's edited values back into the exact same args shape
 * executeConfirmedWrite already expects. No new persistence: everything here
 * is recomputed from the tool name + PendingAction.args already stored.
 */

export interface FormField {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "datetime" | "password" | "stageList";
  value: string | number;
  options?: { label: string; value: string }[];
  required?: boolean;
  placeholder?: string;
  /** Fields sharing a step render together, in one page of a multi-step form
   *  (only Jobs currently needs more than one step — everything else has a
   *  single implicit step 0 and renders as a flat form, no stepper shown). */
  step?: number;
  stepTitle?: string;
}

export const WRITE_TOOL_META: Record<string, { kind: "form" | "confirm"; submitLabel: string }> = {
  create_job: { kind: "form", submitLabel: "Create job" },
  update_job: { kind: "form", submitLabel: "Save changes" },
  archive_job: { kind: "confirm", submitLabel: "Archive" },
  restore_job: { kind: "confirm", submitLabel: "Restore" },
  create_candidate: { kind: "form", submitLabel: "Add candidate" },
  update_candidate: { kind: "form", submitLabel: "Save changes" },
  archive_candidate: { kind: "confirm", submitLabel: "Archive" },
  restore_candidate: { kind: "confirm", submitLabel: "Restore" },
  schedule_interview: { kind: "form", submitLabel: "Schedule" },
  reschedule_interview: { kind: "form", submitLabel: "Reschedule" },
  submit_scorecard: { kind: "form", submitLabel: "Submit feedback" },
  archive_interview: { kind: "confirm", submitLabel: "Archive" },
  restore_interview: { kind: "confirm", submitLabel: "Restore" },
  create_offer: { kind: "form", submitLabel: "Create offer" },
  update_offer: { kind: "form", submitLabel: "Save changes" },
  approve_offer: { kind: "confirm", submitLabel: "Approve" },
  archive_offer: { kind: "confirm", submitLabel: "Archive" },
  restore_offer: { kind: "confirm", submitLabel: "Restore" },
  create_skill: { kind: "form", submitLabel: "Add skill" },
  update_skill: { kind: "form", submitLabel: "Save changes" },
  delete_skill: { kind: "confirm", submitLabel: "Delete" },
  create_user: { kind: "form", submitLabel: "Create user" },
  update_user: { kind: "form", submitLabel: "Save changes" },
  archive_user: { kind: "confirm", submitLabel: "Archive" },
  restore_user: { kind: "confirm", submitLabel: "Restore" },
};

type FieldDef = Omit<FormField, "value">;

const opt = (values: string[]): { label: string; value: string }[] => values.map((v) => ({ label: v, value: v }));

// Mirrors the 4-step REST wizard at frontend/app/(app)/jobs/create/page.tsx
// exactly (same steps, same fields) so the chat path never falls behind it.
const JOB_STEP = { GENERAL: 0, DESCRIPTION: 1, STAGES: 2, SKILLS: 3 };
const JOB_FIELDS: FieldDef[] = [
  { key: "title", label: "Job title", type: "text", required: true, step: JOB_STEP.GENERAL, stepTitle: "General info" },
  { key: "department", label: "Department", type: "text", required: true, step: JOB_STEP.GENERAL, stepTitle: "General info" },
  { key: "status", label: "Status", type: "select", options: opt(["OPEN", "CLOSED", "ON_HOLD", "DRAFT"]), step: JOB_STEP.GENERAL, stepTitle: "General info" },
  { key: "employmentType", label: "Employment type", type: "select", options: opt(["FULL_TIME", "PART_TIME", "CONTRACT", "FREELANCE", "INTERNSHIP"]), step: JOB_STEP.GENERAL, stepTitle: "General info" },
  { key: "jobLevel", label: "Level", type: "select", options: opt(["INTERN", "JUNIOR", "MID", "SENIOR", "LEAD", "MANAGER", "DIRECTOR"]), step: JOB_STEP.GENERAL, stepTitle: "General info" },
  { key: "payMin", label: "Pay min", type: "number", step: JOB_STEP.GENERAL, stepTitle: "General info" },
  { key: "payMax", label: "Pay max", type: "number", step: JOB_STEP.GENERAL, stepTitle: "General info" },
  { key: "payCurrency", label: "Currency", type: "select", options: opt(["INR", "USD"]), step: JOB_STEP.GENERAL, stepTitle: "General info" },
  { key: "description", label: "Description", type: "textarea", step: JOB_STEP.DESCRIPTION, stepTitle: "Description" },
  { key: "stages", label: "Pipeline stages", type: "stageList", step: JOB_STEP.STAGES, stepTitle: "Pipeline stages" },
  { key: "skillNames", label: "Required skills (comma-separated)", type: "text", placeholder: "React, Node.js", step: JOB_STEP.SKILLS, stepTitle: "Required skills" },
];

const CANDIDATE_FIELDS_CREATE: FieldDef[] = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "email", label: "Email", type: "text", required: true },
  { key: "phone", label: "Phone", type: "text" },
  { key: "location", label: "Location", type: "text" },
  { key: "experience", label: "Experience (years)", type: "number" },
  { key: "linkedinUrl", label: "LinkedIn URL", type: "text" },
  { key: "portfolioUrl", label: "Portfolio URL", type: "text" },
  { key: "skillNames", label: "Skills (comma-separated)", type: "text", placeholder: "React, Node.js" },
];

const CANDIDATE_FIELDS_UPDATE: FieldDef[] = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "email", label: "Email", type: "text", required: true },
  { key: "phone", label: "Phone", type: "text" },
  { key: "location", label: "Location", type: "text" },
  { key: "experience", label: "Experience (years)", type: "number" },
  { key: "status", label: "Status", type: "select", options: opt(["APPLIED", "IN_PROCESS", "OFFERED", "HIRED", "REJECTED"]) },
  { key: "linkedinUrl", label: "LinkedIn URL", type: "text" },
  { key: "portfolioUrl", label: "Portfolio URL", type: "text" },
  { key: "skillNames", label: "Skills (comma-separated)", type: "text", placeholder: "React, Node.js" },
];

const OFFER_FIELDS_CREATE: FieldDef[] = [{ key: "salary", label: "Salary", type: "number", required: true }];
const OFFER_FIELDS_UPDATE: FieldDef[] = [
  { key: "salary", label: "Salary", type: "number" },
  { key: "status", label: "Status", type: "select", options: opt(["DRAFT", "SENT", "ACCEPTED", "DECLINED"]) },
];

const USER_FIELDS_CREATE: FieldDef[] = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "email", label: "Email", type: "text", required: true },
  { key: "password", label: "Password", type: "password", required: true, placeholder: "At least 8 characters" },
  { key: "role", label: "Role", type: "select", options: opt(["ADMIN", "HR", "MANAGER", "INTERVIEWER"]), required: true },
  { key: "department", label: "Department", type: "text" },
];
const USER_FIELDS_UPDATE: FieldDef[] = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "email", label: "Email", type: "text", required: true },
  { key: "role", label: "Role", type: "select", options: opt(["ADMIN", "HR", "MANAGER", "INTERVIEWER"]), required: true },
  { key: "department", label: "Department", type: "text" },
];

const SKILL_FIELDS: FieldDef[] = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "category", label: "Category", type: "select", options: opt(["TECHNICAL", "HUMAN", "MANAGEMENT", "DOMAIN"]), required: true },
  { key: "description", label: "Description", type: "textarea" },
];

const INTERVIEW_SCHEDULE_FIELDS: FieldDef[] = [
  { key: "round", label: "Round", type: "number", required: true },
  { key: "scheduledAt", label: "Date & time", type: "datetime", required: true },
];

function toDatetimeLocal(iso: unknown): string {
  if (!iso) return "";
  const d = new Date(iso as string);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToIso(v: unknown): string | undefined {
  if (!v || typeof v !== "string") return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

function joinNames(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ");
  return typeof v === "string" ? v : "";
}

function splitNames(v: unknown): string[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

const DEFAULT_STAGE = [{ name: "Screening", kras: [] as string[] }];

function stagesToJson(v: unknown): string {
  const list = Array.isArray(v) ? v : DEFAULT_STAGE;
  const cleaned = list
    .filter((s: any) => s && typeof s.name === "string")
    .map((s: any) => ({ name: s.name, kras: Array.isArray(s.kras) ? s.kras : [] }));
  return JSON.stringify(cleaned.length ? cleaned : DEFAULT_STAGE);
}

function parseStages(v: unknown): { name: string; kras: string[] }[] {
  if (typeof v !== "string" || !v.trim()) return DEFAULT_STAGE;
  try {
    const parsed = JSON.parse(v);
    if (!Array.isArray(parsed)) return DEFAULT_STAGE;
    const cleaned = parsed
      .filter((s: any) => s && typeof s.name === "string" && s.name.trim())
      .map((s: any) => ({ name: s.name.trim(), kras: Array.isArray(s.kras) ? s.kras : [] }));
    return cleaned.length ? cleaned : DEFAULT_STAGE;
  } catch {
    return DEFAULT_STAGE;
  }
}

function materialize(defs: FieldDef[], values: Record<string, any>): FormField[] {
  return defs.map((def) => {
    let value = values[def.key];
    if (def.type === "datetime") value = toDatetimeLocal(value);
    else if (def.type === "stageList") value = stagesToJson(value);
    else if (def.key === "skillNames") value = joinNames(value);
    else if (value === null || value === undefined) value = "";
    return { ...def, value };
  });
}

const num = (v: unknown): number | undefined => (v === "" || v === undefined || v === null ? undefined : Number(v));
const str = (v: unknown): string | undefined => (v === "" || v === undefined || v === null ? undefined : String(v));

/**
 * Builds the editable field set for a proposed write action, or null for a
 * plain-confirm tool. For update_* tools, pre-fills from the record's
 * CURRENT values in the DB (not just whatever the LLM happened to infer),
 * merged with anything the LLM did supply so a partially-specified prompt
 * ("rename it to X") still shows every other field as-is.
 */
export async function buildFormFields(tool: string, args: any): Promise<FormField[] | null> {
  const meta = WRITE_TOOL_META[tool];
  if (!meta || meta.kind !== "form") return null;

  switch (tool) {
    case "create_job":
      return materialize(JOB_FIELDS, args);

    case "update_job": {
      const job = args.jobId
        ? await prisma.job.findUnique({
            where: { id: args.jobId },
            include: { stages: { orderBy: { order: "asc" } }, skills: { include: { skill: true } } },
          })
        : null;
      const currentStages = job?.stages?.map((s) => ({ name: s.name, kras: s.kras })) ?? DEFAULT_STAGE;
      const currentSkillNames = job?.skills?.map((s) => s.skill.name) ?? [];
      return materialize(JOB_FIELDS, {
        ...job,
        ...args,
        stages: args.stages ?? currentStages,
        skillNames: args.skillNames !== undefined ? args.skillNames : currentSkillNames,
      });
    }

    case "create_candidate":
      return materialize(CANDIDATE_FIELDS_CREATE, { ...args, skillNames: joinNames(args.skillNames) });

    case "update_candidate": {
      const candidate = args.candidateId
        ? await prisma.candidate.findUnique({
            where: { id: args.candidateId },
            include: { skillLinks: { include: { skill: true } } },
          })
        : null;
      const currentSkillNames = candidate?.skillLinks?.map((l) => l.skill.name).join(", ") ?? "";
      return materialize(CANDIDATE_FIELDS_UPDATE, {
        ...candidate,
        ...args,
        skillNames: args.skillNames !== undefined ? joinNames(args.skillNames) : currentSkillNames,
      });
    }

    case "schedule_interview":
      return materialize(INTERVIEW_SCHEDULE_FIELDS, args);

    case "reschedule_interview": {
      const interview = args.interviewId ? await prisma.interview.findUnique({ where: { id: args.interviewId } }) : null;
      const interviewers = await prisma.user.findMany({
        where: { role: "INTERVIEWER", archivedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
      const merged = { ...interview, ...args };
      return [
        {
          key: "scheduledAt",
          label: "New date & time",
          type: "datetime" as const,
          value: toDatetimeLocal(merged.scheduledAt),
          required: true,
        },
        {
          key: "interviewerId",
          label: "Interviewer",
          type: "select" as const,
          value: merged.interviewerId ?? interview?.interviewerId ?? "",
          options: interviewers.map((u) => ({ label: u.name, value: u.id })),
        },
      ];
    }

    case "submit_scorecard": {
      const interview = args.interviewId
        ? await prisma.interview.findUnique({
            where: { id: args.interviewId },
            include: { job: { include: { stages: true } } },
          })
        : null;
      const stage = interview
        ? interview.stageId
          ? interview.job.stages.find((s) => s.id === interview.stageId)
          : interview.job.stages.find((s) => s.order === interview.round)
        : null;
      const kraNames: string[] = stage?.kras ?? [];
      const ratings = args.kraRatings ?? {};
      return [
        {
          key: "recommendation",
          label: "Recommendation",
          type: "select",
          value: args.recommendation ?? "HIRE",
          options: opt(["STRONG_HIRE", "HIRE", "NO_HIRE", "STRONG_NO_HIRE"]),
          required: true,
        },
        ...kraNames.map((k) => ({ key: `kra:${k}`, label: k, type: "number" as const, value: ratings[k] ?? "" })),
        { key: "notes", label: "Notes", type: "textarea" as const, value: args.notes ?? "", required: true },
      ];
    }

    case "create_offer":
      return materialize(OFFER_FIELDS_CREATE, args);

    case "update_offer": {
      const offer = args.offerId ? await prisma.offer.findUnique({ where: { id: args.offerId } }) : null;
      return materialize(OFFER_FIELDS_UPDATE, { ...offer, ...args });
    }

    case "create_skill":
      return materialize(SKILL_FIELDS, args);

    case "update_skill": {
      const skill = args.skillId ? await prisma.skill.findUnique({ where: { id: args.skillId } }) : null;
      return materialize(SKILL_FIELDS, { ...skill, ...args });
    }

    case "create_user":
      return materialize(USER_FIELDS_CREATE, args);

    case "update_user": {
      const user = args.userId ? await prisma.user.findUnique({ where: { id: args.userId } }) : null;
      return materialize(USER_FIELDS_UPDATE, { ...user, ...args });
    }

    default:
      return null;
  }
}

/**
 * Inverse of buildFormFields: turns the user's edited flat values back into
 * the args shape executeConfirmedWrite expects, layered on top of the args
 * stored on the PendingAction at propose time (so ids and any field never
 * rendered in the form — e.g. skillIds picked conversationally — pass
 * through untouched).
 */
export function reconstructArgsFromForm(tool: string, baseArgs: any, values: Record<string, any>): any {
  switch (tool) {
    case "create_job":
    case "update_job":
      return {
        ...baseArgs,
        title: str(values.title),
        department: str(values.department),
        status: str(values.status) ?? null,
        employmentType: str(values.employmentType) ?? null,
        jobLevel: str(values.jobLevel) ?? null,
        payMin: num(values.payMin) ?? null,
        payMax: num(values.payMax) ?? null,
        payCurrency: str(values.payCurrency) ?? null,
        description: str(values.description) ?? null,
        stages: parseStages(values.stages),
        skillNames: splitNames(values.skillNames),
      };

    case "create_candidate":
      return {
        ...baseArgs,
        name: str(values.name),
        email: str(values.email),
        phone: str(values.phone) ?? null,
        location: str(values.location) ?? null,
        experience: num(values.experience) ?? null,
        linkedinUrl: str(values.linkedinUrl) ?? null,
        portfolioUrl: str(values.portfolioUrl) ?? null,
        skillNames: splitNames(values.skillNames),
      };

    case "update_candidate":
      return {
        ...baseArgs,
        name: str(values.name),
        email: str(values.email),
        phone: str(values.phone) ?? null,
        location: str(values.location) ?? null,
        experience: num(values.experience) ?? null,
        status: str(values.status) ?? null,
        linkedinUrl: str(values.linkedinUrl) ?? null,
        portfolioUrl: str(values.portfolioUrl) ?? null,
        skillNames: splitNames(values.skillNames),
      };

    case "schedule_interview":
      return {
        ...baseArgs,
        round: num(values.round),
        scheduledAt: localToIso(values.scheduledAt),
      };

    case "reschedule_interview":
      return {
        ...baseArgs,
        scheduledAt: localToIso(values.scheduledAt),
        interviewerId: str(values.interviewerId),
      };

    case "submit_scorecard": {
      const kraRatings: Record<string, number> = {};
      for (const [key, v] of Object.entries(values)) {
        if (key.startsWith("kra:")) {
          const n = num(v);
          if (n !== undefined) kraRatings[key.slice(4)] = n;
        }
      }
      return {
        ...baseArgs,
        recommendation: str(values.recommendation),
        notes: str(values.notes) ?? "",
        kraRatings,
      };
    }

    case "create_offer":
      return { ...baseArgs, salary: num(values.salary) };

    case "update_offer":
      return { ...baseArgs, salary: num(values.salary) ?? null, status: str(values.status) ?? null };

    case "create_skill":
      return { ...baseArgs, name: str(values.name), category: str(values.category), description: str(values.description) ?? null };

    case "update_skill":
      return { ...baseArgs, name: str(values.name), category: str(values.category) ?? null, description: str(values.description) ?? null };

    case "create_user":
      return {
        ...baseArgs,
        name: str(values.name),
        email: str(values.email),
        password: str(values.password),
        role: str(values.role),
        department: str(values.department) ?? null,
      };

    case "update_user":
      return {
        ...baseArgs,
        name: str(values.name),
        email: str(values.email),
        role: str(values.role) ?? null,
        department: str(values.department) ?? null,
      };

    default:
      return { ...baseArgs, ...values };
  }
}
