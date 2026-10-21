# Ritme

Your work, made clear, on your terms. A worker-owned, private, non-chat assistant for neurodivergent workers:
capture work text on purpose → Truth Board (facts / assumptions / blockers) → clarify → preference-shaped plan →
approve → tasks created **and verified** → "Something changed" → Before/After → approve.

---

## Architecture & Layout

```text
apps/frontend       React + Vite + Tailwind (Deployed on Vercel)
apps/backend        FastAPI + SQLAlchemy/Alembic (Deployed on Google Cloud Run)
apps/extension      Chrome MV3 capture extension
packages/ai-engine  Vertex AI (Gemini) engine library: steps, prompts, guards, FakeLlm
packages/contracts  Pydantic contracts (single source of truth) → JSON Schema
packages/api-client Generated TypeScript types + typed fetch client
packages/design     Tailwind preset + shared UI primitives
infra/              Dockerfiles, Cloud Build, deployment scripts, Cloud SQL & Cloud Run config
docs/               Architecture, API specifications, and infrastructure documentation
evals/              Evaluation benchmarks and test scenarios
```

- **Frontend**: Hosted on **Vercel** (`https://<your-app>.vercel.app`).
- **Backend**: Hosted on **Google Cloud Run** (`ritme-api`, public HTTPS).
- **Database**: **Google Cloud SQL (PostgreSQL 16)** in `asia-southeast2` (Jakarta), connected privately via Cloud Run's native unix domain socket. No database ports exposed to the public internet.
- **Queue / Async Runs**: Cloud Tasks (`ritme-runs`) triggering private Cloud Run worker (`ritme-worker`), or `RUN_QUEUE=local` for in-process async runs.
- **Secrets**: Google Secret Manager (`ritme-db-password`, `ritme-extension-token-secret`).
- **Auth**: Firebase Auth (Google Sign-In) verified with `firebase-admin` (Application Default Credentials).

---

## Deployment (Cloud Run + Cloud SQL)

The frontend is hosted on **Vercel** while the backend and database run on **Google Cloud**.

### 1. Deploy Backend to Cloud Run & Cloud SQL

#### Option A: Via Google Cloud Shell (Recommended — 0 Local Setup)
Open [Google Cloud Shell](https://shell.cloud.google.com), clone your repository, and run:
```bash
export GCP_PROJECT_ID="your-gcp-project-id"
export ALLOWED_ORIGINS="https://your-frontend.vercel.app"

bash infra/deploy.sh
```

#### Option B: Via Windows PowerShell
If you have `gcloud` installed locally on Windows:
```powershell
gcloud auth login
gcloud config set project your-gcp-project-id

.\infra\deploy.ps1 -ProjectId "your-gcp-project-id" -AllowedOrigins "https://your-frontend.vercel.app"
```

The script automatically:
1. Enables necessary GCP APIs (`run`, `sqladmin`, `artifactregistry`, `cloudbuild`, `secretmanager`, `aiplatform`).
2. Provisions PostgreSQL 16 on Cloud SQL (`ritme-db`) and creates database `ritme`.
3. Generates and stores credentials in Secret Manager (`ritme-db-password`).
4. Builds the lean backend container via Cloud Build using `infra/Dockerfile.backend`.
5. Executes database migrations via Cloud Run Job (`alembic upgrade head`).
6. Deploys the FastAPI service to Cloud Run with native Cloud SQL socket attachment and CORS origins allowed.

### 2. Connect Your Vercel Frontend

After deployment, take the Cloud Run URL (e.g. `https://ritme-api-xxxxx-as.a.run.app`) and configure Vercel:

1. **Vercel Environment Variables** (Project Settings → Environment Variables):
   - `VITE_API_BASE_URL` = `https://ritme-api-xxxxx-as.a.run.app`
   - `VITE_USE_AUTH_EMULATOR` = `false`
   - `VITE_FIREBASE_API_KEY` = `<your-firebase-api-key>`
   - `VITE_FIREBASE_AUTH_DOMAIN` = `<your-firebase-auth-domain>`
   - `VITE_FIREBASE_PROJECT_ID` = `<your-firebase-project-id>`
   - `VITE_FIREBASE_APP_ID` = `<your-firebase-app-id>`
2. **Firebase Authorized Domains** ([Firebase Console](https://console.firebase.google.com/) → Authentication → Settings → Authorized domains):
   - Add your Vercel domain (`your-frontend.vercel.app`).
3. **Redeploy on Vercel** to apply the new API URL.

For detailed architecture diagrams and IAM role breakdowns, see [docs/infrastructure.md](file:///c:/Users/Rangga/Documents/Project/Hackaton2/docs/infrastructure.md).

---

## Local Development (No GCP Needed)

```bash
cp .env.example .env
pnpm install
uv sync --all-packages
pnpm infra:up          # Postgres on localhost:5433
pnpm db:migrate
pnpm infra:auth        # Firebase Auth emulator (separate terminal)
pnpm dev               # api :8080, worker :8081, web :5173
```

- `LLM_PROVIDER=fake` (default) uses the deterministic FakeLlm.
- For live Gemini in development, set `LLM_PROVIDER=vertex`, `GCP_PROJECT_ID`, `VERTEX_LOCATION`, and run `gcloud auth application-default login`.
- Windows note: if `uv` cannot create its Python link, run once with `UV_PYTHON_DOWNLOADS=never` and `uv sync --all-packages --python <path to 3.12>`.

---

## Verification & Checks

```bash
pnpm lint && pnpm typecheck && pnpm test      # TypeScript + Python
uv run pytest                                  # Python only (needs Postgres from pnpm infra:up)
pnpm contracts:check                           # generated TS types match Pydantic contracts
```

---

## Demo Path

Sign in → Dashboard → **Try the demo** (`POST /api/demo/reset`, clearly labelled demo data) → the Canvas shows the Truth
Board with "Friday" and "everyone is aligned" as blocker cards → answer or defer → plan → **Approve** → Verified task IDs →
**Something changed** → Before/After → approve → reload to see it resume → Privacy page.

The same journey is automated in `apps/backend/tests/test_journey.py` against the real engine with the FakeLlm.

---

## Status and Limitations

- **Frontend**: React + Vite + Tailwind SPA deployed on Vercel.
- **Backend & Database**: FastAPI on Google Cloud Run with Google Cloud SQL (PostgreSQL 16).
- **Extension & AI Engine**: Built with Vertex AI (Gemini) integration with deterministic fallback (`FakeLlm`).
- **Security & Privacy**: No service account key files used anywhere (ADC only). Cloud SQL is connected via private unix domain sockets without public internet exposure. Logs contain allowlisted fields only (no prompts, notes, or captured text logged).
- **Compliance**: Not legal advice; no formal regulatory compliance claims (see PDP note in the spec §3).
