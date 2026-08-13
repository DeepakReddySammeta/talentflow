# Role → Tool Scoping Matrix

## Who can call which tools

| Tool | ADMIN | HR | MANAGER | INTERVIEWER |
|---|---|---|---|---|
| `search_jobs` | ✓ | ✓ | ✓ (own dept) | ✓ |
| `search_candidates` | ✓ | ✓ | ✓ (own dept) | ✓ |
| `search_interviews` | ✓ | ✓ | ✓ (own dept) | ✓ (own only) |
| `get_candidate_profile` | ✓ | ✓ | ✓ | ✓ |
| `search_offers` | ✓ | ✓ | ✓ | ✗ |
| `schedule_interview` | ✓ | ✓ | ✗ | ✗ |

## How scoping is enforced

There are two enforcement layers — both must be present:

**Layer 1 — Tool registration** (`getToolDefinitionsForRole`):
The tool does not appear in the LLM's tool list at all for restricted roles. The LLM cannot call what it cannot see.

**Layer 2 — Execution WHERE clause** (`executeTool`):
Even if a tool is registered, the execution function hardcodes row-level filters based on `caller.role` and `caller.department`. These cannot be overridden by LLM arguments.

Example — INTERVIEWER always sees only their own interviews:
```typescript
interviewerId: caller.role === "INTERVIEWER" ? caller.userId : undefined,
```

Example — MANAGER always sees only their department:
```typescript
job: caller.role === "MANAGER" && caller.department
  ? { department: caller.department }
  : undefined,
```

## Adding a new tool: scoping decision checklist

1. Should INTERVIEWERs use this tool? If no → wrap in `if (role !== "INTERVIEWER")`
2. Should only ADMIN/HR use it? → wrap in `if (role === "ADMIN" || role === "HR")`
3. Does it return data that MANAGERs should only see for their dept? → add dept WHERE clause in `executeTool`
4. Does it return salary/offer data? → treat like `search_offers` — INTERVIEWER excluded

## A2UI component scoping

`getCatalogForRole()` in `catalog.ts` mirrors tool scoping for components. A component that displays salary or HR-only data should not be in the INTERVIEWER's allowed set. The orchestrator checks `allowed.has("ComponentName")` before emitting any component.
