# TalentFlow

A structured hiring & interview intelligence platform — a full applicant
tracking system (ATS) with a natural-language "agentic search" bar as a
primary way to navigate the app, real per-job interview pipelines,
structured scorecards, and full role-based access control (Admin, HR,
Manager, Interviewer).

Ask something like *"who cleared round 2 for the SDE - Frontend role"* and
the agent chains real database lookups (resolve the job → find interviews →
join to candidates) to answer it — it's a real tool-use reasoning loop
against Postgres, not a canned demo. You can also just tap the mic and ask
out loud, or ask it to *do* something ("create a job for a Senior Backend
Engineer in Platform") and it'll pop up a pre-filled form for you to review
before anything is saved.

**New here and not sure what any of this means?** Read the [Glossary](#glossary-plain-language)
first — it explains ATS, LLM, agent, ORM, JWT, and every other term this
README uses, in plain language.

This README covers what's here and how to get it running on your own
machine, end to end, even if you've never set up a full-stack app before.
The ["Architecture"](#architecture) section covers how the pieces fit
together once you're up and running.

---

## Table of contents

1. [What's in this build](#whats-in-this-build)
2. [Stack](#stack)
3. [Architecture](#architecture)
4. [Prerequisites](#prerequisites)
5. [Quick start](#quick-start)
6. [Log in and try it](#log-in-and-try-it)
7. [Repo layout](#repo-layout)
8. [Troubleshooting](#troubleshooting)
9. [Where this stands](#where-this-stands)
10. [A note on running this for real](#a-note-on-running-this-for-real)
11. [Glossary (plain language)](#glossary-plain-language)

---

## What's in this build

- **Agentic search** — type or speak a request; the agent decides which
  tools to chain to answer it, scoped by your role
- **Agentic write actions** — ask the agent to create/update/schedule
  something (a job, a candidate, an interview...) and it proposes a
  pre-filled, editable form instead of guessing or interrogating you with
  follow-up questions; nothing is written until you hit submit
- **Configurable interview pipelines** — each job defines its own ordered
  rounds (e.g. Screening → Technical → System Design), each with its own
  KRAs/competencies
- **Governed skills master** — required skills (for jobs) and demonstrated
  skills (for candidates) are picked from a shared, categorized skill list
  (Technical, Human, Management, Domain) with search and chip-based
  multi-select, not free-typed text — so "React" and "ReactJS" never end up
  as two different skills
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
required. See the [Glossary](#glossary-plain-language) if any of these
words (ORM, JWT, LLM tool-use...) are new to you.

## Architecture

```text
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

In plain language: your browser only ever talks to the Express API over
HTTPS, carrying a JWT (a signed token proving who you are) on every
request. Every request passes through two guards before it reaches any
actual logic — one confirms you're logged in, the other confirms your
*role* is allowed to do what you're asking. Normal CRUD screens (Jobs,
Candidates, Interviews...) go straight from a route handler to Postgres via
Prisma. The search bar is different: it goes to the **Agent Orchestrator**,
which asks the LLM which of a role-scoped set of "tools" (functions like
`search_jobs` or `create_job`) it should call to answer your request, runs
those tools against Postgres itself, and only ever *writes* data after you
explicitly confirm a proposed action.

## Prerequisites

Install these first. You need three things on your machine before you
touch this repo — if you already have them, skip to [Quick start](#quick-start).

### 1. Node.js (version 20 or newer)

Node.js is the JavaScript runtime both the frontend and backend run on.

- Download from **[nodejs.org](https://nodejs.org)** — get the "LTS"
  (Long Term Support) version.
- Check it installed correctly by opening a terminal and running:

  ```bash
  node -v
  npm -v
  ```

  You should see version numbers (e.g. `v20.x.x` and `10.x.x`), not an
  error. `npm` (Node Package Manager) comes bundled with Node — you don't
  install it separately.

### 2. Docker Desktop

Docker runs the Postgres database in an isolated container, so you don't
have to install and configure Postgres by hand on your actual machine.

- Download from **[docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/)**.
- Install it, then **open the Docker Desktop app once** and make sure it
  says it's running (there's usually a whale icon in your menu bar/system
  tray when it's active). The rest of this guide uses Docker from the
  terminal, but the Docker Desktop app has to be running in the background
  for those commands to work.
- Check it from a terminal:

  ```bash
  docker --version
  ```

### 3. Git

You need Git to have cloned this repository in the first place — if you're
reading this file locally, you likely already have it. Confirm with:

```bash
git --version
```

If you're missing it, get it from **[git-scm.com](https://git-scm.com/downloads)**.

### A code editor (optional but recommended)

Any text editor works, but **[VS Code](https://code.visualstudio.com/)**
is a common free choice if you don't already have one, and pairs well with
this stack (TypeScript, Tailwind, Prisma all have good VS Code extensions).

---

## Quick start

Every command below is meant to be typed into a terminal, one at a time,
from the root of this repo (the folder this README is in) unless a `cd`
tells you otherwise. Don't worry about what each tool does yet — that's
explained inline as you go.

### Step 1 — Start Postgres

```bash
docker compose up -d
```

This reads `docker-compose.yml` at the repo root and starts a PostgreSQL
database inside a Docker container in the background (`-d` = "detached,"
i.e. it won't tie up this terminal window). This is the actual database
your app's data lives in — candidates, jobs, interviews, everything. It
listens on port `5432`, matching what's in `backend/.env` (which you'll
create in the next step).

**Check it actually started:**

```bash
docker ps
```

You should see a row with `IMAGE` = `postgres:16-alpine` and `STATUS`
showing something like "Up X seconds/minutes." If you don't see it, see
[Troubleshooting](#troubleshooting).

### Step 2 — Backend setup

Open a terminal and move into the backend folder:

```bash
cd backend
npm install
```

This reads `backend/package.json` and downloads every library the backend
code depends on (Express, Prisma, the Groq SDK, etc.) into a
`node_modules` folder. This can take a minute or two the first time. You
only need to run this again later if the dependencies in `package.json`
change.

**Create your `.env` file.** This isn't a command to run — it's a file you
create by copying the example:

```bash
cp .env.example .env
```

(On Windows without a Unix-style shell: just duplicate `.env.example` in
File Explorer and rename the copy to `.env`.)

`backend/.env` holds secrets and per-machine settings that should never be
committed to Git (which is why it's listed in `.gitignore`): your database
connection string, your JWT signing secret, and your LLM API key. Open the
file in your editor and fill in:

- `JWT_SECRET` — replace the placeholder with any long random string (this
  signs your login tokens; it can be anything, just keep it private).
- `GROQ_API_KEY` — a free-tier API key from
  [console.groq.com/keys](https://console.groq.com/keys) (14,400
  requests/day, 30 RPM — plenty for local development).
- `GROQ_MODEL` — which model to call (defaults to `openai/gpt-oss-120b`
  in `.env.example`). Change this if you want to try a different model
  Groq serves.

Nothing in the app works without this file existing with at least a
database URL, JWT secret, and a working LLM key + model.

**Set up the database tables:**

```bash
npx prisma migrate dev --name init
```

This is Prisma reading `backend/prisma/schema.prisma` (which describes
every table the app needs — User, Job, Candidate, Interview, Scorecard,
Skill, etc.) and turning that into real SQL `CREATE TABLE` statements,
then running them against the Postgres container from Step 1. `--name
init` just labels this as your first migration — Prisma keeps a history of
every schema change as a numbered folder under `backend/prisma/migrations/`,
so you (or a teammate) can always see exactly how the database evolved.
This command also regenerates the **Prisma Client** — the typed JavaScript
functions the backend code calls instead of writing raw SQL by hand.

**Load demo data:**

```bash
npm run seed
```

Runs `backend/prisma/seed.ts`, a script that inserts realistic demo data —
5 users covering every role, a governed skills master, jobs with pipelines,
candidates, interviews, scorecards, notifications — so the app isn't empty
the first time you open it.

**Start the backend server:**

```bash
npm run dev
```

This starts the actual Express API on `http://localhost:4000`, using `tsx
watch` — meaning it automatically restarts whenever you save a `.ts` file,
so you don't have to stop and restart it by hand while you work. You
should see log lines like:

```text
TalentFlow backend listening on http://localhost:4000
WebSocket search available at ws://localhost:4000/ws/search
```

**Leave this terminal window open** — closing it stops the backend.

### Step 3 — Frontend setup (open a *new*, second terminal)

Your backend terminal is busy running the server, so open another terminal
window/tab for these next commands. From the repo root:

```bash
cd frontend
npm install
```

Same idea as the backend — installs Next.js, React, TanStack Query,
Recharts, etc.

**Create the frontend's env file:**

```bash
cp .env.example .env.local
```

This just tells the frontend where the backend API lives
(`http://localhost:4000` by default — you don't need to change anything
unless you changed `PORT` in the backend's `.env`).

**Start the frontend:**

```bash
npm run dev
```

Starts the Next.js dev server on `http://localhost:3000`. Also
auto-reloads on file changes. **Leave this terminal open too** — you now
have two terminals running, one per app, both of which need to stay open
while you use TalentFlow.

### Step 4 — Confirm everything is actually running

- Backend health check: open `http://localhost:4000/health` in a browser,
  or run `curl http://localhost:4000/health` — either way you should see
  `{"ok":true}`.
- Frontend: open `http://localhost:3000` — you should land on (or be
  redirected to) a login page.

If either of those doesn't work, see [Troubleshooting](#troubleshooting)
below before moving on.

---

## Log in and try it

Open **http://localhost:3000/login**. Rather than typing credentials by
hand, the login page has one-click buttons for each demo account (password
`password123` for all of them, pre-filled for you):

| Role | Email | Can see |
|---|---|---|
| Admin | admin@talentflow.dev | Everything, plus user management |
| HR | hr@talentflow.dev | Jobs, candidates, interviews, offers |
| Manager | manager@talentflow.dev | Same as HR, scoped to their department; approves offers |
| Interviewer | interviewer@talentflow.dev | Only their own assigned interviews; no offers/salary |

Once logged in, click **Search** in the sidebar and try asking something
like:

- *"show all open jobs"*
- *"candidates with React skills"*
- *"who cleared round 2 for SDE Frontend"*
- *"create a job for a Senior Backend Engineer in Platform"* — notice it
  pops up an editable form pre-filled with whatever you already said,
  rather than asking you a round of clarifying questions first; anything
  you didn't specify gets a sensible default (status `DRAFT`, employment
  type `FULL_TIME`, etc.) that you can change before submitting.

Try the same search prompt logged in as HR vs. as an Interviewer — the
agent's available tools (and therefore what it can answer or do) actually
change; it's not just the UI hiding a menu item. Each role gets a
different, server-enforced tool/component set (see
`backend/src/agent/tools.ts` and `backend/src/agent/catalog.ts`).

## Repo layout

```text
talentflow/
├── backend/               Express API + Prisma + the LLM agent
│   ├── prisma/            schema.prisma (DB tables), migrations, seed script
│   └── src/
│       ├── agent/         orchestrator, tool definitions, propose→confirm forms
│       ├── routes/        REST endpoints (jobs, candidates, interviews, ...)
│       ├── middleware/    auth (JWT) + RBAC (role checks)
│       └── lib/           Prisma client, skill-matching helpers, etc.
├── frontend/               Next.js app (App Router)
│   ├── app/                pages, grouped by route
│   ├── components/         shared UI (forms, pickers, charts, sidebar...)
│   ├── lib/                API client, TanStack Query hooks, types
│   └── hooks/               misc React hooks
└── docker-compose.yml       Local Postgres only
```

Each of `backend/` and `frontend/` also has its own README with more
detail on what's inside that specific half of the app — worth reading once
you're comfortable with the basics above.

---

## Troubleshooting

**`docker ps` shows nothing running / `docker compose up -d` errors out**
Make sure the Docker Desktop *application* is actually open and running
(not just installed) — the `docker` command in your terminal talks to that
running app. On some systems it needs a few seconds after opening to be
ready; try the command again after a short wait.

**Port `5432` (Postgres), `4000` (backend), or `3000` (frontend) is
already in use**
Something else on your machine is already using that port — often a
previous run of this same app that didn't shut down cleanly, or an
unrelated local Postgres install. Find and stop whatever's holding the
port (e.g. `lsof -i :4000` on Mac/Linux to see what process it is, then
stop it), or change the port: for the backend, edit `PORT` in
`backend/.env`; for the frontend, run `npm run dev -- -p 3001` instead. If
you change the frontend's port, also update `CORS_ORIGIN` in
`backend/.env` to match (e.g. `http://localhost:3001`) and restart the
backend — otherwise the browser will block requests to the API with a CORS
error, and you'll see "Failed to fetch" when you try to log in.

**Search bar / agent says something failed, or the backend logs
`GROQ_API_KEY is not set`**
Your `backend/.env` is either missing a key or still has the placeholder
value. Get a free one from
[console.groq.com/keys](https://console.groq.com/keys), set
`GROQ_API_KEY`, and restart the backend (`Ctrl+C` in that terminal, then
`npm run dev` again).

**Agent requests fail with a rate-limit error**
The free tier is capped at 14,400 requests/day and 30 requests/minute —
if you hit it, wait a minute (for the per-minute limit) or try again
tomorrow (for the daily limit).

**`npx prisma migrate dev` fails to connect to the database**
Postgres probably isn't running yet, or `DATABASE_URL` in `backend/.env`
doesn't match `docker-compose.yml`. Run `docker ps` to confirm the
container is up first; the default `.env.example` value already matches
the default `docker-compose.yml`, so if you haven't edited either, this
usually means Step 1 was skipped.

**"Login" works but nothing shows up on the dashboard**
Make sure you ran `npm run seed` in `backend/` — without it, the database
has tables but no data.

**I changed a `.ts` file and nothing updated**
Confirm the relevant `npm run dev` terminal is still open and didn't crash
— scroll up in that terminal for an error. Both dev servers auto-reload on
save, but only while they're actually running.

---

## Where this stands

- **Level 1 & 2 search** (single-hop and multi-hop chained queries): done
  and working end to end against Groq's tool-use loop.
- **Structured hiring workflow** (pipelines, scorecards, auto-advancement,
  debrief view, notifications): done.
- **Dashboard, feature flags, collapsible sidebar, voice input**: done.
- **Level 3** (prompt-driven write actions through the search agent itself,
  e.g. "schedule Meera for round 2 next Tuesday") — done, as a propose →
  confirm flow: the agent never auto-executes a write; it creates a
  `PendingAction` and calls the relevant tool immediately using whatever
  the prompt already specified (no interrogating the user for missing
  fields first), and the UI shows an editable, pre-filled form
  (create/update, including a chip-based skill picker with live search and
  category grouping) or a confirm/cancel card (archive/restore/approve/
  delete). The write only runs on an explicit
  `POST /search/actions/:id/confirm`. See `backend/src/agent/orchestrator.ts`
  and `backend/src/agent/forms.ts` for the full flow.
- **Scheduling UI** (a real calendar/slot picker, interviewer availability
  checks) — interviews are currently created via the API with a raw
  datetime; there's no dedicated scheduling screen yet.

## A note on running this for real

This was built to run entirely locally and for free. Before you'd point
this at real candidate data, you'd want to add: httpOnly cookie-based auth
instead of localStorage (see `frontend/README.md`), rate limiting on
`/search` (LLM calls are the expensive path), input validation hardening
beyond the current Zod schemas, and audit logging on offer approvals.

---

## Glossary (plain language)

A few terms this README (and the codebase) uses a lot, explained without
assuming prior background:

- **ATS (Applicant Tracking System)** — software companies use to manage
  hiring: posting jobs, tracking candidates through interview rounds,
  collecting feedback, and making offers. That's what TalentFlow is.
- **LLM (Large Language Model)** — the AI model (here, one served by Groq)
  that reads your natural-language search/chat request and decides what to
  do with it.
- **Agent / agentic** — software that uses an LLM not just to *talk*, but
  to decide which actions to take (here: which backend "tools" to call) to
  accomplish a request, possibly chaining several steps together.
- **Tool-use / function calling** — the specific technique where the LLM is
  given a list of available functions (e.g. `search_jobs`, `create_job`)
  with descriptions, and responds with which one to call and what
  arguments to pass, rather than just returning text.
- **API (Application Programming Interface)** — here, the set of URLs
  (`http://localhost:4000/...`) the frontend calls to read/write data.
  "REST API" means those URLs follow a common convention (e.g.
  `GET /jobs` to list jobs, `POST /jobs` to create one).
- **ORM (Object-Relational Mapper)** — a library (Prisma, here) that lets
  backend code work with the database using regular JavaScript/TypeScript
  objects and function calls instead of writing raw SQL by hand.
- **Migration** — a recorded, versioned change to the database's table
  structure (e.g. "add a `status` column to `Job`"), so the schema's
  history is tracked the same way code changes are tracked in Git.
- **JWT (JSON Web Token)** — a signed piece of text your browser stores
  after login and sends with every request, proving who you are without
  the server needing to look up a session on every call.
- **RBAC (Role-Based Access Control)** — restricting what data/actions are
  available based on the logged-in user's role (Admin, HR, Manager,
  Interviewer), enforced on the backend, not just hidden in the UI.
- **Seed / seed data** — pre-written sample data (demo users, jobs,
  candidates) loaded into a fresh database so the app has something to
  show immediately, instead of starting completely empty.
- **Env file / environment variables** — settings and secrets (database
  URLs, API keys) kept outside the source code, typically in a `.env`
  file, so they can differ per machine and never get committed to Git.
- **Docker / container** — a way to run software (here, Postgres) in an
  isolated, pre-configured environment without installing and configuring
  it directly on your computer.
- **Propose → confirm** — this app's pattern for any AI-triggered write:
  the agent never saves data on its own; it proposes an action, shows you
  the exact fields it would write, and only executes after you explicitly
  submit/confirm.
