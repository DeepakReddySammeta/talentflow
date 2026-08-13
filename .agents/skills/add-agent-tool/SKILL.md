---
name: add-agent-tool
description: Add a new tool to the TalentFlow AI agent. Use when asked to add a tool to the agent, give the agent access to a new data source, add a new search or lookup tool, add a write tool that requires confirmation, extend what the agent can query or do, or add a new A2UI component for agent results.
compatibility: Designed for Claude Code and GitHub Copilot Agent mode.
---

## Overview

Adding a tool involves **three files edited in order**. Skipping any step or getting names out of sync causes runtime errors or silent failures.

1. `backend/src/agent/tools.ts` — defines the tool schema and executes it
2. `backend/src/agent/catalog.ts` — registers the UI component the tool result renders as
3. `frontend/lib/a2uiCatalog.tsx` — implements the React component

For the role matrix and tool scoping rules, read [`references/role-matrix.md`](references/role-matrix.md).
For the front/back catalog sync rules, read [`references/catalog-sync.md`](references/catalog-sync.md).

---

## Checklist

- [ ] Step 1: Add tool definition to `getToolDefinitionsForRole()` in `tools.ts`
- [ ] Step 2: Add tool execution to `executeTool()` in `tools.ts`
- [ ] Step 3 (write tools only): Add to `WRITE_TOOLS`, `executeConfirmedWrite()`, `describeProposedAction()`
- [ ] Step 4: Add Zod prop schema to `catalog.ts` (if new UI component)
- [ ] Step 5: Register component in `A2UI_CATALOG` and `getCatalogForRole()`
- [ ] Step 6: Implement React component in `frontend/lib/a2uiCatalog.tsx`
- [ ] Step 7: Register component in `talentFlowComponents` array
- [ ] Step 8: Add `itemToComponent()` case in `orchestrator.ts`
- [ ] Step 9: Typecheck — `cd backend && npx tsc --noEmit --ignoreDeprecations 5.0` and `cd frontend && npx tsc --noEmit`

---

## Step 1 — Tool definition in `tools.ts`

File: `backend/src/agent/tools.ts`, function `getToolDefinitionsForRole(role)`

Add an entry to the `definitions` array:

```typescript
{
  name: "search_<entity>",
  description: "One sentence: what it searches and when to use it.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      fieldName: { type: ["string", "null"], description: "What this filters" },
      numericField: { type: ["number", "null"] },
      enumField: { type: ["string", "null"], enum: ["VALUE_A", "VALUE_B", null] },
    },
  },
},
```

**Always use `type: ["string", "null"]` not `type: "string"` for optional params.** Groq validates tool call arguments strictly and rejects `null` if the schema only allows `string`. The `executeTool()` handler already treats null as undefined.

To restrict to specific roles, wrap in a conditional:

```typescript
if (role === "ADMIN" || role === "HR") {
  definitions.push({ name: "search_offers", ... });
}
```

Read [`references/role-matrix.md`](references/role-matrix.md) for the full scoping rules.

## Step 2 — Tool execution in `tools.ts`

Add a case to the `executeTool()` switch:

```typescript
case "search_<entity>":
  return prisma.<entity>.findMany({
    where: {
      fieldName: args.fieldName ? { contains: args.fieldName, mode: "insensitive" } : undefined,
      numericField: args.numericField ?? undefined,
      // Managers always scoped to their department:
      job: caller.role === "MANAGER" && caller.department
        ? { department: caller.department }
        : undefined,
    },
    include: { relatedModel: true },
    take: 20,
  });
```

Row-level RBAC belongs here as hardcoded WHERE clauses — never trust the LLM to apply scoping correctly.

## Step 3 — Write tools only

For tools that mutate data (schedule, create, update, delete):

```typescript
// In tools.ts
export const WRITE_TOOLS = new Set(["schedule_interview", "your_new_write_tool"]);

// Add to executeConfirmedWrite():
case "your_new_write_tool": {
  return prisma.<entity>.create({ data: { ...args } });
}

// Add to describeProposedAction():
case "your_new_write_tool": {
  const item = await prisma.<entity>.findUnique({ where: { id: args.entityId } });
  return `Create <entity> for ${item?.name ?? args.entityId}`;
}
```

Write tools are **never auto-executed**. The orchestrator calls `describeProposedAction()`, stores a `PendingAction` row, and emits `action_proposed` to the client. The user must confirm at `POST /search/actions/:id/confirm`.

## Step 4 — Zod prop schema in `catalog.ts`

File: `backend/src/agent/catalog.ts`

Add a Zod schema for the new component's props. Use `DynValue` for any prop that should be bindable to the DataModel:

```typescript
const MyCardProps = z.object({
  entityId: z.string(),
  name: z.string(),
  status: z.string().optional(),
  filterStatus: DynValue.optional(),  // always add this for card components
});
```

## Step 5 — Register in catalog

```typescript
export const A2UI_CATALOG = {
  // ... existing entries ...
  MyCard: MyCardProps,
} as const;

// In getCatalogForRole():
const base: A2UIComponentType[] = ["CandidateCard", "InterviewRow", "JobCard", ..., "MyCard"];
// Or restrict: if (role !== "INTERVIEWER") base.push("MyCard");
```

## Step 6 — React component in `a2uiCatalog.tsx`

File: `frontend/lib/a2uiCatalog.tsx`

```typescript
const MyCardImpl = createComponentImplementation(
  {
    name: "MyCard",   // MUST match catalog.ts key exactly
    schema: z.object({
      entityId: z.string(),
      name: z.string(),
      status: z.string().optional(),
      filterStatus: dynamicString().optional(),
    }),
  },
  ({ props }) => {
    const filter = props.filterStatus as string | undefined;
    if (filter && filter !== "ALL" && filter !== props.status) return null;
    return (
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium text-foreground">{props.name}</p>
            {props.status && statusBadge(props.status)}
          </div>
        </CardContent>
      </Card>
    );
  }
);
```

`dynamicString()` is already defined in the file as `z.union([z.string(), z.object({ path: z.string() })])`. Use it for any prop that receives a `{ path: "..." }` DataModel binding from the backend.

`statusBadge()` is a helper already defined in the file — use it for status chips.

## Step 7 — Register component

```typescript
const talentFlowComponents: ReactComponentImplementation[] = [
  ColumnImpl,
  CandidateCardImpl,
  InterviewRowImpl,
  JobCardImpl,
  MyCardImpl,   // add here
  // ...
];
```

## Step 8 — Add to `orchestrator.ts`

File: `backend/src/agent/orchestrator.ts`, function `itemToComponent()`

Add a detection branch before the badge fallback:

```typescript
// MyEntity — has entitySpecificField
if (item.entitySpecificField !== undefined && allowed.has("MyCard")) {
  return {
    id: `myentity_${item.id}`,
    component: "MyCard",
    entityId: item.id,
    name: item.name,
    status: item.status,
    filterStatus: { path: "filter/status" },
  };
}
```

Also add `_count: { select: { candidates: true } }` to the Prisma include if you want a count badge.

## Step 9 — Typecheck

```bash
cd backend && npx tsc --noEmit --ignoreDeprecations 5.0
cd frontend && npx tsc --noEmit
```

Both must be clean before the tool is usable.

---

## Gotchas

- Component `name` in `catalog.ts` key, `createComponentImplementation` `name` field, and `component:` in `itemToComponent()` output must be **byte-identical** — a single character difference causes a silent "component not found" render failure.
- `filterStatus: { path: "filter/status" }` must be included in every new card component emitted by the orchestrator. Without it, the ChoicePicker filter won't hide/show the new card type.
- The `enum` array in tool JSON Schema must include `null` when the field is optional: `enum: ["A", "B", null]`.
- Never call write tools inline — the orchestrator detects them via `WRITE_TOOLS.has(name)` and always proposes first.
