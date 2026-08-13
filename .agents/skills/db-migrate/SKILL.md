---
name: db-migrate
description: Create and apply a Prisma database migration for TalentFlow. Use when asked to migrate the database, add a migration, update the schema, run prisma migrate, add a new model or field to the database, or change the Prisma schema.
compatibility: Designed for Claude Code and GitHub Copilot Agent mode. Requires Docker (Postgres running) and Node.js.
allowed-tools: Bash Read
---

## Checklist

- [ ] Step 1: Confirm Postgres is running
- [ ] Step 2: Edit `backend/prisma/schema.prisma`
- [ ] Step 3: Run migration
- [ ] Step 4: Verify Prisma client is up to date
- [ ] Step 5: Update seed if needed

---

## Step 1 — Confirm Postgres is running

```bash
docker compose ps
```

`ats_postgres` must show `Up`. If not:

```bash
docker compose up -d
```

## Step 2 — Edit the schema

File: `backend/prisma/schema.prisma`

All models, fields, enums, and relations live here. Follow the existing patterns:
- Optional fields use `?` suffix
- Enums are defined at the bottom of the file
- Relation fields always come in pairs (field + `@relation`)
- Use `@default(now())` for `createdAt`, `@updatedAt` for `updatedAt`

## Step 3 — Run the migration

Run from `backend/`:

```bash
cd backend && npm run prisma:migrate
```

This is `prisma migrate dev`, which:
1. Prompts interactively for a migration name — use **descriptive snake_case** (e.g. `add_candidate_notes`, `add_job_salary_range`)
2. Generates SQL in `backend/prisma/migrations/<timestamp>_<name>/migration.sql`
3. Applies the migration to the DB
4. Regenerates the Prisma client automatically

To skip the interactive prompt (CI or automation):

```bash
cd backend && npx prisma migrate dev --name <descriptive_name>
```

## Step 4 — Verify client

If `npm run prisma:migrate` ran cleanly, the client is already regenerated. If you edited the schema without running a migration (e.g. for a local experiment), regenerate manually:

```bash
cd backend && npm run prisma:generate
```

## Step 5 — Update seed if needed

If the migration adds required fields or new lookup data, update `backend/prisma/seed.ts` and re-run:

```bash
cd backend && npm run seed
```

Note: seed is NOT idempotent for users/jobs (unique email constraint). For a clean re-seed, reset first — see the `db-seed` skill.

---

## Gotchas

- **Postgres must be up**: Migration will fail immediately if the container is not running.
- **Migration name convention**: Use snake_case, start with a verb (`add_`, `remove_`, `rename_`, `create_`). Avoid generic names like `update` or `fix` — the name is permanent in the migrations folder.
- **Don't edit migration SQL manually** after it has been applied — create a new migration instead.
- **Prisma Studio** (`cd backend && npm run prisma:studio`) opens a GUI at `localhost:5555` to inspect data after migration.
- **`migrate reset`** wipes all data and re-runs all migrations from scratch — only use in development:
  ```bash
  cd backend && npx prisma migrate reset
  ```
