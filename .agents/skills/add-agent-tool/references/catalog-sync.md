# Catalog Sync — Backend ↔ Frontend

The A2UI catalog is defined in **two places** that must stay in sync. A mismatch causes a silent render failure — the component simply doesn't render, with no visible error.

## Backend: `backend/src/agent/catalog.ts`

- Zod prop schemas for validation before sending to the client
- `A2UI_CATALOG` map: `componentName → ZodSchema`
- `getCatalogForRole()`: returns allowed component names per role

## Frontend: `frontend/lib/a2uiCatalog.tsx`

- `createComponentImplementation` calls with Zod schemas (uses `zod3` alias, NOT `zod`)
- `talentFlowComponents` array registration
- `buildCatalog()` assembles the Catalog instance passed to A2UI

## What must match exactly

| Thing | Backend (`catalog.ts`) | Frontend (`a2uiCatalog.tsx`) |
|---|---|---|
| Component name | `A2UI_CATALOG` key | `name:` field in `createComponentImplementation` |
| Component name | `getCatalogForRole()` return | `talentFlowComponents` array entry |
| Prop names | Zod field names | Zod field names (must be identical) |
| Prop types | Zod type | Zod type (must be semantically equivalent) |

## The `zod3` import

The frontend uses `import { z } from "zod3"` (an npm alias for `zod@3.x`), NOT the standard `zod` import. This is because `@a2ui/web_core` ships its own Zod v3 internally and `createComponentImplementation` expects v3 schemas. The rest of the app uses Zod v4 (`import { z } from "zod"`). Do not mix them in `a2uiCatalog.tsx`.

## DataModel bindings (`dynamicString`)

Any prop that the backend sends as `{ path: "filter/status" }` instead of a literal string must use:

```typescript
// Frontend (zod3)
const dynamicString = () => z.union([z.string(), z.object({ path: z.string() })]);

// Backend (zod v4)
const DynValue = z.union([z.string(), z.object({ path: z.string() })]);
```

`filterStatus` is the standard binding — every card component that should respect the ChoicePicker filter needs it.

## Existing components (reference for adding new ones)

| Name | Props (key fields) | Notes |
|---|---|---|
| `Column` | `children: string[]` | Layout root, built-in override |
| `CandidateCard` | `candidateId, name, jobTitle?, skills?, status?, location?, experience?, filterStatus?` | |
| `InterviewRow` | `interviewId, candidateName, round, stageName?, scheduledAt?, interviewerName?, status, filterStatus?` | |
| `JobCard` | `jobId, title, department, status?, employmentType?, jobLevel?, payMin?, payMax?, payCurrency?, candidateCount?, filterStatus?` | |
| `Table` | `title?, columns: string[], rows: Record[]` | |
| `Badge` | `label, tone: success/warning/danger/neutral` | |
| `TFButton` | `label, actionName, payload?, variant?` | Dispatches SurfaceActionEnvelope |
| `ChoicePicker` | `value: dynamicString?, options: {label,value}[], placeholder?` | Writes DataModel on change |
