# Backend — TalentFlow

Express + TypeScript + Prisma (Postgres) + Groq tool-use agent.

## What lives here

```
src/
  index.ts              Express app entrypoint
  middleware/
    auth.ts             Verifies JWT, attaches req.user
    rbac.ts              allowRoles(...) route gate
  routes/
    auth.routes.ts       POST /auth/login, GET /auth/me
    jobs.routes.ts
    candidates.routes.ts
    interviews.routes.ts  includes PATCH /:id/feedback
    offers.routes.ts       includes PATCH /:id/approve
    users.routes.ts        admin only
    search.routes.ts       POST /search — the agentic search entrypoint
  agent/
    llm.ts               Groq client + system instruction
    tools.ts             Tool definitions + real Prisma-backed implementations,
                          each scoped by caller role
    orchestrator.ts       The tool-use reasoning loop
  lib/prisma.ts          Shared Prisma client
  utils/                 JWT + password hashing helpers
prisma/
  schema.prisma
  seed.ts                 Seeds 5 users (one per role, +1 extra interviewer),
                           3 jobs, 6 candidates, 5 interviews, 1 offer
```

## Setup

1. Start Postgres (from the repo root, not this folder):
   ```
   docker compose up -d
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Copy the env file and fill in your Groq key:
   ```
   cp .env.example .env
   ```
   Get a free-tier key at https://console.groq.com/keys — the free tier is
   generous (14,400 requests/day, 30 RPM), no billing needs to be enabled.

4. Create the database tables:
   ```
   npx prisma migrate dev --name init
   ```

5. Seed demo data:
   ```
   npm run seed
   ```

6. Start the server:
   ```
   npm run dev
   ```

   Runs on http://localhost:4000. Check http://localhost:4000/health.

## Demo accounts (after seeding)

All use password `password123`:

| Email | Role |
|---|---|
| admin@talentflow.dev | ADMIN |
| hr@talentflow.dev | HR |
| manager@talentflow.dev | MANAGER |
| interviewer@talentflow.dev | INTERVIEWER |

## How the agent's RBAC scoping works

`getToolDefinitionsForRole(role)` in `agent/tools.ts` builds a different tool
list per request based on the caller's role — an Interviewer's Groq session
is never given a `search_offers` tool at all. Additionally, each tool
implementation independently applies its own `WHERE` scoping (e.g.
`search_interviews` hardcodes `interviewerId: caller.userId` when the caller
is an Interviewer) — so even if the model were prompted to try to see
something outside its scope, the query itself won't return it. This is
deliberate defense in depth: don't rely on the LLM to police itself.

## Useful commands

```
npm run prisma:studio     # visual DB browser
npm run prisma:generate   # regenerate the Prisma client after schema changes
```
