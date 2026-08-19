import { z } from "zod";

/**
 * A2UI component catalog contract (backend half).
 *
 * Component names and prop shapes must match the frontend catalog in
 * frontend/lib/a2uiCatalog.tsx exactly — keep them in sync.
 */

const DynValue = z.union([z.string(), z.object({ path: z.string() })]);

// A single action button (Edit, Archive, View Profile, ...) attached to a
// row/card/item. actionName is dispatched via SurfaceActionEnvelope — the
// server routes it in websocket.ts. Shared across all three list patterns
// below rather than each having its own copy.
const UIActionSchema = z.object({
  label: z.string(),
  actionName: z.string(),
  variant: z.enum(["default", "outline", "ghost", "destructive"]).optional(),
  payload: z.record(z.string(), z.any()).optional(),
});

// Skills are governed CandidateSkill/JobSkill relation entries now, not
// free text — each carries its master category so the chip can be colored.
const SkillChipSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(["TECHNICAL", "HUMAN", "MANAGEMENT", "DOMAIN"]),
});

// ── EntityGrid — Jobs & Candidates: a card grid, 3-up, revealing more as
// the viewer scrolls (infinite scroll over the already-fetched item list —
// search tools already cap results server-side, so there's no further
// backend round trip needed to "load more").
const EntityGridItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  status: z.string().optional(),
  badges: z.array(z.string()).optional(),
  skills: z.array(SkillChipSchema).optional(),
  actions: z.array(UIActionSchema).optional(),
});

const EntityGridProps = z.object({
  entityLabel: z.string(),
  items: z.array(EntityGridItemSchema),
  filterStatus: DynValue.optional(),
  filterSkill: DynValue.optional(),
  filterName: DynValue.optional(),
});

// ── EntityTable — Interviews, Offers, Users: a proper table with a
// pagination footer, matching the look of the dedicated /interviews,
// /offers, /users pages elsewhere in the app.
const EntityTableColumnSchema = z.object({
  key: z.string(),
  header: z.string(),
});

const EntityTableItemSchema = z.object({
  id: z.string(),
  cells: z.record(z.string(), z.string()),
  status: z.string().optional(),
  actions: z.array(UIActionSchema).optional(),
});

const EntityTableProps = z.object({
  entityLabel: z.string(),
  columns: z.array(EntityTableColumnSchema),
  items: z.array(EntityTableItemSchema),
  filterStatus: DynValue.optional(),
});

// ── EntityAccordion — Skills: grouped by category into collapsible
// sections, which is how the Skills Master page already thinks about them.
const EntityAccordionItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  actions: z.array(UIActionSchema).optional(),
});

const EntityAccordionGroupSchema = z.object({
  key: z.string(),
  label: z.string(),
  items: z.array(EntityAccordionItemSchema),
});

const EntityAccordionProps = z.object({
  entityLabel: z.string(),
  groups: z.array(EntityAccordionGroupSchema),
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
  EntityGrid: EntityGridProps,
  EntityTable: EntityTableProps,
  EntityAccordion: EntityAccordionProps,
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
 * Role-scoped catalog subset. Unlike the old per-entity cards (JobCard,
 * OfferCard, SkillCard, ...), EntityGrid/EntityTable/EntityAccordion are
 * generic renderers — they carry no opinion about which role should see
 * them. The actual access control happens upstream, same as it always
 * has: a role only ever gets salary-bearing Offer rows, User rows, or
 * skill Edit/Delete actions in the first place if its tools/orchestrator
 * logic decided to hand them over (see tools.ts and orchestrator.ts).
 * ConfirmDialog remains the one component withheld outright, since an
 * Interviewer has no write tools that would ever propose one.
 */
export function getCatalogForRole(role: string): A2UIComponentType[] {
  const base: A2UIComponentType[] = [
    "EntityGrid", "EntityTable", "EntityAccordion",
    "Badge", "TFRow", "TFColumn", "ChoicePicker", "TFButton", "TextField",
  ];
  if (role !== "INTERVIEWER") base.push("ConfirmDialog");
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
