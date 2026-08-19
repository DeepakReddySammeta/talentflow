# A2UI in TalentFlow

How the search bar's AI agent draws real, interactive UI — cards, tables,
forms, confirmation dialogs — instead of just replying with text.

## Table of contents

- [What is A2UI?](#what-is-a2ui)
- [The three response shapes](#the-three-response-shapes)
- [End-to-end flow](#end-to-end-flow)
  - [1. The wire protocol (WebSocket)](#1-the-wire-protocol-websocket)
  - [2. The orchestrator decides what to send](#2-the-orchestrator-decides-what-to-send)
  - [3. The catalog: TalentFlow's components, registered twice](#3-the-catalog-talentflows-components-registered-twice)
  - [4. Write actions: forms.ts builds the editable fields](#4-write-actions-formsts-builds-the-editable-fields)
  - [5. The frontend renders it](#5-the-frontend-renders-it)
- [The UI components TalentFlow ships](#the-ui-components-talentflow-ships)
- [Sending actions back: the round trip](#sending-actions-back-the-round-trip)
- [Type definitions, and where they're duplicated](#type-definitions-and-where-theyre-duplicated)
- [Adding a new A2UI-renderable action](#adding-a-new-a2ui-renderable-action)
- [A note on the `.agents/skills` docs](#a-note-on-the-agentsskills-docs)

## What is A2UI?

**A2UI ("Agent-to-User Interface") is a third-party open protocol and npm
library** — TalentFlow doesn't invent it, it's a dependency:

```json
"@a2ui/react": "0.10.0",
"@a2ui/web_core": "^0.10.6"
```

_(`frontend/package.json`)_

Per the library's own description, A2UI lets an AI agent describe UI as
**declarative JSON** — a list of components and their props — which a
renderer on the client turns into real React elements. The agent never
ships JSX or HTML; it only ever emits data. TalentFlow uses the library's
**v0.9** API (`@a2ui/react/v0_9`, `@a2ui/web_core/v0_9`), which is built
around three pieces:

- **`Catalog`** — a registry of `{ componentName → schema + renderer }`.
  This is the only source of truth for what the agent is *allowed* to draw.
- **`SurfaceModel` / `DataModel`** — the live, reactive state for one
  rendered "surface" (a tree of components) and the data bound into it.
- **`MessageProcessor`** — takes protocol messages
  (`createSurface`, `updateComponents`, `updateDataModel`, `deleteSurface`)
  and applies them to a `SurfaceModel`, incrementally, as they stream in.

What *is* TalentFlow-specific is everything built on top of that
scaffolding: the actual set of components it registers into the catalog
(`EntityGrid`, `EntityTable`, `ConfirmDialog`, ...), and the backend logic
that decides when to call the LLM, what UI to build from the results, and
when to require human confirmation before writing anything.

## The three response shapes

Every agent turn ends in exactly one of these:

| Shape | When | Carries |
|---|---|---|
| **Plain text** | Always | A `summary` string. Every response has one — it's the only thing guaranteed to exist. |
| **A2UI surface** | The agent called a *read* tool (search jobs, candidates, etc.) and got results worth visualizing | A list of A2UI protocol messages describing cards/tables/filters, on top of the summary text |
| **Pending-action proposal** | The agent called a *write* tool (create/update/archive/...) | A `kind: "form"` or `kind: "confirm"` payload — never executed until the user explicitly submits or confirms |

Read tools render themselves automatically. Write tools never do — see
[Sending actions back](#sending-actions-back-the-round-trip).

## End-to-end flow

### 1. The wire protocol (WebSocket)

`backend/src/lib/websocket.ts` exposes a single endpoint, `/ws/search`,
authenticated via a `?token=<jwt>` query param (browsers can't set custom
headers on a WebSocket handshake). Each chat turn opens a fresh
short-lived socket — the server closes it once it's sent a terminal
event.

**Client → server messages:**

- `{ type: "search", prompt, conversationId, dataModel }` — a chat
  message, plus the client's current filter state (`dataModel`), so
  "show me more like this but remote-only" can be resolved correctly.
- `{ type: "action", actionName, payload, sourceComponentId, surfaceId, conversationId }`
  — a button/menu click inside an already-rendered surface (see
  [round trip](#sending-actions-back-the-round-trip)).

`ALLOWED_ACTIONS` is a server-side allowlist of every `actionName` a
rendered button is permitted to fire. `ACTION_TO_WRITE_TOOL` maps a subset
of those 1:1 onto a backend write-tool (e.g. `edit_job → update_job`), so
clicking "Edit" on a job card skips the LLM entirely and goes straight to
proposing that write.

**Server → client events:** `progress`, `surface_update`, `action_proposed`,
`final`, `error`.

### 2. The orchestrator decides what to send

`backend/src/agent/orchestrator.ts` runs the tool-calling loop
(`runAgentStreaming`, capped at `MAX_TOOL_ITERATIONS = 5`). What happens
next depends on which kind of tool the LLM calls:

**Read tools execute immediately and stream a surface.** Results are
grouped by entity kind (`detectEntityKind` sniffs the shape — e.g.
`round` → interview, `title + department` → job, `name + skillLinks` →
candidate). One **composite component per entity kind** is built —
`EntityGrid` for candidates, `EntityTable` for jobs/interviews/offers/
users, `EntityAccordion` for skills — not one component per row. If the
result set has real variety (multiple statuses, skills, names), filter
controls (`ChoicePicker`, `TextField`) are added alongside it. Every
batch is run through `validateA2UISurface` (see next section) before
being emitted as `{ type: "surface_update", a2uiMessages }` — this can
happen more than once per turn, as different tool calls resolve.

**Write tools are never auto-executed.** If the LLM calls a tool like
`create_job` or `archive_candidate`, the orchestrator calls `proposeWrite`
instead of running it: it builds a human-readable description, classifies
the tool as `kind: "form"` (has real editable fields) or `kind: "confirm"`
(nothing to edit — archive/restore/approve are yes/no), builds the field
definitions (see [forms.ts](#4-write-actions-formsts-builds-the-editable-fields)),
and persists a `PendingAction` row in the database. The live event sent
to the client is `{ type: "action_proposed", actionId, description, kind,
submitLabel, fields }` — nothing is written until the user acts on it.

### 3. The catalog: TalentFlow's components, registered twice

"Catalog" is the A2UI library's own term for the registry mapping a
component name to its schema and renderer. TalentFlow keeps **two
catalogs that must be kept in sync by hand** — there's no shared/generated
schema package between them:

- **`backend/src/agent/catalog.ts`** — validation only, no rendering.
  `A2UI_CATALOG` maps each component name to a Zod schema for its props.
  `getCatalogForRole(role)` returns the role-scoped allowlist of component
  names (e.g. `INTERVIEWER` never gets `ConfirmDialog`). Every surface the
  orchestrator wants to emit passes through `validateA2UISurface` first —
  any component not in the caller's allowlist, of unknown type, or whose
  props fail the Zod schema is silently rejected (logged, not sent). This
  is the actual enforcement point that stops the agent from ever
  inventing arbitrary UI.
- **`frontend/lib/a2uiCatalog.tsx`** — the real implementations.
  `buildCatalog(role)` builds an actual A2UI `Catalog` instance,
  combining the library's own built-in components (`Row`, `Column`,
  `Text`, `Button`, `TextField`, ...) with TalentFlow's custom
  `ReactComponentImplementation`s, each built via
  `createComponentImplementation({ name, schema }, renderFn)`.

The file comment at the top of `catalog.ts` says it outright: *"Component
names and prop shapes must match the frontend catalog in
`frontend/lib/a2uiCatalog.tsx` exactly — keep them in sync."* There's no
codegen enforcing this — it's a discipline, not a guarantee.

### 4. Write actions: forms.ts builds the editable fields

`backend/src/agent/forms.ts` turns a proposed write into what the user
actually sees and edits:

- `WRITE_TOOL_META` — a static map from tool name to `{ kind, submitLabel }`.
- `FormField` — `{ key, label, type, value, options?, required?, placeholder?, step?, stepTitle? }`,
  with `type` one of `text | textarea | number | select | datetime |
  password | stageList | skillPicker`.
- `buildFormFields(tool, args)` — for `update_*` tools, this fetches the
  record's **current database values** and merges them with whatever the
  LLM already inferred from the prompt, so "rename it to X" still shows
  every other field pre-filled rather than blank. `submit_scorecard`
  dynamically builds one number field per KRA pulled from the interview's
  pipeline stage. Job forms are the only multi-step ones, mirroring the
  4-step job-creation wizard elsewhere in the app.
- `reconstructArgsFromForm(tool, baseArgs, values)` — the inverse: turns
  the user's edited flat form values back into the exact args shape the
  write executor expects, layered on top of the server-stored
  `baseArgs` from the `PendingAction` row (not whatever the client claims
  the tool or target should be — see the [round trip](#sending-actions-back-the-round-trip)).

### 5. The frontend renders it

`frontend/lib/useAgenticSearchStream.ts` owns the WebSocket lifecycle for
a turn:

- On `surface_update`, it lazily creates a `MessageProcessor([catalog])`
  and feeds it the incoming `a2uiMessages`, which mutates a `SurfaceModel`
  that streams into React state as it arrives.
- On `action_proposed`, it stores `pendingAction` state and closes the
  socket.
- On `final`, it stores the finished result (summary text, plus the
  resolved `surfaceModel` if any).

`frontend/components/ChatWindow.tsx` renders the result:

- A finished surface renders as `<A2uiSurface surface={result.surfaceModel} />`
  from `@a2ui/react/v0_9`, wrapped in an error boundary that falls back to
  a plain, non-A2UI renderer if anything throws.
- A `kind: "form"` pending action renders inline as
  [`ActionForm`](../frontend/components/ActionForm.tsx) — grouped into a
  stepper when the tool has multiple `step`s, otherwise flat. Custom
  field types get dedicated widgets: `StageListEditor` for pipeline
  stages, and a `SkillPickerField` wrapping the app's existing skill
  picker.
- A `kind: "confirm"` pending action renders as a plain, hand-built
  dialog — not routed through the A2UI catalog at all, even though a
  `ConfirmDialog` A2UI component also exists (it's used when replaying a
  *stored* past turn from conversation history, since the proposal is
  also persisted as an A2UI surface on the `Message` row for that
  purpose).

## The UI components TalentFlow ships

| Component | Backend schema | Frontend renderer | Purpose |
|---|---|---|---|
| `EntityGrid` | `catalog.ts` | `a2uiCatalog.tsx` | 3-up card grid with infinite scroll — candidates |
| `EntityTable` | `catalog.ts` | `a2uiCatalog.tsx` | Paginated table — jobs, interviews, offers, users |
| `EntityAccordion` | `catalog.ts` | `a2uiCatalog.tsx` | Collapsible groups — skills, grouped by category |
| `Badge` | `catalog.ts` | `a2uiCatalog.tsx` | Status/tone chip |
| `ConfirmDialog` | `catalog.ts` | `a2uiCatalog.tsx` | Yes/no modal for archive/restore/approve proposals; withheld from `INTERVIEWER` |
| `TFRow` / `TFColumn` | `catalog.ts` | `a2uiCatalog.tsx` | Layout wrappers — renamed to avoid shadowing the library's built-in `Row`/`Column` |
| `ChoicePicker` | `catalog.ts` | `a2uiCatalog.tsx` | Single-select filter, two-way bound to the surface's `DataModel` — deliberately shadows the library's own multi-select version |
| `TFButton` | `catalog.ts` | `a2uiCatalog.tsx` | Dispatches a `SurfaceActionEnvelope` |
| `TextField` | `catalog.ts` (registration only) | the A2UI library's own `basicCatalog` | Name-search filter input |

Row-level action buttons (Edit, Archive, Restore, View Profile, Approve,
Submit Scorecard, ...) aren't separate components — they're a shared
`{ label, actionName, variant?, payload? }` schema attached as `actions[]`
on grid/table/accordion items, rendered through one shared `ActionsMenu`
dropdown and gated per role/status server-side.

## Sending actions back: the round trip

There are **two different return paths**, depending on what was clicked:

**Surface-embedded actions (buttons, menu items) → WebSocket.**
A click dispatches a `SurfaceActionEnvelope`
(`{ name, surfaceId, sourceComponentId, timestamp, context }`) up through
React context. It opens a new WebSocket turn sending
`{ type: "action", actionName, payload, ... }`. The server checks
`ALLOWED_ACTIONS`, then either routes it straight to a write proposal
(if it's in `ACTION_TO_WRITE_TOOL`) or synthesizes a prompt and re-enters
the LLM loop. `ChoicePicker`'s value changes are the one exception —
they're a two-way `DataModel` binding, not an action, so they update
purely client-side with no network round trip at all.

**Pending-action confirm/cancel → plain REST, not WebSocket.**
`backend/src/routes/actions.routes.ts` exposes:

- `POST /search/actions/:id/confirm` — looks up the `PendingAction`,
  checks ownership/status/expiry. For `kind: "form"` tools, it re-derives
  the write's args via `reconstructArgsFromForm(action.tool, action.args,
  req.body.values)` — the *tool* and *target* always come from the
  server-stored `PendingAction`, never from the request body, so a form
  submission can only change the fields that specific tool's form
  actually rendered, never which tool runs or whose record it targets.
  Executes the write, marks the action `CONFIRMED`, and invalidates the
  agent's read-result cache.
- `POST /search/actions/:id/cancel` — marks it `CANCELLED`, executes
  nothing.

In short: **read-triggered UI actions round-trip live over the WebSocket**
and can re-enter the LLM; **write confirmations round-trip over REST** to
a narrowly-scoped endpoint that never touches the LLM again.

## Type definitions, and where they're duplicated

- Backend: `A2uiComponentInput` / `A2UIValidationResult` (`catalog.ts`),
  `A2uiComponent` / `A2uiMessage` (`orchestrator.ts`), `FormField`
  (`forms.ts`).
- Frontend: `SurfaceActionEnvelope` (`a2uiCatalog.tsx`),
  `PendingActionFormField` / `PendingActionState`
  (`useAgenticSearchStream.ts` — a near-duplicate of backend `FormField`,
  maintained independently), `StreamedResult` (extends the app's own
  `SearchResult` type with `conversationId`, `a2uiMessages`,
  `surfaceModel`).
- The `Message.a2uiPayload` column (Prisma) persists a turn's surface for
  history replay; the frontend's `a2uiPayload: unknown | null` field
  mirrors it.
- Everything protocol-level (`SurfaceModel`, `Catalog`, `MessageProcessor`,
  `ReactComponentImplementation`) comes straight from `@a2ui/web_core`
  and `@a2ui/react` — TalentFlow doesn't redefine those.

There is no shared/generated schema package between backend and
frontend. The two catalogs and the two `FormField`-shaped interfaces are
hand-duplicated, kept in sync by comments and convention rather than by
tooling.

## Adding a new A2UI-renderable action

For a new **write** tool that needs a confirmation form:

1. **`backend/src/agent/tools.ts`** — add the tool's schema to
   `getToolDefinitionsForRole()`, a case in `executeTool()`, add it to
   `WRITE_TOOLS`, `executeConfirmedWrite()`, and
   `describeProposedAction()`.
2. **`backend/src/agent/forms.ts`** — add an entry to `WRITE_TOOL_META`,
   plus a case in `buildFormFields()` and `reconstructArgsFromForm()`.
   Standard field types need no frontend changes; a genuinely new widget
   type means touching `ActionForm.tsx`'s `FieldInput` switch.
3. **`backend/src/lib/websocket.ts`** — if a button should trigger it
   directly, add the action name to `ALLOWED_ACTIONS` and, if it maps 1:1
   to this tool, to `ACTION_TO_WRITE_TOOL`.

For a new **read** result that needs its own visual shape:

1. **`backend/src/agent/orchestrator.ts`** — extend `detectEntityKind()`,
   add the kind to `ENTITY_LABEL` / `ENTITY_PATTERN`, write a mapper into
   the relevant composite component (or add a new case to
   `buildCompositeComponent()` for a genuinely new component type), and
   wire up its row actions in `buildActions()`.
2. **`backend/src/agent/catalog.ts`** — define the new component's Zod
   prop schema, register it in `A2UI_CATALOG` and `getCatalogForRole()`
   if it should be role-restricted.
3. **`frontend/lib/a2uiCatalog.tsx`** — implement it with
   `createComponentImplementation({ name, schema }, renderFn)` (using the
   `zod3` import, not `zod`), register it in `baseComponents`, and use
   `dynamicString()` for any prop that should be bindable to the surface's
   `DataModel`. The component `name` must match `catalog.ts` exactly, or
   `validateA2UISurface` will reject every surface that uses it.

## A note on the `.agents/skills` docs

`.agents/skills/add-agent-tool/SKILL.md` and its
`references/catalog-sync.md` describe an **older** architecture —
per-entity components like `CandidateCard`, `JobCard`, `InterviewRow`,
a `Table` component, an `itemToComponent()` function, and a
`talentFlowComponents` array. None of that exists in the current
`catalog.ts` / `orchestrator.ts` / `a2uiCatalog.tsx` — it's been replaced
by the generic `EntityGrid` / `EntityTable` / `EntityAccordion`
composite-per-entity-kind pattern described above (`catalog.ts` has a
comment explaining the move away from "old per-entity cards"). If you're
following that skill doc, treat its file/function references as stale
until it's updated to match.
