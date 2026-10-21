# @ritme/frontend

React 19 + Vite + Tailwind 3 (the `@ritme/design` preset) + TanStack Query + react-router + Firebase Auth.
It talks to the backend only through `@ritme/api-client`.

## Run it

```bash
# Against the backend (default http://localhost:8080 or deployed Cloud Run URL)
pnpm --filter @ritme/frontend dev

# Against the backend with local Firebase Auth emulator
pnpm infra:auth                                                  # repo root, once
VITE_USE_AUTH_EMULATOR=true pnpm --filter @ritme/frontend dev
```

See `.env.example` for every variable. All `VITE_` values are public.

| Variable | Meaning |
|---|---|
| `VITE_USE_MOCK_API` | Serve every endpoint from `mocks/` (in-memory, persisted in `localStorage`, includes the seeded demo). |
| `VITE_MOCK_LATENCY_MS` | Fake latency so skeletons are visible (default 150). |
| `VITE_API_BASE_URL` | Backend origin (default `http://localhost:8080`). |
| `VITE_USE_AUTH_EMULATOR`, `VITE_AUTH_EMULATOR_URL` | Use the Firebase Auth emulator. |
| `VITE_FIREBASE_*` | Real Firebase web config (apiKey, authDomain, projectId, appId). |
| `VITE_EXTENSION_ID` | Fallback extension id for `/connect` when `?ext=` is missing. |

## Scripts

```bash
pnpm --filter @ritme/frontend typecheck
pnpm --filter @ritme/frontend lint
pnpm --filter @ritme/frontend test        # vitest + testing-library (TZ is pinned to Asia/Jakarta)
pnpm --filter @ritme/frontend build
pnpm --filter @ritme/frontend test:e2e    # Playwright + axe against the mock API
```

`test:e2e` uses the installed Chrome by default. Set `PW_CHANNEL=msedge` for Edge, or `PW_CHANNEL=bundled` after
`pnpm exec playwright install chromium`. `E2E_PORT` changes the dev-server port (default 5173).

## Layout

```text
src/i18n/en.ts           every user-facing string (calm tone: no guilt, no streaks, no overdue/late/missed)
src/lib/                 env, auth (Firebase + mock), api provider, queries, dates, display settings
src/components/layout/   GMera shell: collapsible sidebar (250 → 72px), sticky navbar, route guards
src/components/ui/       status badges (icon + word), query boundary, confirm dialog, choice group
src/features/canvas/     Clarity Canvas: Truth Board, blocker cards, plan views, editor, approval, diff
src/features/calendar/   one model feeding Week, Agenda and Timeline (same item set)
src/pages/               Login, Welcome (questionnaire), Dashboard, Calendar, Library, Workflow, Settings, Privacy, Connect
mocks/                   in-memory fake API shaped exactly like @ritme/api-client (+ a tiny stand-in engine)
e2e/                     Playwright smoke test and axe checks
```

## Behaviour worth knowing

- **Nothing is written without approval.** The plan is a draft; tasks exist only after Approve → Execute, and the
  Verified badge is shown only when the server reports `verification: "verified"` (otherwise it says Unverified).
- **Dates are never guessed.** Undated items go to "No date yet". Items are placed on the user's *local* day.
  Open items whose date has passed sit under a neutral "Earlier, still open" with a Something changed action.
- **Display settings** (text size, spacing, reduce motion) are local and written as `data-*` attributes on `<html>`.
- **Mock mode is development only.** The mock is excluded from production builds.
