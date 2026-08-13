import Groq from "groq-sdk";
import { createCompletion, SYSTEM_INSTRUCTION } from "./llm";
import { getToolDefinitionsForRole, executeTool, WRITE_TOOLS, describeProposedAction } from "./tools";
import { buildFormFields, WRITE_TOOL_META } from "./forms";
import { JwtPayload } from "../types";
import { prisma } from "../lib/prisma";
import { getCatalogForRole, validateA2UISurface } from "./catalog";

const MAX_TOOL_ITERATIONS = 5;
const PENDING_ACTION_TTL_MS = 10 * 60 * 1000; // 10 minutes
const HISTORY_MESSAGE_LIMIT = 12; // ~6 prior turns — lightweight text-only replay

/**
 * Turns a stored Message row back into a Groq chat turn for conversational
 * memory. Only ever replays the plain `content` text as alternating
 * user/assistant turns — never fabricates tool_calls/tool role messages,
 * since those were never persisted in Groq's native format and
 * reconstructing fake ones would be fragile.
 */
function messageToGroqTurn(msg: { role: string; content: string; toolTrace: unknown }): Groq.Chat.ChatCompletionMessageParam {
  if (msg.role === "user") return { role: "user", content: msg.content };
  // proposeWrite's message.create never sets toolTrace; the final-turn
  // create always does (even steps=[]). Use that to detect an unconfirmed
  // proposal row so the model doesn't cite "I proposed X" as fact later.
  const isProposal = msg.toolTrace == null;
  const content = isProposal
    ? `(Previously proposed, not yet confirmed by the user — may since have been confirmed, cancelled, or ignored) ${msg.content}`
    : msg.content;
  return { role: "assistant", content };
}

function toPlainJSON(value: any): any {
  return JSON.parse(JSON.stringify(value));
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    const is429 = err?.status === 429 || err?.message?.includes("RESOURCE_EXHAUSTED") || err?.message?.includes("rate_limit");
    if (is429 && retries > 0) {
      const match = err?.message?.match(/retryDelay":"(\d+)/);
      const waitMs = match ? parseInt(match[1], 10) * 1000 + 500 : 5000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return withRetry(fn, retries - 1);
    }
    throw err;
  }
}

const TOOL_NAME_RE = /\b(search_jobs|search_candidates|search_interviews|search_offers|get_candidate_profile|schedule_interview)\b/g;

function cleanText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/\*\*/g, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(TOOL_NAME_RE, "the search");
}

const SURFACE_ID = "main";
const CATALOG_ID = "https://talentflow.internal/catalog/v1";

interface A2uiComponent {
  id: string;
  component: string;
  children?: string[];
  [prop: string]: unknown;
}

interface A2uiMessage {
  version: "v0.9";
  createSurface?: { surfaceId: string; catalogId: string; theme?: Record<string, unknown> };
  updateComponents?: { surfaceId: string; components: A2uiComponent[] };
  updateDataModel?: { surfaceId: string; path: string; value: unknown };
  deleteSurface?: { surfaceId: string };
}

// Status options cover candidate, interview, and job statuses — the filter
// gate on each component only hides rows where its own status doesn't match.
const STATUS_FILTER_OPTIONS = [
  { label: "All", value: "ALL" },
  // Job statuses
  { label: "Open", value: "OPEN" },
  { label: "On Hold", value: "ON_HOLD" },
  // Candidate statuses
  { label: "In Process", value: "IN_PROCESS" },
  { label: "Offered", value: "OFFERED" },
  { label: "Hired", value: "HIRED" },
  // Interview statuses
  { label: "Scheduled", value: "SCHEDULED" },
  { label: "Cleared", value: "CLEARED" },
  { label: "Rejected", value: "REJECTED" },
];

type EntityKind = "job" | "candidate" | "interview" | "offer" | "skill" | "user" | null;

// Reuses the same field-sniffing rules itemToComponents uses below — run
// once per batch (on the first item), not per item.
function detectEntityKind(item: any): EntityKind {
  if (!item) return null;
  if (item.round !== undefined) return "interview";
  if (item.title && item.department) return "job";
  if (item.name && item.skillLinks !== undefined) return "candidate";
  if (item.salary !== undefined && item.candidateId && item.jobId) return "offer";
  if (item.category !== undefined && item.name) return "skill";
  if (item.email && item.role) return "user";
  return null;
}

function distinctValues<T>(items: any[], get: (item: any) => T | null | undefined): T[] {
  const set = new Set<T>();
  for (const item of items) {
    const v = get(item);
    if (v !== null && v !== undefined) set.add(v);
  }
  return Array.from(set);
}

/**
 * Picks whichever filter controls are actually useful for this batch of
 * results — not a single hardcoded status dropdown. ChoicePicker and
 * TextField are both generic DataModel-bound controls (see
 * frontend/lib/a2uiCatalog.tsx); reused here for status, skill, and
 * name-search filtering rather than needing bespoke components per kind.
 */
function buildFilterComponents(items: any[]): A2uiComponent[] {
  const kind = detectEntityKind(items[0]);
  if (!kind) return [];
  const components: A2uiComponent[] = [];

  // Status — only offered when there's more than one distinct value to
  // actually choose between (a 1-option dropdown is noise, not a filter).
  const statuses = distinctValues(items, (i) => i.status);
  if (statuses.length > 1) {
    components.push({
      id: "filter_status_picker",
      component: "ChoicePicker",
      value: { path: "filter/status" },
      options: [{ label: "All", value: "ALL" }, ...STATUS_FILTER_OPTIONS.filter((o) => statuses.includes(o.value))],
      placeholder: "Filter by status",
    });
  }

  // Skill — Jobs and Candidates only, same "real variety" gate.
  if (kind === "job" || kind === "candidate") {
    const skillNames = distinctValues(
      items.flatMap((i) => (kind === "job" ? i.skills ?? [] : i.skillLinks ?? []).map((s: any) => s.skill?.name ?? s.name)),
      (n: string) => n
    );
    if (skillNames.length > 1) {
      components.push({
        id: "filter_skill_picker",
        component: "ChoicePicker",
        value: { path: "filter/skill" },
        options: [{ label: "All skills", value: "ALL" }, ...skillNames.map((n) => ({ label: n, value: n }))],
        placeholder: "Filter by skill",
      });
    }
  }

  // Name search — Candidates only, useful any time there's more than one to browse.
  if (kind === "candidate" && items.length > 1) {
    components.push({
      id: "filter_name_search",
      component: "TextField",
      label: "Search by name",
      value: { path: "filter/name" },
      variant: "shortText",
    });
  }

  return components;
}

// Params that mean "the caller already scoped this to something specific" —
// showing filter controls over an already-narrowed (often single-record)
// result set adds noise, not utility.
const NARROWING_PARAMS: Record<string, string[]> = {
  search_jobs: ["title", "department"],
  search_candidates: ["name", "skill", "jobId"],
  search_interviews: ["interviewId", "jobId", "round"],
  search_offers: ["candidateId"],
  search_skills: ["search"],
  search_users: ["search"],
  get_candidate_profile: ["candidateId"],
};

function isNarrowingCall(tool: string, args: any): boolean {
  const params = NARROWING_PARAMS[tool];
  if (!params) return false;
  return params.some((p) => args?.[p] !== undefined && args?.[p] !== null && args?.[p] !== "");
}

const FILTER_DEFAULTS: Record<string, { path: string; value: unknown }> = {
  filter_status_picker: { path: "filter/status", value: "ALL" },
  filter_skill_picker: { path: "filter/skill", value: "ALL" },
  filter_name_search: { path: "filter/name", value: "" },
};

function seedFilterDefaults(components: A2uiComponent[]): A2uiMessage[] {
  return components
    .map((c) => FILTER_DEFAULTS[c.id])
    .filter((d): d is { path: string; value: unknown } => !!d)
    .map((d) => ({ version: "v0.9" as const, updateDataModel: { surfaceId: SURFACE_ID, path: d.path, value: d.value } }));
}

// Returns [cardComponent, ...optionalButtonComponents] for an item.
// Buttons are only emitted when TFButton is in the allowed catalog set AND
// the caller's role matches that action's REST-route RBAC.
function itemToComponents(item: any, allowed: Set<string>, fallbackIndex: number, role: string): A2uiComponent[] {
  // Interview — has round field. Note: for role === "INTERVIEWER", the
  // upstream search_interviews query already hardcodes interviewerId to
  // the caller, so any row reaching here for that role is already theirs —
  // no separate "is this my interview" check is needed.
  if (item.round !== undefined && allowed.has("InterviewRow")) {
    const card: A2uiComponent = {
      id: `interview_${item.id}`,
      component: "InterviewRow",
      interviewId: item.id,
      candidateName: item.candidate?.name ?? "Candidate",
      round: item.round,
      stageName: item.stage?.name,
      scheduledAt: item.scheduledAt ? new Date(item.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : undefined,
      interviewerName: item.interviewer?.name,
      status: item.status,
      filterStatus: { path: "filter/status" },
    };
    if (!allowed.has("TFButton")) return [card];

    const buttons: A2uiComponent[] = [];
    if (role === "ADMIN" || role === "HR") {
      buttons.push({
        id: `btn_reschedule_${item.id}`,
        component: "TFButton",
        label: "Reschedule",
        actionName: "reschedule_interview",
        variant: "outline",
        payload: { interviewId: item.id },
      });
      const archived = item.archivedAt != null;
      buttons.push({
        id: `btn_archive_interview_${item.id}`,
        component: "TFButton",
        label: archived ? "Restore" : "Archive",
        actionName: archived ? "restore_interview" : "archive_interview",
        variant: archived ? "outline" : "destructive",
        payload: { interviewId: item.id },
      });
    }
    if ((role === "ADMIN" || role === "INTERVIEWER") && !item.scorecard) {
      buttons.push({
        id: `btn_scorecard_${item.id}`,
        component: "TFButton",
        label: "Submit Scorecard",
        actionName: "submit_scorecard",
        variant: "outline",
        payload: { interviewId: item.id },
      });
    }
    return [card, ...buttons];
  }
  // Job — has title + department
  if (item.title && item.department && allowed.has("JobCard")) {
    const card: A2uiComponent = {
      id: `job_${item.id}`,
      component: "JobCard",
      jobId: item.id,
      title: item.title,
      department: item.department,
      status: item.status,
      employmentType: item.employmentType,
      jobLevel: item.jobLevel,
      payMin: item.payMin ? Number(item.payMin) : undefined,
      payMax: item.payMax ? Number(item.payMax) : undefined,
      payCurrency: item.payCurrency,
      candidateCount: item._count?.candidates,
      skills: (item.skills ?? []).map((s: any) => s.skill.name),
      filterStatus: { path: "filter/status" },
      filterSkill: { path: "filter/skill" },
    };
    if (!allowed.has("TFButton") || (role !== "ADMIN" && role !== "HR")) return [card];
    const editBtn: A2uiComponent = {
      id: `btn_edit_job_${item.id}`,
      component: "TFButton",
      label: "Edit",
      actionName: "edit_job",
      variant: "outline",
      payload: { jobId: item.id },
    };
    const archived = item.archivedAt != null;
    const archiveBtn: A2uiComponent = {
      id: `btn_archive_job_${item.id}`,
      component: "TFButton",
      label: archived ? "Restore" : "Archive",
      actionName: archived ? "restore_job" : "archive_job",
      variant: archived ? "outline" : "destructive",
      payload: { jobId: item.id },
    };
    return [card, editBtn, archiveBtn];
  }
  // Candidate — has name + skillLinks (governed skill relation, may be an
  // empty array for a candidate with no skills, but the field is present)
  if (item.name && item.skillLinks !== undefined && allowed.has("CandidateCard")) {
    const card: A2uiComponent = {
      id: `candidate_${item.id}`,
      component: "CandidateCard",
      candidateId: item.id,
      name: item.name,
      jobTitle: item.job?.title,
      skills: (item.skillLinks ?? []).map((sl: any) => ({ id: sl.skill.id, name: sl.skill.name, category: sl.skill.category })),
      status: item.status,
      location: item.location,
      experience: item.experience ?? undefined,
      filterStatus: { path: "filter/status" },
      filterSkill: { path: "filter/skill" },
      filterName: { path: "filter/name" },
    };
    if (!allowed.has("TFButton")) return [card];
    const viewBtn: A2uiComponent = {
      id: `btn_view_${item.id}`,
      component: "TFButton",
      label: "View Profile",
      actionName: "view_candidate",
      variant: "outline",
      payload: { candidateId: item.id },
    };
    if (role !== "ADMIN" && role !== "HR") return [card, viewBtn];
    const editBtn: A2uiComponent = {
      id: `btn_edit_candidate_${item.id}`,
      component: "TFButton",
      label: "Edit",
      actionName: "edit_candidate",
      variant: "outline",
      payload: { candidateId: item.id },
    };
    const archived = item.archivedAt != null;
    const archiveBtn: A2uiComponent = {
      id: `btn_archive_candidate_${item.id}`,
      component: "TFButton",
      label: archived ? "Restore" : "Archive",
      actionName: archived ? "restore_candidate" : "archive_candidate",
      variant: archived ? "outline" : "destructive",
      payload: { candidateId: item.id },
    };
    return [card, viewBtn, editBtn, archiveBtn];
  }
  // Offer — has salary + candidateId + jobId, none of the above shapes.
  // Checked after Job/Candidate/Interview since it's otherwise unambiguous.
  if (item.salary !== undefined && item.candidateId && item.jobId && allowed.has("OfferCard")) {
    const card: A2uiComponent = {
      id: `offer_${item.id}`,
      component: "OfferCard",
      offerId: item.id,
      candidateName: item.candidate?.name ?? "Candidate",
      jobTitle: item.job?.title,
      salary: Number(item.salary),
      status: item.status,
      filterStatus: { path: "filter/status" },
    };
    if (!allowed.has("TFButton")) return [card];

    const buttons: A2uiComponent[] = [];
    if (role === "ADMIN" || role === "HR") {
      buttons.push({
        id: `btn_edit_offer_${item.id}`,
        component: "TFButton",
        label: "Edit",
        actionName: "edit_offer",
        variant: "outline",
        payload: { offerId: item.id },
      });
    }
    if ((role === "ADMIN" || role === "MANAGER") && item.status === "DRAFT") {
      buttons.push({
        id: `btn_approve_offer_${item.id}`,
        component: "TFButton",
        label: "Approve",
        actionName: "approve_offer",
        variant: "default",
        payload: { offerId: item.id },
      });
    }
    if (role === "ADMIN" || role === "HR") {
      const archived = item.archivedAt != null;
      buttons.push({
        id: `btn_archive_offer_${item.id}`,
        component: "TFButton",
        label: archived ? "Restore" : "Archive",
        actionName: archived ? "restore_offer" : "archive_offer",
        variant: archived ? "outline" : "destructive",
        payload: { offerId: item.id },
      });
    }
    return [card, ...buttons];
  }
  // Skill — has category + name, none of the shapes above (checked last
  // among the "real" branches since it's the least distinctive: category
  // alone is what makes it unambiguous, since Job/Candidate/Interview/Offer
  // never carry that field).
  if (item.category !== undefined && item.name && allowed.has("SkillCard")) {
    const card: A2uiComponent = {
      id: `skill_${item.id}`,
      component: "SkillCard",
      skillId: item.id,
      name: item.name,
      category: item.category,
      description: item.description ?? undefined,
      filterStatus: { path: "filter/status" },
    };
    if (!allowed.has("TFButton") || role !== "ADMIN") return [card];
    const editBtn: A2uiComponent = {
      id: `btn_edit_skill_${item.id}`,
      component: "TFButton",
      label: "Edit",
      actionName: "edit_skill",
      variant: "outline",
      payload: { skillId: item.id },
    };
    const deleteBtn: A2uiComponent = {
      id: `btn_delete_skill_${item.id}`,
      component: "TFButton",
      label: "Delete",
      actionName: "delete_skill",
      variant: "destructive",
      payload: { skillId: item.id },
    };
    return [card, editBtn, deleteBtn];
  }
  // User (staff account) — has both email and a top-level role field.
  // Candidate also has email but never role; checked last among the "real"
  // branches so it's unambiguous regardless of order.
  if (item.email && item.role && allowed.has("UserCard")) {
    const card: A2uiComponent = {
      id: `user_${item.id}`,
      component: "UserCard",
      userId: item.id,
      name: item.name,
      email: item.email,
      role: item.role,
      department: item.department ?? undefined,
      filterStatus: { path: "filter/status" },
    };
    if (!allowed.has("TFButton") || role !== "ADMIN") return [card];
    const editBtn: A2uiComponent = {
      id: `btn_edit_user_${item.id}`,
      component: "TFButton",
      label: "Edit",
      actionName: "edit_user",
      variant: "outline",
      payload: { userId: item.id },
    };
    const archived = item.archivedAt != null;
    const archiveBtn: A2uiComponent = {
      id: `btn_archive_user_${item.id}`,
      component: "TFButton",
      label: archived ? "Restore" : "Archive",
      actionName: archived ? "restore_user" : "archive_user",
      variant: archived ? "outline" : "destructive",
      payload: { userId: item.id },
    };
    return [card, editBtn, archiveBtn];
  }
  // Fallback badge
  return [{
    id: `badge_${item.id ?? fallbackIndex}`,
    component: "Badge",
    label: item.title
      ? item.department ? `${item.title} · ${item.department}` : item.title
      : item.name || String(item.id ?? fallbackIndex),
    tone: item.salary !== undefined ? "success" : "neutral",
  }];
}

function buildPartialSurface(
  items: any[],
  role: string,
  allPriorChildIds: string[],
  isFirst: boolean,
  showFilters: boolean
): { messages: A2uiMessage[]; newChildIds: string[] } | null {
  if (items.length === 0) return null;
  const allowed = new Set(getCatalogForRole(role));

  const newComponents: A2uiComponent[] = [];
  const newChildIds: string[] = [];

  for (const item of items.slice(0, 20)) {
    const comps = itemToComponents(item, allowed, allPriorChildIds.length + newChildIds.length, role);
    for (const comp of comps) {
      newComponents.push(comp);
      // Only the first component (the card) is added to the root children list;
      // TFButton is a sibling in the layout but should also be a root child so
      // A2uiSurface can resolve it by ID.
      newChildIds.push(comp.id);
    }
  }

  if (newComponents.length === 0) return null;

  // The actual enforcement point: every component built from live data is
  // checked against the role-scoped catalog + its Zod prop schema before
  // it's allowed into an outgoing message. Anything that fails is dropped,
  // not sent — this is what makes "the agent can never invent UI" true.
  const { valid: validComponents, rejected } = validateA2UISurface(newComponents, role);
  if (rejected.length > 0) {
    console.warn("[a2ui] dropped invalid component(s) before emission:", rejected);
  }
  const validIds = new Set(validComponents.map((c) => c.id));
  const validChildIds = newChildIds.filter((id) => validIds.has(id));

  if (validComponents.length === 0) return null;

  const filterComponents = isFirst && showFilters ? buildFilterComponents(items) : [];
  const filterBarIds = filterComponents.map((c) => c.id);
  const allChildIds = [...filterBarIds, ...allPriorChildIds, ...validChildIds];
  const root: A2uiComponent = { id: "root", component: "TFColumn", children: allChildIds };

  const messages: A2uiMessage[] = [];
  if (isFirst) {
    messages.push({
      version: "v0.9",
      createSurface: {
        surfaceId: SURFACE_ID,
        catalogId: CATALOG_ID,
        theme: { agentDisplayName: "TalentFlow Agent", primaryColor: "#7c3aed" },
      },
    });
    messages.push(...seedFilterDefaults(filterComponents));
  }
  messages.push({
    version: "v0.9",
    updateComponents: { surfaceId: SURFACE_ID, components: [root, ...filterComponents, ...validComponents] },
  });

  return { messages, newChildIds: validChildIds };
}

function buildA2UISurfaceMessages(data: any[], role: string, showFilters: boolean): A2uiMessage[] | null {
  if (data.length === 0) return null;
  const allowed = new Set(getCatalogForRole(role));

  const components: A2uiComponent[] = [];
  const childIds: string[] = [];

  for (const item of data.slice(0, 20)) {
    const comps = itemToComponents(item, allowed, childIds.length, role);
    for (const comp of comps) {
      components.push(comp);
      childIds.push(comp.id);
    }
  }

  if (components.length === 0) return null;

  const { valid: validComponents, rejected } = validateA2UISurface(components, role);
  if (rejected.length > 0) {
    console.warn("[a2ui] dropped invalid component(s) before emission:", rejected);
  }
  const validIds = new Set(validComponents.map((c) => c.id));
  const validChildIds = childIds.filter((id) => validIds.has(id));

  if (validComponents.length === 0) return null;

  const filterComponents = showFilters ? buildFilterComponents(data) : [];
  const root: A2uiComponent = {
    id: "root",
    component: "TFColumn",
    children: [...filterComponents.map((c) => c.id), ...validChildIds],
  };

  return [
    {
      version: "v0.9",
      createSurface: {
        surfaceId: SURFACE_ID,
        catalogId: CATALOG_ID,
        theme: { agentDisplayName: "TalentFlow Agent", primaryColor: "#7c3aed" },
      },
    },
    ...seedFilterDefaults(filterComponents),
    { version: "v0.9", updateComponents: { surfaceId: SURFACE_ID, components: [root, ...filterComponents, ...validComponents] } },
  ];
}

export interface AgentStep {
  tool: string;
  args: any;
  resultCount: number | null;
}

export interface AgentResult {
  summary: string;
  steps: AgentStep[];
  data: any[];
}

// ---------------------------------------------------------------
// Non-streaming path (kept for the plain POST /search route)
// ---------------------------------------------------------------
export async function runAgent(prompt: string, caller: JwtPayload): Promise<AgentResult> {
  const toolDefinitions = getToolDefinitionsForRole(caller.role).filter((t) => !WRITE_TOOLS.has(t.name));

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_INSTRUCTION },
    { role: "user", content: prompt },
  ];

  const steps: AgentStep[] = [];
  const collectedData: any[] = [];

  let response = await withRetry(() => createCompletion(messages, toolDefinitions));

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const assistantMessage = response.choices[0].message;
    const toolCalls = assistantMessage.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      const allEmpty = steps.length > 0 && steps.every((s) => (s.resultCount ?? 0) === 0);
      const summary = allEmpty
        ? "No matching records found. Try a different search term or broaden your query."
        : cleanText(assistantMessage.content);
      return { summary, steps, data: collectedData };
    }

    // Append the assistant turn (with tool_calls) to the history
    messages.push(assistantMessage as Groq.Chat.ChatCompletionMessageParam);

    for (const call of toolCalls) {
      let args: any;
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
      }

      let result: any;
      try {
        result = await executeTool(call.function.name, args, caller);
      } catch (err: any) {
        result = { error: err.message };
      }

      const asArray = Array.isArray(result) ? result : result ? [result] : [];
      collectedData.push(...asArray);
      steps.push({ tool: call.function.name, args, resultCount: asArray.length });

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(toPlainJSON(result)),
      });
    }

    response = await withRetry(() => createCompletion(messages, toolDefinitions));
  }

  return { summary: "Reached the tool-call limit before finishing — try a narrower query.", steps, data: collectedData };
}

// ---------------------------------------------------------------
// Streaming path (used by /ws/search)
// ---------------------------------------------------------------
type EmitFn = (event: Record<string, any>) => void;

/**
 * Proposes a write action (stores it as a PendingAction, emits
 * action_proposed) — shared by both call sites: the LLM tool-calling loop
 * in runAgentStreaming below, and proposeActionDirect (for surface buttons
 * whose action maps 1:1 onto a known tool, see websocket.ts's
 * ACTION_TO_WRITE_TOOL — those skip the LLM entirely rather than relying on
 * it to infer, say, "edit_job" means call update_job, which it does not do
 * reliably since the names don't match).
 */
async function proposeWrite(
  tool: string,
  args: any,
  caller: JwtPayload,
  conversation: { id: string },
  emit: EmitFn
) {
  const description = await describeProposedAction(tool, args);
  const meta = WRITE_TOOL_META[tool] ?? { kind: "confirm" as const, submitLabel: "Confirm" };
  const fields = await buildFormFields(tool, args);
  const pending = await prisma.pendingAction.create({
    data: {
      userId: caller.userId,
      tool,
      args: toPlainJSON(args),
      description,
      expiresAt: new Date(Date.now() + PENDING_ACTION_TTL_MS),
    },
  });

  // Store A2UI messages so the history renderer can replay the ConfirmDialog.
  // Flat wire format: props are at the top level alongside `component` + `id`.
  const confirmMessages = [
    {
      version: "v0.9",
      createSurface: {
        surfaceId: SURFACE_ID,
        catalogId: CATALOG_ID,
        theme: { agentDisplayName: "TalentFlow Agent", primaryColor: "#7c3aed" },
      },
    },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [
          {
            id: "root",
            component: "TFColumn",
            children: ["confirm_dialog"],
          },
          {
            id: "confirm_dialog",
            component: "ConfirmDialog",
            title: "Confirm action",
            description,
            confirmAction: "confirm_pending_action",
            cancelAction: "cancel_pending_action",
            payload: { actionId: pending.id },
          },
        ],
      },
    },
  ];
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "agent",
      content: description,
      a2uiPayload: toPlainJSON(confirmMessages),
    },
  });

  emit({
    type: "action_proposed",
    actionId: pending.id,
    description,
    kind: meta.kind,
    submitLabel: meta.submitLabel,
    fields,
    conversationId: conversation.id,
  });
}

/**
 * Entry point for surface-button actions that map directly onto a known
 * write tool (edit_job -> update_job, archive_job -> archive_job, etc.) —
 * proposes immediately, no LLM round trip. RBAC is still enforced exactly
 * like the LLM path: a tool only proposes if getToolDefinitionsForRole
 * actually offers it to this caller's role.
 */
export async function proposeActionDirect(
  tool: string,
  args: any,
  caller: JwtPayload,
  conversationId: string | null,
  emit: EmitFn
) {
  emit({ type: "progress", message: "Checking permissions..." });

  const allowed = WRITE_TOOLS.has(tool) && getToolDefinitionsForRole(caller.role).some((t) => t.name === tool);
  if (!allowed) {
    emit({ type: "error", error: "You don't have permission to perform this action." });
    return;
  }

  const conversation = conversationId
    ? await prisma.conversation.findUnique({ where: { id: conversationId } })
    : await prisma.conversation.create({ data: { userId: caller.userId, title: tool.replace(/_/g, " ") } });

  if (!conversation || conversation.userId !== caller.userId) {
    emit({ type: "error", error: "Conversation not found" });
    return;
  }

  emit({ type: "progress", message: "Preparing..." });
  await proposeWrite(tool, args, caller, conversation, emit);
}

export async function runAgentStreaming(
  prompt: string,
  caller: JwtPayload,
  conversationId: string | null,
  emit: EmitFn,
  dataModel?: Record<string, unknown> | null
) {
  emit({ type: "progress", message: "Checking permissions..." });

  const conversation = conversationId
    ? await prisma.conversation.findUnique({ where: { id: conversationId } })
    : await prisma.conversation.create({ data: { userId: caller.userId, title: prompt.slice(0, 60) } });

  if (!conversation || conversation.userId !== caller.userId) {
    emit({ type: "error", error: "Conversation not found" });
    return;
  }

  // Only query on a genuine follow-up turn — a brand-new conversation
  // (conversationId === null) has nothing to load, skip the round trip.
  let history: Groq.Chat.ChatCompletionMessageParam[] = [];
  if (conversationId) {
    const priorMessages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: HISTORY_MESSAGE_LIMIT,
      select: { role: true, content: true, toolTrace: true },
    });
    history = priorMessages.reverse().map(messageToGroqTurn);
  }

  await prisma.message.create({
    data: { conversationId: conversation.id, role: "user", content: prompt },
  });

  emit({ type: "progress", message: "Thinking..." });

  const toolDefinitions = getToolDefinitionsForRole(caller.role);

  const augmentedPrompt = dataModel
    ? `${prompt}\n\n[User's current filter state: ${JSON.stringify(dataModel)}]`
    : prompt;

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_INSTRUCTION },
    ...history,
    { role: "user", content: augmentedPrompt },
  ];

  const steps: AgentStep[] = [];
  const collectedData: any[] = [];
  let surfaceChildIds: string[] = [];
  let surfaceStarted = false;

  let response = await withRetry(() => createCompletion(messages, toolDefinitions));

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const assistantMessage = response.choices[0].message;
    const toolCalls = assistantMessage.tool_calls;

    if (!toolCalls || toolCalls.length === 0) break;

    // Append the assistant turn to history
    messages.push(assistantMessage as Groq.Chat.ChatCompletionMessageParam);

    for (const call of toolCalls) {
      const name = call.function.name;

      let args: any;
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
      }

      // ---- Level 3: propose, never auto-execute ----
      if (WRITE_TOOLS.has(name)) {
        await proposeWrite(name, args, caller, conversation, emit);
        return;
      }

      // ---- Level 1/2: read tools execute immediately ----
      emit({ type: "progress", message: describeReadStep(name) });

      let result: any;
      try {
        result = await executeTool(name, args, caller);
      } catch (err: any) {
        result = { error: err.message };
      }
      const asArray = Array.isArray(result) ? result : result ? [result] : [];
      collectedData.push(...asArray);
      steps.push({ tool: name, args, resultCount: asArray.length });

      const narrowed = asArray.length <= 1 || isNarrowingCall(name, args);
      const partial = buildPartialSurface(asArray, caller.role, surfaceChildIds, !surfaceStarted, !narrowed);
      if (partial) {
        surfaceChildIds = [...surfaceChildIds, ...partial.newChildIds];
        surfaceStarted = true;
        emit({ type: "surface_update", a2uiMessages: partial.messages });
      }

      emit({ type: "progress", message: `Found ${asArray.length} result${asArray.length === 1 ? "" : "s"}...` });

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(toPlainJSON(result)),
      });

      response = await withRetry(() => createCompletion(messages, toolDefinitions));
    }
  }

  emit({ type: "progress", message: "Preparing results..." });

  const finalText = response.choices[0].message.content;
  const rawSummary = cleanText(finalText);
  const allEmpty = steps.length > 0 && steps.every((s) => (s.resultCount ?? 0) === 0);
  const summary = allEmpty
    ? "No matching records found. Try a different search term or broaden your query."
    : rawSummary || "Reached the tool-call limit before finishing — try a narrower query.";
  const overallNarrowed = collectedData.length <= 1 || steps.every((s) => isNarrowingCall(s.tool, s.args));
  const a2uiMessages = surfaceStarted ? null : buildA2UISurfaceMessages(collectedData, caller.role, !overallNarrowed);

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "agent",
      content: summary,
      a2uiPayload: a2uiMessages ? toPlainJSON(a2uiMessages) : undefined,
      toolTrace: toPlainJSON(steps),
    },
  });

  emit({
    type: "final",
    conversationId: conversation.id,
    summary,
    steps,
    data: collectedData,
    a2uiMessages,
  });
}

function describeReadStep(toolName: string): string {
  const labels: Record<string, string> = {
    search_jobs: "Searching jobs...",
    search_candidates: "Searching candidates...",
    search_interviews: "Searching interviews...",
    search_offers: "Searching offers...",
    get_candidate_profile: "Loading candidate profile...",
  };
  return labels[toolName] || "Searching...";
}
