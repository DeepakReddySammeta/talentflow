# RBAC Patterns — TalentFlow Backend

## Role capabilities

| Role | Can read | Can write | Restrictions |
|---|---|---|---|
| ADMIN | Everything | Everything | None |
| HR | Everything | Jobs, Candidates, Interviews, Offers, Users (limited) | No user role escalation |
| MANAGER | Own department only | None (read-only manager) | dept-scoped WHERE on all queries |
| INTERVIEWER | Own interviews + scorecards | Scorecard submit only | Sees only their assigned interviews |

## `allowRoles` usage

```typescript
import { allowRoles } from "../middleware/rbac";

// Allow all authenticated roles
allowRoles("ADMIN", "HR", "MANAGER", "INTERVIEWER")

// HR+ (exclude interviewers from HR operations)
allowRoles("ADMIN", "HR")

// Admin only
allowRoles("ADMIN")

// All non-interviewer
allowRoles("ADMIN", "HR", "MANAGER")
```

## Manager dept-scoping pattern

Managers see only their own department. Apply this WHERE clause to any query on entities that have a `department` field or a `job.department` relation:

```typescript
// Direct department field
const where: any = {};
if (req.user!.role === "MANAGER" && req.user!.department) {
  where.department = req.user!.department;
}

// Via job relation
const where: any = {};
if (req.user!.role === "MANAGER" && req.user!.department) {
  where.job = { department: req.user!.department };
}
```

## Interviewer own-data pattern

Interviewers see only their own interviews and scheduled items:

```typescript
// Hardcoded in the WHERE — cannot be overridden by query params
interviewerId: req.user!.role === "INTERVIEWER" ? req.user!.userId : undefined,
```

## Standard paginated list endpoint

```typescript
router.get("/", allowRoles("ADMIN", "HR", "MANAGER"), async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1")));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"))));
  const search = String(req.query.search || "").trim();

  const where: any = {};
  // Apply role scoping here
  if (req.user!.role === "MANAGER" && req.user!.department) {
    where.department = req.user!.department;
  }
  if (search) {
    where.OR = [{ name: { contains: search, mode: "insensitive" } }];
  }

  const [items, total] = await Promise.all([
    prisma.<entity>.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.<entity>.count({ where }),
  ]);

  res.json({ data: items, total, page, limit });
});
```

## Route registration in `index.ts`

Existing routes for reference (add new routes in this block):

```typescript
app.use("/auth", authRouter);
app.use("/jobs", jobsRouter);
app.use("/candidates", candidatesRouter);
app.use("/interviews", interviewsRouter);
app.use("/offers", offersRouter);
app.use("/users", usersRouter);
app.use("/skills", skillsRouter);
app.use("/conversations", conversationsRouter);
app.use("/search/actions", actionsRouter);
app.use("/dashboard", dashboardRouter);
app.use("/feature-flags", featureFlagsRouter);
app.use("/import", importRouter);
app.use("/notifications", notificationsRouter);
```
