# Infrastructure (Google Cloud Run + Cloud SQL)

## Architecture Overview

- **Frontend**: Hosted on **Vercel** (`https://<your-app>.vercel.app`).
- **Backend API**: Hosted on **Google Cloud Run** (`ritme-api`, public HTTPS).
- **Database**: **Google Cloud SQL for PostgreSQL 16** (`asia-southeast2` Jakarta). Connected securely via Cloud Run's native unix domain socket (`/cloudsql/<INSTANCE_CONNECTION_NAME>`). No public database ports exposed to the internet.
- **Worker / Queue**: Cloud Tasks (`ritme-runs`) triggering private Cloud Run worker (`ritme-worker`), or `RUN_QUEUE=local` for in-process async runs.
- **Secrets**: Google Secret Manager (`ritme-db-password`, `ritme-extension-token-secret`).
- **Migrations**: Cloud Run Job (`ritme-migrate`), running `alembic upgrade head` before traffic is directed to the backend.
- **Inference**: Vertex AI (Gemini) in `VERTEX_LOCATION` (`us-central1`), authenticated via Application Default Credentials (ADC) on the Cloud Run runtime service account.
- **Auth**: Firebase Auth (Google Sign-In), verified in backend using `firebase-admin` (ADC).

---

## Resources & Service Accounts

| Resource / Role | Service | Purpose |
|---|---|---|
| `ritme-api` | Cloud Run (public) | FastAPI JSON API handling `/api/*` requests from Vercel frontend |
| `ritme-worker` | Cloud Run (private) | Background worker executing LLM agent runs |
| `ritme-migrate` | Cloud Run Job | Executes Alembic schema migrations against Cloud SQL |
| `ritme-db` | Cloud SQL (PostgreSQL 16) | Primary persistent relational store |
| `ritme-runs` | Cloud Tasks | Queue dispatching runs to worker via OIDC |

### IAM Roles (No Service Account Key Files Required)
- `ritme-api`: `roles/cloudsql.client`, `roles/aiplatform.user`, `roles/cloudtasks.enqueuer`, `roles/secretmanager.secretAccessor` (on DB & extension secrets), `roles/iam.serviceAccountUser` (on `ritme-tasks-invoker`).
- `ritme-worker`: `roles/cloudsql.client`, `roles/aiplatform.user`, `roles/secretmanager.secretAccessor`.
- `ritme-tasks-invoker`: `roles/run.invoker` on `ritme-worker`.

---

## How to Deploy

### Option A: Using Google Cloud Shell (Recommended, 0 Local Setup)

Google Cloud Shell is a free browser-based shell with `gcloud`, `git`, and `bash` pre-configured.

1. Open [Google Cloud Shell](https://shell.cloud.google.com).
2. Clone your repository (or upload your repo folder):
   ```bash
   git clone <YOUR_GIT_REPO_URL>
   cd <REPO_NAME>
   ```
3. Set your project ID and Vercel frontend URL, then execute `deploy.sh`:
   ```bash
   export GCP_PROJECT_ID="your-gcp-project-id"
   export ALLOWED_ORIGINS="https://your-app.vercel.app"
   bash infra/deploy.sh
   ```
4. The script automatically:
   - Enables all needed APIs (Cloud Run, Cloud SQL, Secret Manager, Cloud Build, Artifact Registry, Vertex AI).
   - Provisions the PostgreSQL 16 Cloud SQL instance `ritme-db` in `asia-southeast2` (if it does not exist).
   - Generates strong credentials and saves them to Secret Manager (`ritme-db-password` & `ritme-extension-token-secret`).
   - Builds the backend Docker container via Cloud Build using [infra/Dockerfile.backend](file:///c:/Users/Rangga/Documents/Project/Hackaton2/infra/Dockerfile.backend).
   - Runs database migrations via Cloud Run Job (`ritme-migrate`).
   - Deploys the public `ritme-api` Cloud Run service with Cloud SQL unix socket mounted and Vercel CORS origins enabled.
   - Outputs the deployed Cloud Run API URL (e.g., `https://ritme-api-xxxxx-as.a.run.app`).

---

### Option B: Using Windows PowerShell (Local Machine)

If you have Google Cloud SDK (`gcloud`) installed locally:

1. Open PowerShell in the project root:
   ```powershell
   gcloud auth login
   gcloud config set project your-gcp-project-id
   ```
2. Run the deployment script:
   ```powershell
   .\infra\deploy.ps1 -ProjectId "your-gcp-project-id" -AllowedOrigins "https://your-app.vercel.app"
   ```

---

## Connecting Vercel Frontend to Cloud Run Backend

1. **Vercel Environment Variables**:
   In your Vercel Dashboard -> **Project Settings** -> **Environment Variables**, configure:
   - `VITE_API_BASE_URL` = `https://ritme-api-xxxxx-as.a.run.app` (your Cloud Run API URL)
   - `VITE_FIREBASE_API_KEY` = your Firebase web API key
   - `VITE_FIREBASE_AUTH_DOMAIN` = your Firebase auth domain
   - `VITE_FIREBASE_PROJECT_ID` = your Firebase project ID
   - `VITE_FIREBASE_APP_ID` = your Firebase app ID
   - `VITE_USE_AUTH_EMULATOR` = `false`

2. **Firebase Authorized Domains**:
   In [Firebase Console](https://console.firebase.google.com) -> **Authentication** -> **Settings** -> **Authorized domains**:
   - Ensure your Vercel domain (`your-app.vercel.app`) is listed.
   - Ensure any custom domains are listed.

3. **Trigger Redeploy on Vercel**:
   Go to **Deployments** on Vercel -> **Redeploy** to build with the new environment variables.

---

## Verifying Deployment

1. Test API health endpoint:
   ```bash
   curl https://ritme-api-xxxxx-as.a.run.app/healthz
   # Expected response: {"status":"ok","role":"api"}
   ```
2. Open your Vercel web application in the browser:
   - Log in with Google.
   - Navigate to Dashboard and verify data loads from Cloud SQL.
