# Backend — TalentFlow

Express + TypeScript + Prisma (Postgres) + a Groq-powered tool-use agent. This is
the API server: everything the frontend talks to lives here — auth, every
REST route (jobs, candidates, interviews, offers, users, skills...), and
the "agentic search" reasoning loop that powers the search bar.

**New to this stack, or don't have Docker/Node installed yet?** This
README explains everything step by step, including how to install the
tools you need — you don't need prior experience with any of them. If you
just want the short version (or you're also setting up the frontend),
see the [root README](../README.md), which covers both halves of the app
together and has a plain-language [glossary](../README.md#glossary-plain-language)
for terms like ORM, JWT, and migration.

## Table of contents

- [Table of contents](#table-of-contents)
- [What lives here](#what-lives-here)
- [Prerequisites](#prerequisites)
  - [Node.js](#nodejs)
  - [Docker Desktop](#docker-desktop)
- [Setup — every step explained](#setup--every-step-explained)
  - [1. Start Postgres](#1-start-postgres)
  - [2. Install dependencies](#2-install-dependencies)
  - [3. Create your `.env` file and fill in your LLM key](#3-create-your-env-file-and-fill-in-your-llm-key)
  - [4. Create the database tables](#4-create-the-database-tables)
  - [5. Seed demo data](#5-seed-demo-data)
  - [6. Start the server](#6-start-the-server)
- [Demo accounts (after seeding)](#demo-accounts-after-seeding)
- [How the agent's RBAC scoping works](#how-the-agents-rbac-scoping-works)
- [Useful commands](#useful-commands)
- [Troubleshooting](#troubleshooting)

## What lives here

```text
src/
  index.ts                 Express app entrypoint — mounts every route below,
                            wires up the WebSocket server, starts listening
  middleware/
    auth.ts                 Verifies the JWT on incoming requests, attaches req.user
    rbac.ts                  allowRoles(...) — route-level role gate
  routes/                   One file per resource; each is a normal REST
                             controller (GET/POST/PATCH/DELETE) guarded by
                             auth.ts + rbac.ts
    auth.routes.ts           POST /auth/login, GET /auth/me
    jobs.routes.ts           Job postings + their pipeline stages
    candidates.routes.ts     Candidates + their skills
    interviews.routes.ts     Includes PATCH /:id/feedback (scorecards)
    offers.routes.ts         Includes PATCH /:id/approve
    users.routes.ts          Admin-only user management
    skills.routes.ts         The governed skills master (search/create/list)
    notifications.routes.ts  Per-user notifications
    feature-flags.routes.ts  Admin-toggleable feature gates
    dashboard.routes.ts      Aggregated stats for the dashboard charts
    import.routes.ts         CSV import jobs
    conversations.routes.ts  Chat/search history
    search.routes.ts         POST /search — the non-streaming agentic search entrypoint
    actions.routes.ts        POST /search/actions/:id/confirm — write-action confirm/cancel
  agent/                    The "agentic search" reasoning loop
    llm.ts                   Groq client + the shared system instruction
    tools.ts                 Every tool definition the agent can call, plus its
                              real Prisma-backed implementation — each one is
                              independently scoped by the caller's role
    orchestrator.ts          The tool-use loop itself: asks the LLM which
                              tool(s) to call, executes read tools immediately,
                              and proposes (never auto-executes) write tools
    forms.ts                 Turns a proposed write action into the editable,
                              pre-filled form fields the frontend renders
    catalog.ts                A2UI component catalog for rendering search results
                              (see ../docs/A2UI.md for the full picture)
  lib/
    prisma.ts                 Shared Prisma client instance
    skills.ts                 Case-insensitive skill name → id matching/creation
    websocket.ts               WebSocket server for /ws/search (live progress)
  utils/                     JWT signing + password hashing helpers
prisma/
  schema.prisma              Every database table, as a Prisma schema
  seed.ts                    Inserts demo data: 5 users (one per role, plus an
                              extra interviewer), a governed skills master,
                              jobs with pipelines, candidates, interviews,
                              scorecards, notifications
  migrations/                Auto-generated history of schema changes
```

## Prerequisites

You need **Node.js 20+** and **Docker Desktop** installed before anything
here will run. If you already have both, skip to
[Setup](#setup--every-step-explained).

### Node.js

Node.js is the JavaScript runtime this server (and the seed/migration
scripts) run on. `npm` (Node's package manager) comes bundled with it.

1. Go to **[nodejs.org](https://nodejs.org)** and download the **LTS**
   (Long Term Support) version for your operating system.
2. Run the installer, accepting the defaults.
3. Confirm it worked — open a terminal and run:

   ```bash
   node -v
   npm -v
   ```

   You should see version numbers (e.g. `v20.x.x`, `10.x.x`). If you get
   "command not found," the install didn't complete, or your terminal
   needs to be restarted/reopened after installing.

### Docker Desktop

This backend needs a PostgreSQL database to store data in. Rather than
installing Postgres directly on your machine (which means managing its
own install, service, and version), this repo runs it inside **Docker** —
a tool that runs software in an isolated, pre-configured "container." You
only need to know two things to use it here: install Docker Desktop, and
run one command (`docker compose up -d`, covered below) to start Postgres.

**If you don't have Docker installed:**

1. Go to **[docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/)**.
2. Download the version for your OS (Mac, Windows, or Linux) and run the
   installer.
   - **Windows users:** the installer may ask to enable WSL 2 (Windows
     Subsystem for Linux) — accept this, it's required and the installer
     handles it for you. You may need to restart your computer once.
   - **Mac users:** if you have an Apple Silicon (M1/M2/M3/M4) Mac, make
     sure you download the Apple Silicon build, not Intel.
3. **Open the Docker Desktop application** after installing (find it in
   your Applications/Start Menu like any other app) and leave it running.
   You'll typically see a whale icon appear in your menu bar (Mac) or
   system tray (Windows) once it's up — that icon needs to be there
   (running, not showing an error) any time you want to use the database.
4. Confirm it worked — from a terminal:

   ```bash
   docker --version
   docker ps
   ```

   `docker ps` should print an empty table header (no error) — that means
   Docker is running and reachable. If it errors with something like
   "Cannot connect to the Docker daemon," Docker Desktop isn't open/ready
   yet — open it and wait a few seconds, then try again.

You don't need a Docker Hub account or any paid tier for anything in this
repo.

## Setup — every step explained

Run these from **this `backend/` folder** unless noted otherwise. Each
command is explained below it — you don't need to understand every detail
before running it, just what it accomplishes.

### 1. Start Postgres

From the **repo root** (one level up from this folder, where
`docker-compose.yml` lives), not from `backend/`:

```bash
cd ..
docker compose up -d
```

This reads `docker-compose.yml` and starts a PostgreSQL 16 database inside
a Docker container, in the background (`-d`, so it doesn't tie up your
terminal). It listens on port `5432` on your machine — that's what
`DATABASE_URL` in this backend's `.env` will point at. Confirm it's
running with `docker ps` — you should see a container named
`ats_postgres` with status "Up."

Then move back into this folder for the rest of the steps:

```bash
cd backend
```

### 2. Install dependencies

```bash
npm install
```

Reads `package.json` and downloads every library this backend depends on
— Express, Prisma, the Groq SDK, bcrypt, etc. — into a local
`node_modules/` folder. Takes a minute or two the first time; you only
need to re-run it when `package.json`'s dependencies change.

### 3. Create your `.env` file and fill in your LLM key

```bash
cp .env.example .env
```

(Windows without a Unix-style shell: duplicate `.env.example` in File
Explorer and rename the copy to `.env`.)

`.env` holds secrets and machine-specific settings that are intentionally
**not** committed to Git (see `.gitignore`). Open it in your editor and
fill in:

- **`DATABASE_URL`** — already correct out of the box if you didn't change
  anything in `docker-compose.yml`; no edit needed.
- **`JWT_SECRET`** — replace the placeholder with any long random string.
  This is what signs login tokens; it can be literally anything as long
  as it's not the placeholder and you keep it private.
- **`GROQ_API_KEY`** — a free-tier key from
  [console.groq.com/keys](https://console.groq.com/keys) (14,400
  requests/day, 30 RPM). This is what powers the agent/search bar.
- **`GROQ_MODEL`** — which model to request (defaults to
  `openai/gpt-oss-120b` in `.env.example`).
- `PORT`, `CORS_ORIGIN` — the defaults work for a normal local setup;
  only change `PORT` if `4000` is already taken on your machine, and only
  change `CORS_ORIGIN` if you're also running the frontend on something
  other than `http://localhost:3000`.

Nothing in this backend will start correctly without a `.env` containing
at least a valid `DATABASE_URL`, `JWT_SECRET`, and a working LLM key +
base URL + model.

### 4. Create the database tables

```bash
npx prisma migrate dev --name init
```

Prisma reads `prisma/schema.prisma` (which declares every table this app
needs — `User`, `Job`, `Candidate`, `Interview`, `Scorecard`, `Skill`,
etc.) and generates + runs the actual SQL `CREATE TABLE` statements
against the Postgres container from Step 1. `--name init` just labels
this as your first migration; every future schema change gets its own
numbered folder under `prisma/migrations/`, so the database's structure
has a readable history, the same way Git tracks code history. This
command also regenerates the **Prisma Client** — the typed
JavaScript/TypeScript functions the route handlers call instead of
writing raw SQL by hand.

### 5. Seed demo data

```bash
npm run seed
```

Runs `prisma/seed.ts`: inserts 5 demo users (one per role, plus an extra
interviewer), a categorized skills master, a handful of jobs with full
interview pipelines, candidates, interviews, scorecards, and
notifications — so the app has something to show the moment you open it,
instead of being empty.

### 6. Start the server

```bash
npm run dev
```

Starts the actual Express API on `http://localhost:4000` using `tsx
watch`, which automatically restarts the server whenever you save a
`.ts` file — no need to stop/start it by hand while developing. You
should see:

```text
TalentFlow backend listening on http://localhost:4000
WebSocket search available at ws://localhost:4000/ws/search
```

**Leave this terminal open** — closing it stops the server. Confirm it's
actually reachable with:

```bash
curl http://localhost:4000/health
```

which should return `{"ok":true}`. At this point the backend is fully
running — see the [root README](../README.md#log-in-and-try-it) for how
to start the frontend and log in.

## Demo accounts (after seeding)

All use password `password123`:

| Email | Role |
|---|---|
| admin@talentflow.dev | ADMIN |
| hr@talentflow.dev | HR |
| manager@talentflow.dev | MANAGER |
| interviewer@talentflow.dev | INTERVIEWER |

## How the agent's RBAC scoping works

`getToolDefinitionsForRole(role)` in `agent/tools.ts` builds a different
tool list per request based on the caller's role — an Interviewer's agent
session is never even given a `search_offers` or `create_job` tool, so
the model literally cannot call it. On top of that, each tool
implementation independently applies its own `WHERE` scoping (e.g.
`search_interviews` hardcodes `interviewerId: caller.userId` when the
caller is an Interviewer) — so even if the model were somehow prompted
into trying to see something outside its scope, the underlying query
still wouldn't return it. This is deliberate defense in depth: the app
never relies on the LLM to police itself, the same way the REST routes
never rely on the frontend hiding a button. See `middleware/rbac.ts` for
the equivalent enforcement on plain REST routes.

Write actions (create/update/schedule/archive/etc.) go through an extra
layer on top of this: the agent never executes a write immediately. It
proposes one (stored as a `PendingAction`), the frontend shows an
editable pre-filled form or a confirm/cancel card depending on the action
type, and the actual database write only happens when the user explicitly
submits — via `POST /search/actions/:id/confirm` in `routes/actions.routes.ts`.
See `agent/orchestrator.ts` and `agent/forms.ts` for the full flow.

## Useful commands

```bash
npm run dev              # start the dev server with hot reload
npm run build             # type-check and compile to dist/ (production build)
npm start                 # run the compiled build (after npm run build)
npm run seed               # re-run the demo data seed script
npm run prisma:studio      # opens a visual database browser in your browser
npm run prisma:generate    # regenerate the Prisma client after editing schema.prisma
npm run prisma:migrate     # create/apply a new migration after editing schema.prisma
```

`npm run prisma:studio` is worth knowing about early — it opens a local
web UI (usually `http://localhost:5555`) where you can browse and edit
every table directly, which is a fast way to see what a migration or seed
actually produced without writing SQL.

## Troubleshooting

**`docker ps` shows an error, or `docker compose up -d` fails**
Docker Desktop (the application) isn't open, or hasn't finished starting
yet. Open it from your Applications/Start Menu and wait a few seconds
before retrying — the `docker` command in your terminal is just a client
that talks to that running app.

**Port `5432`, `4000`, or `5555` (Prisma Studio) is already in use**
Something else is already using that port — often a previous run of this
same app, or an unrelated local Postgres install listening on `5432`.
Stop whatever's holding it, or for the backend's own port, change `PORT`
in `.env` (and update `NEXT_PUBLIC_API_URL` in the frontend's env file to
match, if you also run the frontend).

**Backend logs `GROQ_API_KEY is not set`**
`.env` is either missing a key or still has the placeholder value. Get a
free one at [console.groq.com/keys](https://console.groq.com/keys), set
`GROQ_API_KEY`, and restart the server (`Ctrl+C`, then `npm run dev`
again — env changes aren't picked up by hot reload, only a real restart).

**Agent requests fail with a rate-limit error**
The free tier is capped at 14,400 requests/day and 30 requests/minute.
Wait a minute (per-minute limit) or try again tomorrow (daily limit).

**`npx prisma migrate dev` can't connect to the database**
Almost always means Postgres isn't running yet — run `docker ps` from the
repo root to confirm the `ats_postgres` container is up before retrying.
If it is running but this still fails, check that `DATABASE_URL` in
`.env` matches the user/password/db name in `docker-compose.yml` (they
match by default if you haven't edited either file).

**Frontend gets "Failed to fetch" when logging in**
This is almost always a CORS mismatch, not a backend crash: `CORS_ORIGIN`
in this `.env` has to exactly match the URL the frontend is actually
running on (protocol + host + port). If the frontend fell back to a
different port (e.g. `3001` because `3000` was already taken), update
`CORS_ORIGIN` here to match and restart the backend.

**A migration or the seed script fails partway through**
The safest reset during local development is:

```bash
npx prisma migrate reset
```

This drops and recreates the database from scratch, reapplies every
migration, and (by default) re-runs the seed script — useful any time
your local database gets into a confusing state and you'd rather start
clean than debug it. It's destructive to local data only (there's nothing
to lose in a fresh dev setup), never run it against a database you care
about keeping.
