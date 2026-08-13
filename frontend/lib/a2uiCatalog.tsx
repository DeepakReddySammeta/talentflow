"use client";

import React, { createContext, useContext } from "react";
import { createComponentImplementation, basicCatalog } from "@a2ui/react/v0_9";
import { Catalog, MessageProcessor, CommonSchemas } from "@a2ui/web_core/v0_9";
import type { SurfaceModel } from "@a2ui/web_core/v0_9";
import type { ReactComponentImplementation } from "@a2ui/react/v0_9";
import { z } from "zod3";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SKILL_CATEGORY_COLORS, SKILL_CATEGORY_LABELS } from "@/lib/skillCategoryStyles";
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

// ── CandidateCard ─────────────────────────────────────────────────────────────
// `skills` is now governed CandidateSkill relation entries (id/name/category),
// not free text — rendered as category-colored chips, matching the Skills
// Master page's own color convention.
const CandidateSkillRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(["TECHNICAL", "HUMAN", "MANAGEMENT", "DOMAIN"]),
});

const CandidateCardImpl = createComponentImplementation(
  {
    name: "CandidateCard",
    schema: z.object({
      candidateId: z.string(),
      name: z.string(),
      jobTitle: z.string().optional(),
      skills: z.array(CandidateSkillRefSchema).optional(),
      status: z.string().optional(),
      location: z.string().optional(),
      experience: z.number().optional(),
      filterStatus: dynamicString().optional(),
      filterSkill: dynamicString().optional(),
      filterName: dynamicString().optional(),
    }),
  },
  ({ props }) => {
    const filter = props.filterStatus as string | undefined;
    const filterSkill = props.filterSkill as string | undefined;
    const filterName = props.filterName as string | undefined;
    if (filter && filter !== "ALL" && filter !== props.status) return null;
    if (filterSkill && filterSkill !== "ALL" && !(props.skills ?? []).some((s) => s.name === filterSkill)) return null;
    if (filterName && !props.name.toLowerCase().includes(filterName.toLowerCase())) return null;

    return (
      <Card>
        <CardContent className="pt-4 pb-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-foreground truncate">{props.name}</p>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                {props.jobTitle && <p className="text-xs text-muted-foreground">{props.jobTitle}</p>}
                {props.location && (
                  <span className="text-xs text-muted-foreground before:content-['·'] before:mr-2">{props.location}</span>
                )}
                {props.experience != null && (
                  <span className="text-xs text-muted-foreground before:content-['·'] before:mr-2">{props.experience} yr{props.experience !== 1 ? "s" : ""}</span>
                )}
              </div>
            </div>
            {props.status && statusBadge(props.status)}
          </div>
          {props.skills && props.skills.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {props.skills.map((s) => (
                <span
                  key={s.id}
                  className={`text-xs px-2 py-0.5 rounded-full ${SKILL_CATEGORY_COLORS[s.category as keyof typeof SKILL_CATEGORY_COLORS]}`}
                >
                  {s.name}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);

// ── InterviewRow ──────────────────────────────────────────────────────────────
const InterviewRowImpl = createComponentImplementation(
  {
    name: "InterviewRow",
    schema: z.object({
      interviewId: z.string(),
      candidateName: z.string(),
      round: z.number(),
      stageName: z.string().optional(),
      scheduledAt: z.string().optional(),
      interviewerName: z.string().optional(),
      status: z.string(),
      filterStatus: dynamicString().optional(),
    }),
  },
  ({ props }) => {
    const filter = props.filterStatus as string | undefined;
    if (filter && filter !== "ALL" && filter !== props.status) return null;

    return (
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card text-sm">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground truncate">{props.candidateName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Round {props.round}{props.stageName ? ` · ${props.stageName}` : ""}
            {props.interviewerName ? ` · ${props.interviewerName}` : ""}
          </p>
        </div>
        {props.scheduledAt && (
          <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">{props.scheduledAt}</span>
        )}
        {statusBadge(props.status)}
      </div>
    );
  }
);

// ── JobCard ───────────────────────────────────────────────────────────────────
const JOB_LEVEL_SHORT: Record<string, string> = {
  INTERN: "Intern", JUNIOR: "Junior", MID: "Mid", SENIOR: "Senior",
  LEAD: "Lead", MANAGER: "Manager", DIRECTOR: "Director",
};
const EMP_TYPE_SHORT: Record<string, string> = {
  FULL_TIME: "Full-time", PART_TIME: "Part-time", CONTRACT: "Contract",
  FREELANCE: "Freelance", INTERNSHIP: "Internship",
};

function formatPay(min?: number, max?: number, currency?: string) {
  if (!min && !max) return null;
  const sym = currency === "USD" ? "$" : "₹";
  const fmt = (n: number) => n >= 100000 ? `${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L` : `${(n / 1000).toFixed(0)}K`;
  if (min && max) return `${sym}${fmt(min)} – ${sym}${fmt(max)}`;
  if (min) return `From ${sym}${fmt(min)}`;
  return `Up to ${sym}${fmt(max!)}`;
}

const JobCardImpl = createComponentImplementation(
  {
    name: "JobCard",
    schema: z.object({
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
      filterStatus: dynamicString().optional(),
      filterSkill: dynamicString().optional(),
    }),
  },
  ({ props }) => {
    const filter = props.filterStatus as string | undefined;
    const filterSkill = props.filterSkill as string | undefined;
    if (filter && filter !== "ALL" && filter !== props.status) return null;
    if (filterSkill && filterSkill !== "ALL" && !(props.skills ?? []).includes(filterSkill)) return null;
    const pay = formatPay(props.payMin, props.payMax, props.payCurrency);
    return (
      <Card>
        <CardContent className="pt-4 pb-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-foreground truncate">{props.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{props.department}</p>
            </div>
            {props.status && statusBadge(props.status)}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {props.employmentType && (
              <Badge variant="outline" className="text-xs">{EMP_TYPE_SHORT[props.employmentType] ?? props.employmentType}</Badge>
            )}
            {props.jobLevel && (
              <Badge variant="outline" className="text-xs">{JOB_LEVEL_SHORT[props.jobLevel] ?? props.jobLevel}</Badge>
            )}
            {pay && (
              <Badge variant="outline" className="text-xs font-medium">{pay}</Badge>
            )}
            {props.candidateCount != null && (
              <Badge variant="secondary" className="text-xs">{props.candidateCount} candidate{props.candidateCount !== 1 ? "s" : ""}</Badge>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }
);

// ── OfferCard ────────────────────────────────────────────────────────────────
function formatSalary(salary: number) {
  const fmt = (n: number) => n >= 100000 ? `${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L` : `${(n / 1000).toFixed(0)}K`;
  return `₹${fmt(salary)}`;
}

const OfferCardImpl = createComponentImplementation(
  {
    name: "OfferCard",
    schema: z.object({
      offerId: z.string(),
      candidateName: z.string(),
      jobTitle: z.string().optional(),
      salary: z.number(),
      status: z.string(),
      filterStatus: dynamicString().optional(),
    }),
  },
  ({ props }) => {
    const filter = props.filterStatus as string | undefined;
    if (filter && filter !== "ALL" && filter !== props.status) return null;
    return (
      <Card>
        <CardContent className="pt-4 pb-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-foreground truncate">{props.candidateName}</p>
              {props.jobTitle && <p className="text-xs text-muted-foreground mt-0.5">{props.jobTitle}</p>}
            </div>
            {statusBadge(props.status)}
          </div>
          <Badge variant="outline" className="text-xs font-medium">{formatSalary(props.salary)}</Badge>
        </CardContent>
      </Card>
    );
  }
);

// ── SkillCard ────────────────────────────────────────────────────────────────
const SkillCardImpl = createComponentImplementation(
  {
    name: "SkillCard",
    schema: z.object({
      skillId: z.string(),
      name: z.string(),
      category: z.string(),
      description: z.string().optional(),
      filterStatus: dynamicString().optional(),
    }),
  },
  ({ props }) => (
    <Card>
      <CardContent className="pt-4 pb-3 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-foreground truncate">{props.name}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${SKILL_CATEGORY_COLORS[props.category as keyof typeof SKILL_CATEGORY_COLORS] ?? ""}`}>
            {SKILL_CATEGORY_LABELS[props.category as keyof typeof SKILL_CATEGORY_LABELS] ?? props.category}
          </span>
        </div>
        {props.description && <p className="text-xs text-muted-foreground">{props.description}</p>}
      </CardContent>
    </Card>
  )
);

// ── UserCard ─────────────────────────────────────────────────────────────────
const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin", HR: "HR", MANAGER: "Manager", INTERVIEWER: "Interviewer",
};

const UserCardImpl = createComponentImplementation(
  {
    name: "UserCard",
    schema: z.object({
      userId: z.string(),
      name: z.string(),
      email: z.string(),
      role: z.string(),
      department: z.string().optional(),
      filterStatus: dynamicString().optional(),
    }),
  },
  ({ props }) => (
    <Card>
      <CardContent className="pt-4 pb-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-foreground truncate">{props.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{props.email}</p>
          </div>
          <Badge variant="secondary" className="text-xs shrink-0">{ROLE_LABEL[props.role] ?? props.role}</Badge>
        </div>
        {props.department && (
          <Badge variant="outline" className="text-xs">{props.department}</Badge>
        )}
      </CardContent>
    </Card>
  )
);

// ── Table ─────────────────────────────────────────────────────────────────────
const TableImpl = createComponentImplementation(
  {
    name: "Table",
    schema: z.object({
      title: z.string().optional(),
      columns: z.array(z.string()),
      rows: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
    }),
  },
  ({ props }) => (
    <div className="space-y-2">
      {props.title && (
        <p className="text-sm font-medium text-foreground">{props.title}</p>
      )}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {props.columns.map((col: string) => (
                <TableHead key={col}>{col}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.rows.map((row: Record<string, string | number>, i: number) => (
              <TableRow key={i}>
                {props.columns.map((col: string) => (
                  <TableCell key={col}>{row[col] ?? ""}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
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
const baseComponents: ReactComponentImplementation[] = [
  ColumnImpl,
  TFRowImpl,
  CandidateCardImpl,
  InterviewRowImpl,
  JobCardImpl,
  TableImpl,
  BadgeImpl,
  ButtonImpl,
  ChoicePickerImpl,
];

const basicComponents = Array.from(basicCatalog.components.values());

export function buildCatalog(role: string): Catalog<ReactComponentImplementation> {
  // OfferCard carries salary — withheld from Interviewer same as
  // ConfirmDialog, mirroring backend/src/agent/catalog.ts's getCatalogForRole.
  const tfComponents =
    role === "INTERVIEWER"
      ? baseComponents
      : [...baseComponents, ConfirmDialogImpl, OfferCardImpl];

  // SkillCard/UserCard are ADMIN-only, matching getCatalogForRole on the
  // backend — other roles' search_skills results fall back to a plain
  // Badge, and non-Admins never get UserCard data at all (search_users
  // isn't offered to them).
  if (role === "ADMIN") tfComponents.push(SkillCardImpl, UserCardImpl);

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
