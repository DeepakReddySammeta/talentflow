# TalentFlow

A structured hiring & interview intelligence platform — a full applicant
tracking system with a natural-language "agentic search" bar as a primary
way to navigate the app, real per-job interview pipelines, structured
scorecards, and full role-based access control (Admin, HR, Manager,
Interviewer).

Ask something like *"who cleared round 2 for the SDE - Frontend role"* and
the agent chains real database lookups (resolve the job → find interviews →
join to candidates) to answer it — it's a real tool-use reasoning loop
against Postgres, not a canned demo. You can also just tap the mic and ask
out loud.

This README covers what's here and how to get it running; the
"Architecture" section below covers how the pieces fit together.

## What's in this build

- **Agentic search** — type or speak a request; the agent decides which
  tools to chain to answer it, scoped by your role
- **Configurable interview pipelines** — each job defines its own ordered
  rounds (e.g. Screening → Technical → System Design), each with its own
  KRAs/competencies
- **Structured scorecards** — interviewers rate KRAs 1–5, add notes, and
  give a binary recommendation (Strong Hire → Strong No Hire); the
  candidate is auto-advanced or auto-rejected, no manual status editing
- **Candidate debrief view** — every round's scorecard stacked together for
  the final hiring decision
- **Dashboard** — hiring funnel, interview outcome mix, and top ongoing
  hiring processes, scoped per role (Interviewer sees their own workload;
  Admin/HR/Manager see the company/department view)
- **Notifications** — role-relevant events (assigned to a round, feedback
  submitted, offer awaiting approval)
- **Feature flags** — admin-toggleable capability gates (voice search,
  agent write-actions, dashboard charts)
- **Collapsible, hover-to-peek sidebar** with a role-filtered nav and a
  profile menu (Profile, Settings, Feature Flags, Sign out)

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind + TanStack Query + Recharts |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL (via Docker locally) + Prisma ORM |
| Agent / LLM | Groq API (free tier) — real tool-use function calling via `groq-sdk` |
| Auth | JWT + bcrypt |

Everything here is free to run — no paid API tier, no hosted database
required.

## Architecture

```
Browser (Next.js)
      │  HTTPS + JWT
      ▼
Express API  ── Auth middleware ── RBAC middleware ── Route handlers
      │                                                     │
      │                                                     ▼
      │                                          Agent Orchestrator
      │                                          (role-scoped tools)
      │                                                     │
      ▼                                                     ▼
  Prisma ORM ──────────────────────────────────────▶  Postgres (Docker)
                                                             ▲
                                                             │
                                                       Groq API
                                                (tool-use reasoning loop)
```

## Quick start — every command explained

### 1. Start Postgres
```
docker compose up -d
```
This reads `docker-compose.yml` at the repo root and starts a PostgreSQL
database inside a Docker container in the background (`-d` = "detached,"
i.e. don't tie up this terminal). This is the actual database your app's
data lives in — candidates, jobs, interviews, everything. It listens on
port 5432, matching what's in `backend/.env`.

Check it actually started:
```
docker ps
```
You should see a container with status "Up".

### 2. Backend setup
```
cd backend
npm install
```
Reads `backend/package.json` and downloads every library the backend code
depends on (Express, Prisma, the Groq SDK, etc.) into a `node_modules`
folder. You only need to do this once, or again whenever a dependency
changes.

**Create the `.env` file** (not a command — copy `backend/.env.example` to
`backend/.env` and fill in the values). This file holds secrets and
per-machine config that shouldn't be committed to Git: your database
connection string, your JWT signing secret, and your Groq API key. Nothing
in the code works without this file existing.

```
npx prisma migrate dev --name init
```
This is Prisma reading `backend/prisma/schema.prisma` (which describes
every table your app needs — User, Job, Candidate, Interview, Scorecard,
etc.) and turning that into real SQL `CREATE TABLE` statements, then
running them against the Postgres container from step 1. `--name init`
just labels this as your first migration — Prisma keeps a history of every
schema change as a numbered folder under `prisma/migrations/`, so you (or
a teammate) can always see exactly how the database evolved. This command
also regenerates the Prisma Client — the typed JavaScript functions your
backend code calls instead of writing raw SQL.

```
npm run seed
```
Runs `backend/prisma/seed.ts`, a script that inserts realistic demo data
(5 users covering every role, 3 jobs with pipelines, 6 candidates,
interviews, scorecards, notifications) so the app isn't empty the first
time you open it.

```
npm run dev
```
Starts the actual Express server on `http://localhost:4000`, using `tsx
watch` — meaning it automatically restarts whenever you save a `.ts` file,
so you don't have to stop/start it manually while developing. **Leave this
terminal open** — closing it stops the backend.

### 3. Frontend setup (open a new terminal)
```
cd frontend
npm install
```
Same idea as the backend — installs Next.js, React, TanStack Query,
Recharts, etc.

Create `frontend/.env.local` (copy `frontend/.env.example`) — this just
tells the frontend where the backend API lives (`http://localhost:4000`).

```
npm run dev
```
Starts the Next.js dev server on `http://localhost:3000`. Also
auto-reloads on file changes. **Leave this terminal open too** — you now
have two terminals running, one per app.

### 4. Try it
Open **http://localhost:3000/login** and sign in with any of the demo
accounts (password `password123` for all of them):

| Role | Email | Can see |
|---|---|---|
| Admin | admin@talentflow.dev | Everything, plus user management |
| HR | hr@talentflow.dev | Jobs, candidates, interviews, offers |
| Manager | manager@talentflow.dev | Same as HR, scoped to their department; approves offers |
| Interviewer | interviewer@talentflow.dev | Only their own assigned interviews; no offers/salary |

Try the same search prompt logged in as HR vs. as an Interviewer — the
agent's available tools (and therefore what it can answer) actually
change; it's not just the UI hiding a menu item — each role gets a
different, server-enforced tool/component set (see `backend/src/agent/tools.ts`
and `backend/src/agent/catalog.ts`).

## Repo layout

```
talentflow/
├── backend/              Express API + Prisma + the Groq agent
├── frontend/              Next.js app
└── docker-compose.yml      Local Postgres only
```

Each of `backend/` and `frontend/` also has its own README with more
detail on what's inside that specific half of the app.

## Where this stands

- **Level 1 & 2 search** (single-hop and multi-hop chained queries): done
  and working end to end against Groq's tool-use loop.
- **Structured hiring workflow** (pipelines, scorecards, auto-advancement,
  debrief view, notifications): done.
- **Dashboard, feature flags, collapsible sidebar, voice input**: done.
- **Level 3** (prompt-driven write actions through the search agent itself,
  e.g. "schedule Meera for round 2 next Tuesday") — done, as a propose →
  confirm flow: the agent never auto-executes a write; it creates a
  `PendingAction` and the UI shows an editable form (create/update) or a
  confirm/cancel card (archive/restore/approve/delete), and the write only
  runs on an explicit `POST /search/actions/:id/confirm`. See
  `backend/src/agent/orchestrator.ts` and `backend/src/agent/forms.ts` for
  the full flow.
- **Scheduling UI** (a real calendar/slot picker, interviewer availability
  checks) — interviews are currently created via the API with a raw
  datetime; there's no dedicated scheduling screen yet.

## A note on running this for real

This was built to run entirely locally and for free. Before you'd point
this at real candidate data, you'd want to add: httpOnly cookie-based auth
instead of localStorage (see `frontend/README.md`), rate limiting on
`/search` (LLM calls are the expensive path), input validation hardening
beyond the current Zod schemas, and audit logging on offer approvals.