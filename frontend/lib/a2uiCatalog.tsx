"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { createComponentImplementation, basicCatalog } from "@a2ui/react/v0_9";
import { Catalog, MessageProcessor, CommonSchemas } from "@a2ui/web_core/v0_9";
import type { SurfaceModel } from "@a2ui/web_core/v0_9";
import type { ReactComponentImplementation } from "@a2ui/react/v0_9";
import { z } from "zod3";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SKILL_CATEGORY_COLORS } from "@/lib/skillCategoryStyles";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button as UiButton } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const CATALOG_ID = "https://talentflow.internal/catalog/v1";

// Structured action envelope — replaces the flat (name, payload) dispatch.
// surfaceId and sourceComponentId let the server route and audit actions.
export interface SurfaceActionEnvelope {
  name: string;
  surfaceId: string;
  sourceComponentId: string;
  timestamp: string; // ISO 8601 — A2uiClientAction spec requires a string
  context: Record<string, unknown>;
}

type SurfaceActionDispatch = (envelope: SurfaceActionEnvelope) => void;
export const SurfaceActionContext = createContext<SurfaceActionDispatch>(() => {});

// Use the canonical DynamicString from the A2UI library.
// GenericBinder classifies this union's { path } branch as DYNAMIC,
// resolves it from the DataModel signal, and auto-generates a setter.
const dynamicString = () => CommonSchemas.DynamicString;

// ── TFColumn (TalentFlow layout wrapper — used as the surface root) ─────────
// Named "TFColumn" so it does not shadow basicCatalog's built-in "Column",
// which supports ChildList dynamic templates that our simple version does not.
const ColumnImpl = createComponentImplementation(
  {
    name: "TFColumn",
    schema: z.object({ children: z.array(z.string()).optional() }).passthrough(),
  },
  ({ props, buildChild }) => (
    <div className="flex flex-col gap-3">
      {(props.children ?? []).map((id: string) => (
        <React.Fragment key={id}>{buildChild(id)}</React.Fragment>
      ))}
    </div>
  )
);

const statusVariantMap: Record<string, string> = {
  OPEN: "success", DRAFT: "secondary", ON_HOLD: "warning", CLOSED: "outline", ARCHIVED: "outline",
  APPLIED: "secondary", IN_PROCESS: "warning", OFFERED: "success", HIRED: "success", REJECTED: "destructive",
  SCHEDULED: "secondary", CLEARED: "success", NO_SHOW: "destructive", CANCELLED: "destructive",
  SENT: "warning", ACCEPTED: "success", DECLINED: "destructive",
};

function statusBadge(status: string) {
  return (
    <Badge variant={(statusVariantMap[status] ?? "secondary") as any} className="text-xs shrink-0">
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

// ── Shared bits: action buttons + skill chips ─────────────────────────────────
// Every list pattern below (grid / table / accordion) attaches the same
// shape of action list to its rows — dispatched through SurfaceActionContext
// exactly like the old standalone TFButton did, just grouped with the row it
// belongs to instead of floating as a full-width sibling underneath it.
const UIActionSchema = z.object({
  label: z.string(),
  actionName: z.string(),
  variant: z.enum(["default", "outline", "ghost", "destructive"]).optional(),
  payload: z.record(z.string(), z.any()).optional(),
});

const SkillChipSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(["TECHNICAL", "HUMAN", "MANAGEMENT", "DOMAIN"]),
});

type UIAction = z.infer<typeof UIActionSchema>;

// A single "⋯" trigger per row/card that opens the allowed actions for that
// item — replaces what used to be a row of always-visible buttons.
function ActionsMenu({
  actions,
  dispatch,
  componentId,
  keyPrefix,
  compact,
}: {
  actions?: UIAction[];
  dispatch: SurfaceActionDispatch;
  componentId: string;
  keyPrefix: string;
  compact?: boolean;
}) {
  if (!actions || actions.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <UiButton
          variant="ghost"
          size="icon"
          className={compact ? "h-5 w-5 shrink-0 -mr-1" : "h-8 w-8 shrink-0"}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className={compact ? "h-3 w-3" : "h-4 w-4"} />
        </UiButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((a) => (
          <DropdownMenuItem
            key={`${keyPrefix}_${a.actionName}`}
            className={a.variant === "destructive" ? "text-destructive focus:text-destructive" : undefined}
            onClick={() =>
              dispatch({
                name: a.actionName,
                surfaceId: "main",
                sourceComponentId: componentId,
                timestamp: new Date().toISOString(),
                context: a.payload ?? {},
              })
            }
          >
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SkillChips({ skills }: { skills?: z.infer<typeof SkillChipSchema>[] }) {
  if (!skills || skills.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {skills.map((s) => (
        <span
          key={s.id}
          className={`text-xs px-2 py-0.5 rounded-full ${SKILL_CATEGORY_COLORS[s.category as keyof typeof SKILL_CATEGORY_COLORS]}`}
        >
          {s.name}
        </span>
      ))}
    </div>
  );
}

// ── EntityGrid — Jobs & Candidates: 3-up card grid, infinite scroll ──────────
// Loads GRID_BATCH more cards from the already-fetched `items` array each
// time the sentinel at the bottom comes into view — no extra network round
// trip, since search tools already cap what's fetched server-side.
const GRID_BATCH = 9;

const EntityGridItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  status: z.string().optional(),
  badges: z.array(z.string()).optional(),
  skills: z.array(SkillChipSchema).optional(),
  actions: z.array(UIActionSchema).optional(),
});

const EntityGridImpl = createComponentImplementation(
  {
    name: "EntityGrid",
    schema: z.object({
      entityLabel: z.string(),
      items: z.array(EntityGridItemSchema),
      filterStatus: dynamicString().optional(),
      filterSkill: dynamicString().optional(),
      filterName: dynamicString().optional(),
    }),
  },
  ({ props, context }) => {
    const dispatch = useContext(SurfaceActionContext);
    const [visibleCount, setVisibleCount] = useState(GRID_BATCH);
    const sentinelRef = useRef<HTMLDivElement | null>(null);

    const filterStatus = props.filterStatus as string | undefined;
    const filterSkill = props.filterSkill as string | undefined;
    const filterName = props.filterName as string | undefined;

    const items = (props.items ?? []).filter((it) => {
      if (filterStatus && filterStatus !== "ALL" && filterStatus !== it.status) return false;
      if (filterSkill && filterSkill !== "ALL" && !(it.skills ?? []).some((s) => s.name === filterSkill)) return false;
      if (filterName && !it.title.toLowerCase().includes(filterName.toLowerCase())) return false;
      return true;
    });

    useEffect(() => {
      const el = sentinelRef.current;
      if (!el) return;
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            setVisibleCount((c) => Math.min(c + GRID_BATCH, items.length));
          }
        },
        { rootMargin: "200px" }
      );
      observer.observe(el);
      return () => observer.disconnect();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items.length]);

    if (items.length === 0) {
      return <p className="text-sm text-muted-foreground py-6 text-center">No {props.entityLabel.toLowerCase()} found.</p>;
    }

    const visible = items.slice(0, visibleCount);

    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">{items.length} {props.entityLabel.toLowerCase()}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((item) => (
            <Card key={item.id}>
              <CardContent className="pt-4 pb-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{item.title}</p>
                    {item.subtitle && <p className="text-xs text-muted-foreground mt-0.5">{item.subtitle}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {item.status && statusBadge(item.status)}
                    <ActionsMenu
                      actions={item.actions}
                      dispatch={dispatch}
                      componentId={context.componentModel.id}
                      keyPrefix={item.id}
                    />
                  </div>
                </div>
                {item.badges && item.badges.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {item.badges.map((b, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{b}</Badge>
                    ))}
                  </div>
                )}
                <SkillChips skills={item.skills} />
              </CardContent>
            </Card>
          ))}
        </div>
        {visibleCount < items.length && (
          <div ref={sentinelRef} className="py-2 text-center text-xs text-muted-foreground">
            Loading more…
          </div>
        )}
      </div>
    );
  }
);

// ── EntityTable — Interviews, Offers, Users: a table with pagination ─────────
// Paginates client-side over the already-fetched `items` array, matching the
// look of the dedicated /interviews, /offers, /users pages elsewhere.
const TABLE_PAGE_SIZE = 8;

const EntityTableItemSchema = z.object({
  id: z.string(),
  cells: z.record(z.string(), z.string()),
  status: z.string().optional(),
  actions: z.array(UIActionSchema).optional(),
});

const EntityTableImpl = createComponentImplementation(
  {
    name: "EntityTable",
    schema: z.object({
      entityLabel: z.string(),
      columns: z.array(z.object({ key: z.string(), header: z.string() })),
      items: z.array(EntityTableItemSchema),
      filterStatus: dynamicString().optional(),
    }),
  },
  ({ props, context }) => {
    const dispatch = useContext(SurfaceActionContext);
    const [page, setPage] = useState(1);
    const filterStatus = props.filterStatus as string | undefined;

    const items = (props.items ?? []).filter(
      (it) => !filterStatus || filterStatus === "ALL" || filterStatus === it.status
    );

    if (items.length === 0) {
      return <p className="text-sm text-muted-foreground py-6 text-center">No {props.entityLabel.toLowerCase()} found.</p>;
    }

    const totalPages = Math.max(1, Math.ceil(items.length / TABLE_PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * TABLE_PAGE_SIZE;
    const pageItems = items.slice(start, start + TABLE_PAGE_SIZE);
    const hasStatus = items.some((it) => it.status);
    const hasActions = items.some((it) => it.actions && it.actions.length > 0);

    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{items.length} {props.entityLabel.toLowerCase()}</p>
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {props.columns.map((col) => (
                  <TableHead key={col.key}>{col.header}</TableHead>
                ))}
                {hasStatus && <TableHead>Status</TableHead>}
                {hasActions && <TableHead className="w-1" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((row) => (
                <TableRow key={row.id}>
                  {props.columns.map((col) => (
                    <TableCell key={col.key}>{row.cells[col.key] ?? ""}</TableCell>
                  ))}
                  {hasStatus && <TableCell>{row.status ? statusBadge(row.status) : null}</TableCell>}
                  {hasActions && (
                    <TableCell>
                      <ActionsMenu
                        actions={row.actions}
                        dispatch={dispatch}
                        componentId={context.componentModel.id}
                        keyPrefix={row.id}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between px-1 py-1 text-xs text-muted-foreground">
          <span>Showing {start + 1}–{Math.min(start + TABLE_PAGE_SIZE, items.length)} of {items.length}</span>
          <div className="flex items-center gap-1">
            <UiButton
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </UiButton>
            <span className="px-1">{safePage} / {totalPages}</span>
            <UiButton
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={safePage >= totalPages}
              onClick={() => setPage(safePage + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </UiButton>
          </div>
        </div>
      </div>
    );
  }
);

// ── EntityAccordion — Skills: grouped by category, collapsible ───────────────
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

const EntityAccordionImpl = createComponentImplementation(
  {
    name: "EntityAccordion",
    schema: z.object({
      entityLabel: z.string(),
      groups: z.array(EntityAccordionGroupSchema),
    }),
  },
  ({ props, context }) => {
    const dispatch = useContext(SurfaceActionContext);
    const groups = props.groups ?? [];
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set(groups[0] ? [groups[0].key] : []));

    if (groups.length === 0) {
      return <p className="text-sm text-muted-foreground py-6 text-center">No {props.entityLabel.toLowerCase()} found.</p>;
    }

    function toggle(key: string) {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    }

    return (
      <div className="space-y-2">
        {groups.map((group) => {
          const isOpen = expanded.has(group.key);
          return (
            <div key={group.key} className="rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => toggle(group.key)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-medium text-foreground"
              >
                <span>
                  {group.label} <span className="text-muted-foreground font-normal">({group.items.length})</span>
                </span>
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </button>
              {isOpen && (
                <div className="flex flex-wrap gap-2 p-3">
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      title={item.subtitle ? `${item.title} — ${item.subtitle}` : item.title}
                      className="inline-flex max-w-[220px] items-center gap-1 rounded-full border border-border bg-card py-1 pl-3 pr-1.5 text-sm"
                    >
                      <span className="truncate text-foreground">{item.title}</span>
                      <ActionsMenu
                        actions={item.actions}
                        dispatch={dispatch}
                        componentId={context.componentModel.id}
                        keyPrefix={item.id}
                        compact
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }
);

// ── Badge ─────────────────────────────────────────────────────────────────────
const toneToVariant: Record<string, string> = {
  success: "success",
  warning: "warning",
  danger: "destructive",
  neutral: "secondary",
};

const BadgeImpl = createComponentImplementation(
  {
    name: "Badge",
    schema: z.object({
      label: z.string(),
      tone: z.enum(["success", "warning", "danger", "neutral"]).default("neutral"),
    }),
  },
  ({ props }) => (
    <Badge variant={(toneToVariant[props.tone] ?? "secondary") as any}>
      {props.label}
    </Badge>
  )
);

// ── TFRow (horizontal layout wrapper) ────────────────────────────────────────
// Named "TFRow" so it does not shadow basicCatalog's built-in "Row", which
// supports ChildList dynamic templates and justify/align props that this
// simpler version does not.
const TFRowImpl = createComponentImplementation(
  {
    name: "TFRow",
    schema: z.object({ children: z.array(z.string()).optional() }).passthrough(),
  },
  ({ props, buildChild }) => (
    <div className="flex flex-row flex-wrap gap-3">
      {(props.children ?? []).map((id: string) => (
        <React.Fragment key={id}>{buildChild(id)}</React.Fragment>
      ))}
    </div>
  )
);

// ── ConfirmDialog ─────────────────────────────────────────────────────────────
// Rendered when the backend emits a ConfirmDialog node in an a2uiPayload.
// Uses SurfaceActionContext to dispatch confirm/cancel back to the server.
const ConfirmDialogImpl = createComponentImplementation(
  {
    name: "ConfirmDialog",
    schema: z.object({
      title: z.string(),
      description: z.string().optional(),
      confirmLabel: z.string().optional(),
      cancelLabel: z.string().optional(),
      confirmAction: z.string(),
      cancelAction: z.string(),
      payload: z.record(z.string(), z.any()).optional(),
    }),
  },
  ({ props, context }) => {
    const dispatch = useContext(SurfaceActionContext);
    const componentId = context.componentModel.id;
    const baseEnvelope = {
      surfaceId: "main",
      sourceComponentId: componentId,
      timestamp: new Date().toISOString(),
      context: props.payload ?? {},
    };
    return (
      <Dialog defaultOpen>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{props.title}</DialogTitle>
            {props.description && (
              <DialogDescription>{props.description}</DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter>
            <UiButton
              variant="outline"
              onClick={() => dispatch({ ...baseEnvelope, name: props.cancelAction })}
            >
              {props.cancelLabel ?? "Cancel"}
            </UiButton>
            <UiButton
              onClick={() => dispatch({ ...baseEnvelope, name: props.confirmAction })}
            >
              {props.confirmLabel ?? "Confirm"}
            </UiButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

// ── TFButton ──────────────────────────────────────────────────────────────────
// Uses the structured SurfaceActionEnvelope so the server gets full context.
const ButtonImpl = createComponentImplementation(
  {
    name: "TFButton",
    schema: z.object({
      label: z.string(),
      actionName: z.string(),
      payload: z.record(z.string(), z.any()).optional(),
      variant: z.enum(["default", "outline", "ghost", "destructive"]).optional(),
    }),
  },
  ({ props, context }) => {
    const dispatch = useContext(SurfaceActionContext);
    return (
      <UiButton
        size="sm"
        variant={(props.variant ?? "outline") as any}
        onClick={() =>
          dispatch({
            name: props.actionName,
            surfaceId: "main",
            sourceComponentId: context.componentModel.id,
            timestamp: new Date().toISOString(),
            context: props.payload ?? {},
          })
        }
      >
        {props.label}
      </UiButton>
    );
  }
);

// ── ChoicePicker ──────────────────────────────────────────────────────────────
// Deliberately shadows basicCatalog's built-in "ChoicePicker" (which is
// multi-select, backed by a DynamicStringList) with this simpler single-select
// version — kept as "ChoicePicker" rather than renamed like TFColumn/TFRow
// because it's actively used for the status filter bar and its shape already
// matches backend/src/agent/catalog.ts's ChoicePickerProps exactly; renaming
// it would touch a live path for no functional benefit.
//
// `value` is a DYNAMIC prop — the schema union { path } branch tells
// GenericBinder to bind it to the DataModel signal at that path.
// On change, `props.setValue` (auto-generated by GenericBinder for DYNAMIC fields)
// writes directly back into the DataModel, propagating to every bound component
// without a network round trip.
const ChoicePickerImpl = createComponentImplementation(
  {
    name: "ChoicePicker",
    schema: z.object({
      value: dynamicString().optional(),
      options: z.array(z.object({ label: z.string(), value: z.string() })),
      placeholder: z.string().optional(),
    }),
  },
  ({ props }) => {
    return (
      <Select
        value={(props.value as string) ?? ""}
        onValueChange={(val) => {
          // GenericBinder auto-generates setValue for DYNAMIC fields
          (props as any).setValue?.(val);
        }}
      >
        <SelectTrigger className="w-[160px] h-8 text-sm">
          <SelectValue placeholder={props.placeholder ?? "Filter…"} />
        </SelectTrigger>
        <SelectContent>
          {(props.options ?? []).map((opt: { label: string; value: string }) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
);

// ── Catalog factory ───────────────────────────────────────────────────────────
// EntityGrid/EntityTable/EntityAccordion are generic — unlike the old
// per-entity cards, none of them are role-gated here. Access control still
// happens exactly where it always has: upstream, in which tools/data a role
// can reach at all (tools.ts) and which actions the orchestrator attaches to
// each row (orchestrator.ts) — mirrors backend/src/agent/catalog.ts.
const baseComponents: ReactComponentImplementation[] = [
  ColumnImpl,
  TFRowImpl,
  EntityGridImpl,
  EntityTableImpl,
  EntityAccordionImpl,
  BadgeImpl,
  ButtonImpl,
  ChoicePickerImpl,
];

const basicComponents = Array.from(basicCatalog.components.values());

export function buildCatalog(role: string): Catalog<ReactComponentImplementation> {
  const tfComponents = role === "INTERVIEWER" ? baseComponents : [...baseComponents, ConfirmDialogImpl];
  return new Catalog(CATALOG_ID, [...basicComponents, ...tfComponents]);
}

// ── Surface bridge ────────────────────────────────────────────────────────────
export function surfaceMessagesToModel(
  messages: unknown[],
  catalog: Catalog<ReactComponentImplementation>
): SurfaceModel<ReactComponentImplementation> | null {
  if (!Array.isArray(messages) || messages.length === 0) return null;

  const processor = new MessageProcessor([catalog]);
  let model: SurfaceModel<ReactComponentImplementation> | null = null;

  processor.onSurfaceCreated((m) => {
    model = m;
  });

  try {
    processor.processMessages(messages as any);
  } catch (e) {
    console.error("[A2UI] surface processing failed:", e);
    return null;
  }

  return model;
}
