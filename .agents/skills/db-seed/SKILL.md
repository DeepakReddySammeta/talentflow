---
name: db-seed
description: Seed the TalentFlow database with demo data. Use when asked to seed the database, populate demo data, reset and reseed, create test data, or set up a fresh database with sample records.
compatibility: Designed for Claude Code and GitHub Copilot Agent mode. Requires Docker (Postgres running) and Node.js.
allowed-tools: Bash Read
---

## Quick seed (data already exists, just want fresh demo records)

```bash
cd backend && npm run seed
```

**Warning: this will error** if demo users already exist (unique email constraint). If you get a unique constraint error, do a full reset instead (see below).

---

## Full reset + reseed (wipe everything and start clean)

```bash
cd backend && npx prisma migrate reset
```

This drops all tables, re-runs all migrations, then **automatically runs the seed script**. All data is destroyed — only use in development.

---

## What gets seeded

### Users (5 accounts, all password: `password123`)

| Email | Role | Department |
|---|---|---|
| admin@talentflow.dev | ADMIN | Management |
| hr@talentflow.dev | HR | Engineering |
| manager@talentflow.dev | MANAGER | Engineering |
| interviewer@talentflow.dev | INTERVIEWER | Engineering |
| interviewer2@talentflow.dev | INTERVIEWER | Engineering |

### Jobs (4 open positions)

| Title | Department | Level | Pay (INR/yr) |
|---|---|---|---|
| SDE - Frontend | Engineering | Mid | ₹12L – 18L |
| SDE - Backend | Engineering | Mid | ₹14L – 20L |
| Senior Software Engineer | Engineering | Senior | ₹20L – 30L |
| Product Designer | Design | Senior | ₹16L – 24L |

### Candidates (6 records)

Alex Thomas, Meera Nair, Kavya Pillai, Ananya Krishnan, Rohan Gupta, Vikram Shah — all with skills, location, experience, and LinkedIn URLs filled.

### Interviews, Offers, Stages

- 8 pipeline stages across all jobs (with KRAs and assigned interviewers)
- 8 interviews (including scheduled, cleared, rejected)
- 1 offer for Alex Thomas (SENT, approved by Asha Rao)

### Feature flags

| Key | Default |
|---|---|
| voice_search_enabled | true |
| agent_actions_enabled | false |
| dashboard_charts_beta | true |

---

## Gotchas

- `npm run seed` is **NOT idempotent** for users and jobs — running it twice on an existing DB will throw `UniqueConstraintViolation` on email fields.
- Feature flags use `upsert` with `skipDuplicates` and ARE idempotent — safe to run multiple times.
- After `prisma migrate reset`, the seed runs automatically — you do not need to run `npm run seed` separately.
- Seed file location: `backend/prisma/seed.ts`
