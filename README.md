# Ritme

Your work, made clear, on your terms. A worker-owned, private, non-chat assistant for neurodivergent workers:
capture work text on purpose → Truth Board (facts / assumptions / blockers) → clarify → preference-shaped plan →
approve → tasks created **and verified** → "Something changed" → Before/After → approve.

## Layout

```text
apps/frontend     React + Vite + Tailwind (GMera Solusi design language)
apps/backend      FastAPI + SQLAlchemy/Alembic (API, worker, tools, state machines)
apps/extension    Chrome MV3 capture extension
packages/ai-engine    Vertex AI (Gemini) engine library: steps, prompts, guards, FakeLlm
packages/contracts    Pydantic contracts (single source of truth) → JSON Schema
packages/api-client   Generated TS types + typed fetch client
packages/design       Tailwind preset + shared UI primitives
infra/ docs/ evals/
```

Read `docs/api.md` (endpoints + extension connect protocol), `docs/implementation-notes.md`,
`docs/gcp-architecture.md`, `docs/infrastructure.md`.

## Prerequisites

Node 20+, pnpm, Python 3.12 (via uv), Docker. For the Auth emulator `npx firebase-tools` is used on demand.
`gcloud` is only needed for live Vertex AI and deployment.

## Run locally (no GCP needed)

```bash
cp .env.example .env
pnpm install
uv sync --all-packages
pnpm infra:up          # Postgres on localhost:5433
pnpm db:migrate
pnpm infra:auth        # Firebase Auth emulator (separate terminal)
pnpm dev               # api :8080, worker :8081, web :5173
```

`LLM_PROVIDER=fake` (default) uses the deterministic FakeLlm. For live Gemini set `LLM_PROVIDER=vertex`, `GCP_PROJECT_ID`,
`VERTEX_LOCATION`, run `gcloud auth application-default login`, and verify model availability in that region.

Windows note: if `uv` cannot create its Python link, run once with `UV_PYTHON_DOWNLOADS=never` and
`uv sync --all-packages --python <path to 3.12>`.

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test      # TS + Python
uv run pytest                                  # Python only (backend tests need Postgres from `pnpm infra:up`)
pnpm contracts:check                           # generated TS types match the Pydantic contracts
```

## Demo path

Sign in → Dashboard → **Try the demo** (`POST /api/demo/reset`, clearly labelled demo data) → the Canvas shows the Truth
Board with "Friday" and "everyone is aligned" as blocker cards → answer or defer → plan → **Approve** → Verified task IDs →
**Something changed** → Before/After → approve → reload to see it resume → Privacy page.
The same journey is automated in `apps/backend/tests/test_journey.py` against the real engine with the FakeLlm.

## Status and honest limitations

- Backend: implemented and tested (55 tests incl. ownership, idempotency, approval gate, verification, failure recovery).
- Frontend, extension, AI engine are being built in parallel sessions; see their own READMEs/reports.
- **Not deployed.** GCP resources are scripted (`infra/deploy.sh`) but never run; see `docs/infrastructure.md`.
- No live Vertex AI call has been made from this repo yet; model/region availability is unverified.
- The 20-scenario evaluation runner is not built yet; no accuracy numbers are claimed anywhere.
- Per-instance rate limiting only; conflicting-source detection in the Context Library is not implemented.
- Not legal advice: no compliance claims (see PDP note in the spec §3).
