# Frontend — TalentFlow

Next.js 14 (App Router) + TypeScript + Tailwind + TanStack Query + Fission UI Design System.

## What lives here

```
app/
  login/page.tsx               Login page (no sidebar)
  (app)/                       Route group — everything behind auth
    layout.tsx                  Wraps children in Sidebar + TopBar + ProtectedRoute
    page.tsx                    Home: the agentic search bar (voice + text)
    dashboard/page.tsx          Funnel/donut/bar charts, scoped per role
    candidates/page.tsx
    candidates/[id]/page.tsx    Candidate debrief — all rounds' scorecards stacked
    jobs/page.tsx
    interviews/page.tsx         Structured scorecard form (KRA ratings + recommendation)
    offers/page.tsx             Includes the manager approval action
    users/page.tsx              Admin only — create/list users
    profile/page.tsx            Change password
    settings/page.tsx           Default landing page preference
    feature-flags/page.tsx      Admin only — toggle capability flags
components/
  ui/                           Fission UI components (registry-owned — see Design System below)
  Sidebar.tsx                   Collapsible, hover-to-peek, role-filtered nav + profile dropdown
  TopBar.tsx                    Notification bell with unread badge + popover panel
  ProtectedRoute.tsx            Client-side route guard (UX only — see Security note below)
  SearchBar.tsx                 Text + voice input (Web Speech API, feature-flag gated)
  SearchResultRenderer.tsx      Duck-types whatever entity the agent returned
  QueryProvider.tsx             TanStack Query client setup
lib/
  utils.ts                      cn() helper (clsx + tailwind-merge)
  authContext.tsx                Holds the logged-in user, login()/logout()
  apiClient.ts                  Fetch wrapper that attaches the JWT
  hooks.ts                      useJobs, useCandidates, useInterviews, useOffers,
                                 useAgenticSearch, useUsers, useSubmitScorecard,
                                 useNotifications, useFeatureFlags, useDashboardStats,
                                 useCandidateDebrief, useJobPipeline, and their mutations
  types.ts
hooks/
  use-toast.ts                  Toast state manager (used by <Toaster> in root layout)
```

## Setup

1. Install dependencies:
   ```bash
   npm install --legacy-peer-deps
   ```
   `--legacy-peer-deps` is required because some Radix UI packages declare peer
   dependencies that conflict with React 18/19. This is a known issue documented
   in the Fission UI setup guide.

2. Copy the env file (defaults are already correct for local dev):
   ```bash
   cp .env.example .env.local
   ```

3. Make sure the backend is running on port 4000 (see `backend/README.md`),
   then start the frontend:
   ```bash
   npm run dev
   ```

   Runs on http://localhost:3000.

---

## Design System — Fission UI

This project uses the **[Fission UI Design System](https://fissionhq.github.io/ui-design-system)** by FissionHQ.

### How it works

Fission is not an npm package — it distributes components via a **shadcn registry** hosted on GitHub Pages. When you install a component, the shadcn CLI fetches its JSON definition from the registry, rewrites all `@/` import aliases to match this project's structure, and writes the component source file directly into `components/ui/`.

This means:

- **`components/ui/` files are Fission source** — not custom code. They were fetched from the Fission registry.
- **Never edit files in `components/ui/` manually.** Any manual edits will be overwritten the next time a component is updated from the registry.
- The `registries.fission` entry in `components.json` points to the Fission registry URL so the shadcn CLI knows where to look.

### Installed components

The following 10 **Fission-branded** components are installed. Always use the full registry URL when re-installing or updating these — using the plain `npx shadcn add <name>` shorthand would overwrite them with the unthemed default shadcn version.

| Component | Registry URL |
|---|---|
| Button | `https://FissionHQ.github.io/ui-design-system/r/button.json` |
| Input | `https://FissionHQ.github.io/ui-design-system/r/input.json` |
| Card | `https://FissionHQ.github.io/ui-design-system/r/card.json` |
| Dialog | `https://FissionHQ.github.io/ui-design-system/r/dialog.json` |
| Table | `https://FissionHQ.github.io/ui-design-system/r/table.json` |
| Form | `https://FissionHQ.github.io/ui-design-system/r/form.json` |
| Badge | `https://FissionHQ.github.io/ui-design-system/r/badge.json` |
| Select | `https://FissionHQ.github.io/ui-design-system/r/select.json` |
| Tabs | `https://FissionHQ.github.io/ui-design-system/r/tabs.json` |
| Toast | `https://FissionHQ.github.io/ui-design-system/r/toast.json` |

The following additional components were pulled from the standard public shadcn registry (safe to update without the full URL):

`switch` · `separator` · `avatar` · `toggle-group` · `alert` · `dropdown-menu` · `popover` · `textarea` · `label`

### Updating a component to the latest Fission version

Run the same `npx shadcn add` command with the full registry URL and the `--yes` flag to overwrite without prompting:

```bash
# Update a single component
npx shadcn add https://FissionHQ.github.io/ui-design-system/r/button.json --yes

# Update all 10 Fission components at once
npx shadcn add \
  https://FissionHQ.github.io/ui-design-system/r/button.json \
  https://FissionHQ.github.io/ui-design-system/r/input.json \
  https://FissionHQ.github.io/ui-design-system/r/card.json \
  https://FissionHQ.github.io/ui-design-system/r/dialog.json \
  https://FissionHQ.github.io/ui-design-system/r/table.json \
  https://FissionHQ.github.io/ui-design-system/r/form.json \
  https://FissionHQ.github.io/ui-design-system/r/badge.json \
  https://FissionHQ.github.io/ui-design-system/r/select.json \
  https://FissionHQ.github.io/ui-design-system/r/tabs.json \
  https://FissionHQ.github.io/ui-design-system/r/toast.json \
  --yes
```

> **Note:** The `registries.fission` block in `components.json` currently causes a schema
> validation error in shadcn CLI v4.15+. If the command fails with "Invalid configuration",
> temporarily remove the `registries` block from `components.json`, run the command, then
> restore it. This is a CLI version compatibility issue — the block is still valid for
> documentation purposes and future CLI versions.

### Adding a new component from Fission

Check the [Fission component catalogue](https://fissionhq.github.io/ui-design-system) for available components. Install using the full registry URL:

```bash
npx shadcn add https://FissionHQ.github.io/ui-design-system/r/<component-name>.json --yes
```

For components not in the Fission 10, use the standard shadcn registry:

```bash
npx shadcn add <component-name>
```

### Design tokens

All tokens are CSS custom properties defined in `app/globals.css` and mapped to Tailwind classes in `tailwind.config.ts`. Use Tailwind classes — never hardcode hex values.

| Tailwind class | CSS variable | Value | Use for |
|---|---|---|---|
| `bg-primary` | `--primary` | `#f25011` | Buttons, active nav, brand accent |
| `bg-background` | `--background` | `#fafafa` | Page background |
| `bg-card` | `--card` | `#ffffff` | Card / panel surfaces |
| `bg-muted` | `--muted` | `#f4f4f5` | Subtle backgrounds |
| `text-foreground` | `--foreground` | `#18181b` | Primary text |
| `text-muted-foreground` | `--muted-foreground` | `#71717a` | Secondary / caption text |
| `border-border` | `--border` | `#e4e4e7` | All borders |
| `bg-destructive` | `--destructive` | `#dc2626` | Errors, delete actions |
| `bg-success` | `--success` | `#16a34a` | Success states |
| `bg-warning` | `--warning` | `#d97706` | Warning states, offer badges |
| `bg-sidebar` | `--sidebar-background` | `#1c1e2e` | Sidebar background |

---

## Why TanStack Query (not Redux/RTK Query) for data fetching

Candidates, jobs, interviews, and offers are **server state** — cached copies of what's
in Postgres — not real client/UI state. TanStack Query is purpose-built for that: caching,
automatic refetch, and de-duplication come for free, and every list page in this app is just
a `useQuery` call (see `lib/hooks.ts`). If you later add genuine client-side state (a
multi-step scheduling wizard, draft form state before submit), reach for plain React state
or Zustand — don't put that in TanStack Query, and there's no need for Redux here since
there's no existing store this app is plugging into.

---

## Security note: RBAC here is UX, not enforcement

`Sidebar.tsx` and `ProtectedRoute.tsx` hide links and pages a role shouldn't use, purely
so the UI doesn't feel broken. They are **not** what keeps data safe — every backend route
independently re-checks the caller's role (see `backend/src/middleware/rbac.ts`). If someone
bypasses the UI and calls the API directly, the backend still returns a 403.

Also: the JWT is stored in `localStorage` for simplicity so this demo is easy to run
locally. A production build should have the backend set an httpOnly cookie on login instead,
so the token is never reachable from client-side JS at all.
