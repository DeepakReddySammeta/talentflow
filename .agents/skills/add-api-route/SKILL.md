---
name: add-api-route
description: Add a new REST API endpoint to the TalentFlow backend. Use when asked to add a new API endpoint, create a route for a new entity, add a REST route, add a backend endpoint, or expose a new resource over HTTP.
compatibility: Designed for Claude Code and GitHub Copilot Agent mode.
---

## Checklist

- [ ] Step 1: Create `backend/src/routes/<entity>.routes.ts`
- [ ] Step 2: Add `requireAuth` and `allowRoles` to every handler
- [ ] Step 3: Add Zod validation on all request bodies
- [ ] Step 4: Register the router in `backend/src/index.ts`
- [ ] Step 5: Typecheck — `cd backend && npx tsc --noEmit --ignoreDeprecations 5.0`

---

## Step 1 — Create the route file

File: `backend/src/routes/<entity>.routes.ts`

Minimal template:

```typescript
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { allowRoles } from "../middleware/rbac";

const router = Router();
router.use(requireAuth);  // all routes on this router require a valid JWT

router.get("/", allowRoles("ADMIN", "HR", "MANAGER"), async (req, res) => {
  const items = await prisma.<entity>.findMany({ orderBy: { createdAt: "desc" } });
  res.json(items);
});

const createSchema = z.object({
  name: z.string().min(1),
});

router.post("/", allowRoles("ADMIN", "HR"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const item = await prisma.<entity>.create({ data: parsed.data });
  res.status(201).json(item);
});

export default router;
```

For the full role matrix and Manager dept-scoping pattern, read [`references/rbac-patterns.md`](references/rbac-patterns.md).

## Step 2 — Auth and RBAC

Every route file must:

1. Call `router.use(requireAuth)` at the top — applies to all handlers in this router
2. Call `allowRoles(...)` as the first middleware on each handler — use the most restrictive set that makes sense

```typescript
// Everyone authenticated
router.get("/", allowRoles("ADMIN", "HR", "MANAGER", "INTERVIEWER"), ...);

// Write operations — admin and HR only
router.post("/", allowRoles("ADMIN", "HR"), ...);
router.patch("/:id", allowRoles("ADMIN", "HR"), ...);
router.delete("/:id", allowRoles("ADMIN"), ...);

// Manager sees only own department
router.get("/", allowRoles("ADMIN", "HR", "MANAGER"), async (req, res) => {
  const where: any = {};
  if (req.user!.role === "MANAGER" && req.user!.department) {
    where.department = req.user!.department;
  }
  // ...
});
```

`req.user` is the decoded JWT payload with `{ userId, role, department, name }`.

## Step 3 — Zod validation

Always validate request bodies with Zod `safeParse`. Never access `req.body` fields directly without parsing:

```typescript
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  salary: z.number().positive().nullable().optional(),
});

router.patch("/:id", allowRoles("ADMIN", "HR"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid update payload" });
  // use parsed.data safely
});
```

## Step 4 — Register in `index.ts`

File: `backend/src/index.ts`

Add two lines:

```typescript
import <entity>Router from "./routes/<entity>.routes";

// In the route registration block:
app.use("/<entities>", <entity>Router);
```

Keep the import alphabetically sorted with the other route imports.

## Step 5 — Typecheck

```bash
cd backend && npx tsc --noEmit --ignoreDeprecations 5.0
```

Must be clean.

---

## Gotchas

- `router.use(requireAuth)` must be called **before** any route handlers, not after. Order matters in Express.
- `allowRoles` is middleware — pass it as the second argument to the route method, before the async handler.
- Prisma models use PascalCase (`prisma.jobSkill`) — make sure you reference the correct model name from `schema.prisma`.
- For paginated endpoints, follow the existing pattern: `?page=` and `?limit=` query params, return `{ data, total, page, limit }`.
- Use `try/catch` around Prisma operations that can throw on not-found (e.g. `findUniqueOrThrow`) and return `404` on the catch.
