import { z } from "zod";

/**
 * A2UI component catalog contract (backend half).
 *
 * Component names and prop shapes must match the frontend catalog in
 * frontend/lib/a2uiCatalog.tsx exactly — keep them in sync.
 */

const DynValue = z.union([z.string(), z.object({ path: z.string() })]);

// Skills are governed CandidateSkill relation entries now, not free text —
// each carries its master category so the card can render a colored chip.
const CandidateSkillRef = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(["TECHNICAL", "HUMAN", "MANAGEMENT", "DOMAIN"]),
});

const CandidateCardProps = z.object({
  candidateId: z.string(),
  name: z.string(),
  jobTitle: z.string().optional(),
  skills: z.array(CandidateSkillRef).optional(),
  status: z.string().optional(),
  location: z.string().optional(),
  experience: z.number().optional(),
  filterStatus: DynValue.optional(),
  filterSkill: DynValue.optional(),
  filterName: DynValue.optional(),
});

const InterviewRowProps = z.object({
  interviewId: z.string(),
  candidateName: z.string(),
  round: z.number(),
  stageName: z.string().optional(),
  scheduledAt: z.string().optional(),
  interviewerName: z.string().optional(),
  status: z.string(),
  filterStatus: DynValue.optional(),
});

const TableProps = z.object({
  title: z.string().optional(),
  columns: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
});

const BadgeProps = z.object({
  label: z.string(),
  tone: z.enum(["success", "warning", "danger", "neutral"]).default("neutral"),
});

// Props match ConfirmDialogImpl in frontend/lib/a2uiCatalog.tsx.
// confirmAction / cancelAction are action name strings dispatched via
// SurfaceActionContext — the server routes them in websocket.ts.
const ConfirmDialogProps = z.object({
  title: z.string(),
  description: z.string().optional(),
  confirmLabel: z.string().optional(),
  cancelLabel: z.string().optional(),
  confirmAction: z.string(),
  cancelAction: z.string(),
  payload: z.record(z.string(), z.any()).optional(),
});

const JobCardProps = z.object({
  jobId: z.string(),
  title: z.string(),
  department: z.string(),
  status: z.string().optional(),
  employmentType: z.string().optional(),
  jobLevel: z.string().optional(),
  payMin: z.number().optional(),
  payMax: z.number().optional(),
  payCurrency: z.string().optional(),
  candidateCount: z.number().optional(),
  skills: z.array(z.string()).optional(),
  filterStatus: DynValue.optional(),
  filterSkill: DynValue.optional(),
});

// Never registered for INTERVIEWER role — salary data, mirrors the
// search_offers tool and GET /offers route both excluding that role.
const OfferCardProps = z.object({
  offerId: z.string(),
  candidateName: z.string(),
  jobTitle: z.string().optional(),
  salary: z.number(),
  status: z.string(),
  filterStatus: DynValue.optional(),
});

// ADMIN-only, mirrors the Skill master mutation RBAC (GET /skills is open
// to everyone, but this card's Edit/Delete buttons are ADMIN-gated in
// orchestrator.ts, and the component itself is ADMIN-only in the catalog
// since the tools that let an agent surface it meaningfully are ADMIN-only).
const SkillCardProps = z.object({
  skillId: z.string(),
  name: z.string(),
  category: z.string(),
  description: z.string().optional(),
  filterStatus: DynValue.optional(),
});

// ADMIN-only — everything about Users is (mirrors users.routes.ts's
// router-level allowRoles("ADMIN")).
const UserCardProps = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
  department: z.string().optional(),
  filterStatus: DynValue.optional(),
});

// TFRow is a horizontal layout wrapper (renamed from "Row" to avoid shadowing
// basicCatalog's built-in Row component, which supports ChildList dynamic
// templates and justify/align props that this simpler version doesn't).
const TFRowProps = z.object({
  children: z.array(z.string()).optional(),
}).passthrough();

// TFColumn is the TalentFlow root layout wrapper (renamed from "Column" to avoid
// shadowing basicCatalog's built-in Column component).
const TFColumnProps = z.object({
  children: z.array(z.string()).optional(),
}).passthrough();

const ChoicePickerProps = z.object({
  value: DynValue.optional(),
  options: z.array(z.object({ label: z.string(), value: z.string() })),
  placeholder: z.string().optional(),
});

// TFButton — action button that dispatches a SurfaceActionEnvelope to the server.
const TFButtonProps = z.object({
  label: z.string(),
  actionName: z.string(),
  payload: z.record(z.string(), z.any()).optional(),
  variant: z.enum(["default", "outline", "ghost", "destructive"]).optional(),
});

// TextField — from the official A2UI basic catalog (@a2ui/web_core's
// TextFieldApi), already implemented client-side via basicComponents; this
// registration is what actually makes it reachable, since validateA2UISurface
// drops any component name not in this registry. Shape matches TextFieldApi's
// schema exactly (label required, value/variant/validationRegexp optional).
const TextFieldProps = z.object({
  label: z.string(),
  value: DynValue.optional(),
  variant: z.enum(["longText", "number", "shortText", "obscured"]).optional(),
  validationRegexp: z.string().optional(),
});

// The registry: component type name -> its prop schema.
export const A2UI_CATALOG = {
  CandidateCard: CandidateCardProps,
  InterviewRow: InterviewRowProps,
  JobCard: JobCardProps,
  OfferCard: OfferCardProps,
  SkillCard: SkillCardProps,
  UserCard: UserCardProps,
  Table: TableProps,
  Badge: BadgeProps,
  ConfirmDialog: ConfirmDialogProps,
  TFRow: TFRowProps,
  TFColumn: TFColumnProps,
  ChoicePicker: ChoicePickerProps,
  TFButton: TFButtonProps,
  TextField: TextFieldProps,
} as const;

export type A2UIComponentType = keyof typeof A2UI_CATALOG;

/**
 * Role-scoped catalog subset — mirrors the tool-scoping pattern in tools.ts.
 * An Interviewer's agent session is never offered ConfirmDialog (write action
 * confirmation) regardless of what the model tries to emit.
 */
export function getCatalogForRole(role: string): A2UIComponentType[] {
  const base: A2UIComponentType[] = [
    "CandidateCard", "InterviewRow", "JobCard", "Table",
    "Badge", "TFRow", "TFColumn", "ChoicePicker", "TFButton", "TextField",
  ];
  if (role !== "INTERVIEWER") {
    // Offers carry salary — same exclusion as the search_offers tool and
    // GET /offers route. ConfirmDialog is also withheld from Interviewer
    // since they have no write tools that would ever propose one.
    base.push("ConfirmDialog", "OfferCard");
  }
  if (role === "ADMIN") {
    // search_skills is open to every role, but only ADMIN gets the rich
    // card with Edit/Delete affordances — other roles' skill results fall
    // through to a plain Badge, which is a fine degradation for read-only
    // reference data.
    base.push("SkillCard", "UserCard");
  }
  return base;
}

export interface A2uiComponentInput {
  id: string;
  component: string;
  children?: string[];
  [prop: string]: unknown;
}

export interface A2UIValidationResult {
  valid: A2uiComponentInput[];
  rejected: { id: string; component: string; reason: string }[];
}

/**
 * The actual enforcement point behind "the agent can never invent UI":
 * every component the orchestrator is about to emit is checked against the
 * role-scoped allow-list AND its Zod prop schema before it leaves the
 * server. A component whose type isn't allowed for this role, isn't a known
 * type at all, or whose props don't match the declared shape is dropped
 * rather than sent to the client — the client-side catalog would reject or
 * misrender it anyway, but this catches it at the source, with a reason.
 */
export function validateA2UISurface(
  components: A2uiComponentInput[],
  role: string
): A2UIValidationResult {
  const allowed: Set<string> = new Set(getCatalogForRole(role));
  const schemas: Record<string, z.ZodTypeAny> = A2UI_CATALOG;

  const valid: A2uiComponentInput[] = [];
  const rejected: A2UIValidationResult["rejected"] = [];

  for (const comp of components) {
    const { id, component } = comp;

    if (!allowed.has(component)) {
      rejected.push({ id, component, reason: `"${component}" is not in the ${role} catalog` });
      continue;
    }
    const schema = schemas[component];
    if (!schema) {
      rejected.push({ id, component, reason: `"${component}" is not a known component type` });
      continue;
    }

    const { id: _id, component: _component, ...props } = comp;
    const result = schema.safeParse(props);
    if (!result.success) {
      const reason = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
      rejected.push({ id, component, reason });
      continue;
    }

    valid.push(comp);
  }

  return { valid, rejected };
}
