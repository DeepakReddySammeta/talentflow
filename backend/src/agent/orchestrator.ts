import { createCompletion, SYSTEM_INSTRUCTION, ChatMessage } from "./llm";
import { getToolDefinitionsForRole, executeTool, WRITE_TOOLS, describeProposedAction, summarizeToolResultForModel } from "./tools";
import { buildFormFields, WRITE_TOOL_META } from "./forms";
import { JwtPayload } from "../types";
import { prisma } from "../lib/prisma";
import { validateA2UISurface } from "./catalog";
import { AgentResultCache, buildCacheKey } from "../lib/agentCache";

const MAX_TOOL_ITERATIONS = 5;
const PENDING_ACTION_TTL_MS = 10 * 60 * 1000; // 10 minutes
const HISTORY_MESSAGE_LIMIT = 12; // ~6 prior turns — lightweight text-only replay

/**
 * Turns a stored Message row back into a chat turn for conversational
 * memory. Only ever replays the plain `content` text as alternating
 * user/assistant turns — never fabricates tool_calls/tool role messages,
 * since those were never persisted in the LLM's native format and
 * reconstructing fake ones would be fragile.
 */
function messageToGroqTurn(msg: { role: string; content: string; toolTrace: unknown }): ChatMessage {
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

// Field-sniffing rules shared by buildFilterComponents (below) and
// groupByKind (further down) — run once per batch/item as needed.
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

  // Skill — Candidates only (the grid pattern is the only one wired to
  // consume filterSkill; Jobs render as a table now, same "real variety" gate).
  if (kind === "candidate") {
    const skillNames = distinctValues(
      items.flatMap((i) => (i.skillLinks ?? []).map((s: any) => s.skill?.name ?? s.name)),
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

// ---------------------------------------------------------------
// Result rendering: items are grouped by entity kind, and each kind gets
// ONE composite list component (EntityGrid / EntityTable / EntityAccordion)
// carrying its full item array — rather than the old one-component-per-item
// approach, where each row's action buttons were separate root-level
// siblings (rendering as full-width bars stacked under the card). Actions
// now travel as data on the item itself, and the composite component lays
// them out inline with the row they belong to.
// ---------------------------------------------------------------

const JOB_LEVEL_SHORT: Record<string, string> = {
  INTERN: "Intern", JUNIOR: "Junior", MID: "Mid", SENIOR: "Senior",
  LEAD: "Lead", MANAGER: "Manager", DIRECTOR: "Director",
};
const EMP_TYPE_SHORT: Record<string, string> = {
  FULL_TIME: "Full-time", PART_TIME: "Part-time", CONTRACT: "Contract",
  FREELANCE: "Freelance", INTERNSHIP: "Internship",
};
const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin", HR: "HR", MANAGER: "Manager", INTERVIEWER: "Interviewer",
};
const SKILL_CATEGORY_LABEL: Record<string, string> = {
  TECHNICAL: "Technical", HUMAN: "Human", MANAGEMENT: "Management", DOMAIN: "Domain",
};

function formatPay(min?: number, max?: number, currency?: string): string | null {
  if (!min && !max) return null;
  const sym = currency === "USD" ? "$" : "₹";
  const fmt = (n: number) => (n >= 100000 ? `${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L` : `${(n / 1000).toFixed(0)}K`);
  if (min && max) return `${sym}${fmt(min)} – ${sym}${fmt(max)}`;
  if (min) return `From ${sym}${fmt(min)}`;
  return `Up to ${sym}${fmt(max!)}`;
}

function formatSalary(salary: number): string {
  const fmt = (n: number) => (n >= 100000 ? `${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L` : `${(n / 1000).toFixed(0)}K`);
  return `₹${fmt(salary)}`;
}

interface UIAction {
  label: string;
  actionName: string;
  variant?: "default" | "outline" | "ghost" | "destructive";
  payload?: Record<string, unknown>;
}

// Same RBAC every action already had as a standalone TFButton — just
// gathered into one place instead of scattered across per-entity builders.
function buildActions(kind: Exclude<EntityKind, null>, item: any, role: string): UIAction[] {
  const archived = item.archivedAt != null;
  switch (kind) {
    case "interview": {
      const actions: UIAction[] = [];
      if (role === "ADMIN" || role === "HR") {
        actions.push({ label: "Reschedule", actionName: "reschedule_interview", variant: "outline", payload: { interviewId: item.id } });
        actions.push({
          label: archived ? "Restore" : "Archive",
          actionName: archived ? "restore_interview" : "archive_interview",
          variant: archived ? "outline" : "destructive",
          payload: { interviewId: item.id },
        });
      }
      if ((role === "ADMIN" || role === "INTERVIEWER") && !item.scorecard) {
        actions.push({ label: "Submit Scorecard", actionName: "submit_scorecard", variant: "outline", payload: { interviewId: item.id } });
      }
      return actions;
    }
    case "job": {
      if (role !== "ADMIN" && role !== "HR") return [];
      return [
        { label: "Edit", actionName: "edit_job", variant: "outline", payload: { jobId: item.id } },
        {
          label: archived ? "Restore" : "Archive",
          actionName: archived ? "restore_job" : "archive_job",
          variant: archived ? "outline" : "destructive",
          payload: { jobId: item.id },
        },
      ];
    }
    case "candidate": {
      const actions: UIAction[] = [
        { label: "View Profile", actionName: "view_candidate", variant: "outline", payload: { candidateId: item.id } },
      ];
      if (role === "ADMIN" || role === "HR") {
        actions.push({ label: "Edit", actionName: "edit_candidate", variant: "outline", payload: { candidateId: item.id } });
        actions.push({
          label: archived ? "Restore" : "Archive",
          actionName: archived ? "restore_candidate" : "archive_candidate",
          variant: archived ? "outline" : "destructive",
          payload: { candidateId: item.id },
        });
      }
      return actions;
    }
    case "offer": {
      const actions: UIAction[] = [];
      if (role === "ADMIN" || role === "HR") {
        actions.push({ label: "Edit", actionName: "edit_offer", variant: "outline", payload: { offerId: item.id } });
      }
      if ((role === "ADMIN" || role === "MANAGER") && item.status === "DRAFT") {
        actions.push({ label: "Approve", actionName: "approve_offer", variant: "default", payload: { offerId: item.id } });
      }
      if (role === "ADMIN" || role === "HR") {
        actions.push({
          label: archived ? "Restore" : "Archive",
          actionName: archived ? "restore_offer" : "archive_offer",
          variant: archived ? "outline" : "destructive",
          payload: { offerId: item.id },
        });
      }
      return actions;
    }
    case "skill": {
      if (role !== "ADMIN") return [];
      return [
        { label: "Edit", actionName: "edit_skill", variant: "outline", payload: { skillId: item.id } },
        { label: "Delete", actionName: "delete_skill", variant: "destructive", payload: { skillId: item.id } },
      ];
    }
    case "user": {
      if (role !== "ADMIN") return [];
      return [
        { label: "Edit", actionName: "edit_user", variant: "outline", payload: { userId: item.id } },
        {
          label: archived ? "Restore" : "Archive",
          actionName: archived ? "restore_user" : "archive_user",
          variant: archived ? "outline" : "destructive",
          payload: { userId: item.id },
        },
      ];
    }
    default:
      return [];
  }
}

// Job/Candidate -> EntityGrid card item.
// Candidate -> EntityGrid card item.
function toGridItem(item: any, role: string) {
  const actions = buildActions("candidate", item, role);
  return {
    id: item.id,
    title: item.name,
    subtitle: item.job?.title,
    status: item.status,
    badges: [
      item.location ?? null,
      item.experience != null ? `${item.experience} yr${item.experience !== 1 ? "s" : ""}` : null,
    ].filter((b): b is string => !!b),
    skills: (item.skillLinks ?? []).map((sl: any) => ({ id: sl.skill.id, name: sl.skill.name, category: sl.skill.category })),
    actions,
  };
}

const TABLE_COLUMNS: Record<"job" | "interview" | "offer" | "user", { key: string; header: string }[]> = {
  job: [
    { key: "title", header: "Title" },
    { key: "department", header: "Department" },
    { key: "employmentType", header: "Type" },
    { key: "jobLevel", header: "Level" },
    { key: "pay", header: "Pay" },
    { key: "candidates", header: "Candidates" },
  ],
  interview: [
    { key: "candidate", header: "Candidate" },
    { key: "job", header: "Job" },
    { key: "round", header: "Round" },
    { key: "interviewer", header: "Interviewer" },
    { key: "scheduledAt", header: "Scheduled" },
  ],
  offer: [
    { key: "candidate", header: "Candidate" },
    { key: "job", header: "Job" },
    { key: "salary", header: "Salary" },
  ],
  user: [
    { key: "name", header: "Name" },
    { key: "email", header: "Email" },
    { key: "role", header: "Role" },
    { key: "department", header: "Department" },
  ],
};

// Job/Interview/Offer/User -> EntityTable row.
function toTableItem(kind: "job" | "interview" | "offer" | "user", item: any, role: string) {
  const actions = buildActions(kind, item, role);
  if (kind === "job") {
    const pay = formatPay(item.payMin ? Number(item.payMin) : undefined, item.payMax ? Number(item.payMax) : undefined, item.payCurrency);
    return {
      id: item.id,
      cells: {
        title: item.title,
        department: item.department,
        employmentType: item.employmentType ? EMP_TYPE_SHORT[item.employmentType] ?? item.employmentType : "—",
        jobLevel: item.jobLevel ? JOB_LEVEL_SHORT[item.jobLevel] ?? item.jobLevel : "—",
        pay: pay ?? "—",
        candidates: item._count?.candidates != null ? String(item._count.candidates) : "0",
      },
      status: item.status,
      actions,
    };
  }
  if (kind === "interview") {
    return {
      id: item.id,
      cells: {
        candidate: item.candidate?.name ?? "Candidate",
        job: item.job?.title ?? "—",
        round: `Round ${item.round}${item.stage?.name ? ` · ${item.stage.name}` : ""}`,
        interviewer: item.interviewer?.name ?? "—",
        scheduledAt: item.scheduledAt
          ? new Date(item.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
          : "—",
      },
      status: item.status,
      actions,
    };
  }
  if (kind === "offer") {
    return {
      id: item.id,
      cells: {
        candidate: item.candidate?.name ?? "Candidate",
        job: item.job?.title ?? "—",
        salary: formatSalary(Number(item.salary)),
      },
      status: item.status,
      actions,
    };
  }
  return {
    id: item.id,
    cells: {
      name: item.name,
      email: item.email,
      role: ROLE_LABEL[item.role] ?? item.role,
      department: item.department ?? "—",
    },
    actions,
  };
}

// Skill -> EntityAccordion groups, grouped by category.
function buildSkillAccordionGroups(items: any[], role: string) {
  const byCategory = new Map<string, any[]>();
  for (const item of items) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }
  const order = ["TECHNICAL", "HUMAN", "MANAGEMENT", "DOMAIN"];
  return order
    .filter((cat) => byCategory.has(cat))
    .map((cat) => ({
      key: cat,
      label: SKILL_CATEGORY_LABEL[cat] ?? cat,
      items: byCategory.get(cat)!.map((s) => ({
        id: s.id,
        title: s.name,
        subtitle: s.description ?? undefined,
        actions: buildActions("skill", s, role),
      })),
    }));
}

const ENTITY_LABEL: Record<Exclude<EntityKind, null>, string> = {
  job: "Jobs", candidate: "Candidates", interview: "Interviews",
  offer: "Offers", skill: "Skills", user: "Users",
};

const ENTITY_PATTERN: Record<Exclude<EntityKind, null>, "grid" | "table" | "accordion"> = {
  candidate: "grid",
  job: "table", interview: "table", offer: "table", user: "table",
  skill: "accordion",
};

function groupByKind(items: any[]): Map<Exclude<EntityKind, null>, any[]> {
  const map = new Map<Exclude<EntityKind, null>, any[]>();
  for (const item of items) {
    const kind = detectEntityKind(item);
    if (!kind) continue;
    const list = map.get(kind) ?? [];
    list.push(item);
    map.set(kind, list);
  }
  return map;
}

// Builds the ONE composite component for a kind, given its full
// (already-accumulated) item list. Component id is stable per kind so
// repeated calls across a streaming tool loop just replace it in place.
function buildCompositeComponent(kind: Exclude<EntityKind, null>, items: any[], role: string): A2uiComponent | null {
  if (items.length === 0) return null;
  const id = `composite_${kind}`;
  const pattern = ENTITY_PATTERN[kind];

  if (pattern === "grid") {
    return {
      id,
      component: "EntityGrid",
      entityLabel: ENTITY_LABEL[kind],
      items: items.map((it) => toGridItem(it, role)),
      filterStatus: { path: "filter/status" },
      filterSkill: { path: "filter/skill" },
      filterName: { path: "filter/name" },
    };
  }
  if (pattern === "table") {
    return {
      id,
      component: "EntityTable",
      entityLabel: ENTITY_LABEL[kind],
      columns: TABLE_COLUMNS[kind as "job" | "interview" | "offer" | "user"],
      items: items.map((it) => toTableItem(kind as "job" | "interview" | "offer" | "user", it, role)),
      filterStatus: { path: "filter/status" },
    };
  }
  return {
    id,
    component: "EntityAccordion",
    entityLabel: ENTITY_LABEL[kind],
    groups: buildSkillAccordionGroups(items, role),
  };
}

function buildA2UISurfaceMessages(data: any[], role: string, showFilters: boolean): A2uiMessage[] | null {
  const byKind = groupByKind(data);
  if (byKind.size === 0) return null;

  const filterComponents = showFilters ? buildFilterComponents(data) : [];
  const components: A2uiComponent[] = [...filterComponents];
  const rootChildIds: string[] = filterComponents.map((c) => c.id);

  for (const [kind, items] of byKind) {
    const comp = buildCompositeComponent(kind, items, role);
    if (!comp) continue;
    components.push(comp);
    rootChildIds.push(comp.id);
  }

  const { valid: validComponents, rejected } = validateA2UISurface(components, role);
  if (rejected.length > 0) {
    console.warn("[a2ui] dropped invalid component(s) before emission:", rejected);
  }
  if (validComponents.length === 0) return null;
  const validIds = new Set(validComponents.map((c) => c.id));
  const validRootChildIds = rootChildIds.filter((id) => validIds.has(id));

  const root: A2uiComponent = { id: "root", component: "TFColumn", children: validRootChildIds };

  return [
    {
      version: "v0.9",
      createSurface: {
        surfaceId: SURFACE_ID,
        catalogId: CATALOG_ID,
        theme: { agentDisplayName: "TalentFlow Agent", primaryColor: "#7c3aed" },
      },
    },
    ...seedFilterDefaults(filterComponents.filter((c) => validIds.has(c.id))),
    { version: "v0.9", updateComponents: { surfaceId: SURFACE_ID, components: [root, ...validComponents] } },
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

interface CachedStreamingResult {
  summary: string;
  steps: AgentStep[];
  data: any[];
  a2uiMessages: A2uiMessage[] | null;
  streamedA2ui: A2uiMessage[];
}

const plainResultCache = new AgentResultCache<AgentResult>();
const streamingResultCache = new AgentResultCache<CachedStreamingResult>();

/** Flushes both agent result caches. Call after any confirmed write — see actions.routes.ts. */
export function clearAgentCaches(): void {
  plainResultCache.clear();
  streamingResultCache.clear();
}

// ---------------------------------------------------------------
// Non-streaming path (kept for the plain POST /search route)
// ---------------------------------------------------------------
export async function runAgent(prompt: string, caller: JwtPayload): Promise<AgentResult> {
  const cacheKey = buildCacheKey(caller, prompt);
  const cached = plainResultCache.get(cacheKey);
  if (cached) return cached;

  const toolDefinitions = getToolDefinitionsForRole(caller.role).filter((t) => !WRITE_TOOLS.has(t.name));

  const messages: ChatMessage[] = [
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
      const result = { summary, steps, data: collectedData };
      plainResultCache.set(cacheKey, result);
      return result;
    }

    // Append the assistant turn (with tool_calls) to the history
    messages.push(assistantMessage as ChatMessage);

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
        content: JSON.stringify(toPlainJSON(summarizeToolResultForModel(call.function.name, result))),
      });
    }

    response = await withRetry(() => createCompletion(messages, toolDefinitions));
  }

  const result = { summary: "Reached the tool-call limit before finishing — try a narrower query.", steps, data: collectedData };
  plainResultCache.set(cacheKey, result);
  return result;
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
  let history: ChatMessage[] = [];
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

  const cacheKey = buildCacheKey(caller, prompt, dataModel);
  const cachedResult = streamingResultCache.get(cacheKey);
  if (cachedResult) {
    emit({ type: "progress", message: "Using cached results..." });
    if (cachedResult.streamedA2ui.length > 0) {
      emit({ type: "surface_update", a2uiMessages: cachedResult.streamedA2ui });
    }
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "agent",
        content: cachedResult.summary,
        a2uiPayload: cachedResult.a2uiMessages ? toPlainJSON(cachedResult.a2uiMessages) : undefined,
        toolTrace: toPlainJSON(cachedResult.steps),
      },
    });
    emit({
      type: "final",
      conversationId: conversation.id,
      summary: cachedResult.summary,
      steps: cachedResult.steps,
      data: cachedResult.data,
      a2uiMessages: cachedResult.a2uiMessages,
    });
    return;
  }

  emit({ type: "progress", message: "Thinking..." });

  const toolDefinitions = getToolDefinitionsForRole(caller.role);

  const augmentedPrompt = dataModel
    ? `${prompt}\n\n[User's current filter state: ${JSON.stringify(dataModel)}]`
    : prompt;

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_INSTRUCTION },
    ...history,
    { role: "user", content: augmentedPrompt },
  ];

  const steps: AgentStep[] = [];
  const collectedData: any[] = [];
  // One composite component per entity kind, accumulated across the tool
  // loop (a multi-hop query may touch more than one kind) — see
  // buildCompositeComponent above.
  const itemsByKind = new Map<Exclude<EntityKind, null>, any[]>();
  const kindsOnSurface = new Set<Exclude<EntityKind, null>>();
  let rootChildIds: string[] = [];
  let surfaceCreated = false;
  let filtersEmitted = false;
  const streamedA2ui: A2uiMessage[] = [];

  let response = await withRetry(() => createCompletion(messages, toolDefinitions));

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const assistantMessage = response.choices[0].message;
    const toolCalls = assistantMessage.tool_calls;

    if (!toolCalls || toolCalls.length === 0) break;

    // Append the assistant turn to history
    messages.push(assistantMessage as ChatMessage);

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
      const batchByKind = groupByKind(asArray);
      if (batchByKind.size > 0) {
        const outgoing: A2uiMessage[] = [];
        const emitComponents: A2uiComponent[] = [];

        if (!filtersEmitted && !narrowed) {
          filtersEmitted = true;
          const filterComponents = buildFilterComponents(asArray);
          if (filterComponents.length > 0) {
            rootChildIds.push(...filterComponents.map((c) => c.id));
            emitComponents.push(...filterComponents);
            outgoing.push(...seedFilterDefaults(filterComponents));
          }
        }

        for (const [kind, newItems] of batchByKind) {
          const merged = [...(itemsByKind.get(kind) ?? []), ...newItems];
          itemsByKind.set(kind, merged);
          const comp = buildCompositeComponent(kind, merged, caller.role);
          if (!comp) continue;
          emitComponents.push(comp);
          if (!kindsOnSurface.has(kind)) {
            kindsOnSurface.add(kind);
            rootChildIds.push(comp.id);
          }
        }

        const { valid: validComponents, rejected } = validateA2UISurface(emitComponents, caller.role);
        if (rejected.length > 0) {
          console.warn("[a2ui] dropped invalid component(s) before emission:", rejected);
        }

        if (validComponents.length > 0) {
          if (!surfaceCreated) {
            outgoing.unshift({
              version: "v0.9",
              createSurface: {
                surfaceId: SURFACE_ID,
                catalogId: CATALOG_ID,
                theme: { agentDisplayName: "TalentFlow Agent", primaryColor: "#7c3aed" },
              },
            });
            surfaceCreated = true;
          }
          const root: A2uiComponent = { id: "root", component: "TFColumn", children: rootChildIds };
          outgoing.push({ version: "v0.9", updateComponents: { surfaceId: SURFACE_ID, components: [root, ...validComponents] } });
          streamedA2ui.push(...outgoing);
          emit({ type: "surface_update", a2uiMessages: outgoing });
        }
      }

      emit({ type: "progress", message: `Found ${asArray.length} result${asArray.length === 1 ? "" : "s"}...` });

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(toPlainJSON(summarizeToolResultForModel(name, result))),
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
  const a2uiMessages = surfaceCreated ? null : buildA2UISurfaceMessages(collectedData, caller.role, !overallNarrowed);

  streamingResultCache.set(cacheKey, { summary, steps, data: collectedData, a2uiMessages, streamedA2ui });

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
