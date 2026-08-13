---
name: dev-start
description: Start the TalentFlow development stack. Use when asked to start the app, run dev servers, spin up TalentFlow, start the backend or frontend, or launch the development environment.
compatibility: Designed for Claude Code and GitHub Copilot Agent mode. Requires Docker, Node.js 18+, and npm.
allowed-tools: Bash Read
---

## Checklist

- [ ] Step 1: Start Postgres container
- [ ] Step 2: Start backend dev server
- [ ] Step 3: Start frontend dev server
- [ ] Step 4: Verify both servers are healthy

---

## Step 1 — Start Postgres

Run from the **repo root** (`talentflow/`):

```bash
docker compose up -d
```

Expected output: `ats_postgres` container starts. If already running, this is a no-op.

## Step 2 — Start backend

Run from `backend/`:

```bash
cd backend && npm run dev
```

This runs `tsx watch src/index.ts` — hot reload is active. The server starts on **port 4000**.

Required env file: `backend/.env` must exist with at minimum:

```
DATABASE_URL=postgresql://ats_user:ats_password@localhost:5432/ats_db
JWT_SECRET=<any string>
GROQ_API_KEY=<groq api key>
PORT=4000
CORS_ORIGIN=http://localhost:3000
```

Health check: `curl http://localhost:4000/health` should return `{"status":"ok"}`.

## Step 3 — Start frontend

Run from `frontend/` in a **separate terminal**:

```bash
cd frontend && npm run dev
```

This runs `next dev`. The app opens on **http://localhost:3000**.

Required env file: `frontend/.env` must exist with:

```
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=ws://localhost:4000
```

## Step 4 — Verify

| Service | URL | Expected |
|---|---|---|
| Backend REST | http://localhost:4000/health | `{"status":"ok"}` |
| WebSocket | ws://localhost:4000/ws/search | Connects with `?token=<jwt>` |
| Frontend | http://localhost:3000 | Login page |

---

## Gotchas

- **Order matters**: Postgres must be up before the backend starts (Prisma connects on startup). Backend must be up before the frontend makes API calls.
- **Port conflicts**: If port 5432 is in use by a local Postgres instance, stop it first or change the Docker port mapping in `docker-compose.yml`.
- **Missing .env files**: Copy from `backend/.env.example` / `frontend/.env.example` if they exist. If not, create them with the values above.
- **Prisma client not generated**: If you see `PrismaClientInitializationError`, run `cd backend && npx prisma generate` first.

## Demo accounts

All passwords: `password123`

| Email | Role |
|---|---|
| admin@talentflow.dev | ADMIN |
| hr@talentflow.dev | HR |
| manager@talentflow.dev | MANAGER |
| interviewer@talentflow.dev | INTERVIEWER |
