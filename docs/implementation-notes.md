# Implementation notes

## Stack (decided 2026-10-18)

| Part | Choice |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2 + Alembic, Postgres (Docker local, Cloud SQL deployed), firebase-admin |
| AI engine | `packages/ai-engine` (Python library): google-genai in Vertex mode, Pydantic, FakeLlm for tests |
| Contracts | `packages/contracts` Pydantic → JSON Schema → `packages/api-client` TS types |
| Frontend / extension | React 19, Vite 6, Tailwind 3 (+ `packages/design` preset), Radix primitives, TanStack Query |
| Auth | Firebase Auth, Google sign-in only; Auth emulator locally |
| Real tool | Native Ritme tasks only. Calendar is a read-only view of Ritme's own dates. No mobile app/PWA. |

Deviation from the spec: §6/§7 assumed TypeScript end to end. This repo is Python server side + TypeScript client side; the
generated schema bridges them and CI (`pnpm contracts:check`) fails on drift.

## Local toolchain notes (Windows)

- uv could not create its Python minor-version link for 3.12; use `UV_PYTHON_DOWNLOADS=never` and
  `uv sync --all-packages --python <path-to-3.12>` once; afterwards `uv run` uses `.venv`.
- pnpm 12 blocks dependency build scripts; allowed ones are listed under `allowBuilds` in `pnpm-workspace.yaml`.
- `gcloud` and the Firebase CLI are not installed; local dev uses `LLM_PROVIDER=fake` and the Auth emulator (`pnpm infra:auth`).

## Boundaries

- TS: `.dependency-cruiser.cjs` (`pnpm lint:boundaries`). Python: import-linter contracts in root `pyproject.toml`.
- `google.genai` may only be imported inside `ritme_ai.llm`. The engine never imports the backend/DB/HTTP framework.
