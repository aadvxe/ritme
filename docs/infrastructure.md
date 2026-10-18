# Infrastructure (Google Cloud)

Status: **designed and scripted, NOT deployed.** `gcloud` is not installed on the development machine and no project
has been provisioned, so nothing here has been run against real GCP. The exact manual steps are below.
See `docs/gcp-architecture.md` for the diagram.

## Resources

| Concern | Service | Notes |
|---|---|---|
| Web + API (`ROLE=api`) | Cloud Run `ritme-api` (public) | Serves the built SPA and `/api`. One origin, so no CORS for the web app. |
| Runs (`ROLE=worker`) | Cloud Run `ritme-worker` (**private**) | Only `ritme-tasks-invoker` has `run.invoker`. Handler also verifies the Cloud Tasks OIDC token. |
| Queue | Cloud Tasks `ritme-runs` | Task name `run-<runId>` makes enqueue idempotent. Only the run id is sent, never content. |
| Database | Cloud SQL for PostgreSQL, `asia-southeast2` | Reached through Cloud Run's built-in Cloud SQL connection (unix socket). No public authorized networks. Prefer private IP. |
| LLM | Vertex AI (Gemini) | ADC via the runtime service account; no API keys. Model and location from env. |
| Auth | Identity Platform / Firebase Auth (Google sign-in) | Backend verifies ID tokens with firebase-admin (ADC). |
| Secrets | Secret Manager | `ritme-db-password`, `ritme-extension-token-secret`, mounted as env. |
| Migrations | Cloud Run Job `ritme-migrate` | `alembic upgrade head`, run before traffic shifts. |
| Build | Cloud Build → Artifact Registry | One image; role chosen by `ROLE`. |
| Observability | Cloud Logging, Error Reporting, Monitoring | Logs are allowlisted fields only (see Privacy). |

## Service accounts (no key files anywhere)

| Account | Roles |
|---|---|
| `ritme-api` | `cloudsql.client`, `aiplatform.user` (short sync steps), `cloudtasks.enqueuer`, `secretmanager.secretAccessor` on the two named secrets |
| `ritme-worker` | `cloudsql.client`, `aiplatform.user`, `secretmanager.secretAccessor` on the two named secrets |
| `ritme-tasks-invoker` | `run.invoker` on `ritme-worker` only |

## Region and where prompts are processed

- Cloud Run and Cloud SQL: `asia-southeast2` (Jakarta), to keep stored data in Indonesia.
- Model inference runs in `VERTEX_LOCATION` (default `us-central1`). **Verify the chosen model's availability and quota in
  the region you configure before relying on it.** Text a user chooses to capture is sent there to be analysed. The
  Privacy page in the app states the configured location.
- Nothing in the app or docs claims legal compliance. Preference data about how someone works can be sensitive personal
  data; a formal legal review is outside the MVP scope.

## Manual steps (what `infra/deploy.sh` automates)

1. Create/choose a GCP project, enable billing, then `gcloud auth login` and `gcloud config set project <ID>`.
2. Create a Cloud SQL Postgres 16 instance `ritme-db` in `asia-southeast2`, database `ritme`, user `ritme`; store the
   password in Secret Manager as `ritme-db-password`.
3. Create a random signing key and store it as `ritme-extension-token-secret`.
4. In Firebase console: add the project, enable **Google** sign-in, add the deployed domain to authorized domains.
5. Export `GCP_PROJECT_ID`, `ALLOWED_ORIGINS` (the `ritme-api` URL), `EXTENSION_ID`, run `bash infra/deploy.sh`.
6. Build the frontend with the Firebase web config (`VITE_FIREBASE_*`, public values) before building the image.
7. Set a billing budget alert and review Vertex AI quotas.
8. Set `MIN_INSTANCES=1` before a scheduled demo to avoid cold starts.

## Rollback

Cloud Run keeps revisions: `gcloud run services update-traffic ritme-api --to-revisions=<previous>=100`. Migrations are
forward-only; write a down-migration before shipping a destructive one.

## Logs and retention

Cloud Logging's default bucket retains logs for 30 days; set the retention you want on the `_Default` bucket
(`gcloud logging buckets update _Default --location=global --retention-days=<N>`). The application only logs request ID,
route, method, status, duration, error type/code and workflow/action/run IDs. It never logs request bodies, captured
text, notes, preferences, tokens or prompts (`apps/backend/app/logging.py`, covered by `test_hardening.py`). Optional model
request/response logging stays disabled.

## Correctness on multiple instances

Exactly-once execution lives in the database: compare-and-set `approved → executing`, a unique idempotency key per user,
deterministic task ids and a unique `(created_by_action_id, draft_id)` constraint. The per-instance rate limiter only
protects against bursts; no workflow state is held in memory.
