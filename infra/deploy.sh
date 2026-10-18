#!/usr/bin/env bash
# Deploy Ritme to Google Cloud Run. NOT RUN YET: gcloud is not installed on the dev machine and no project
# has been provisioned. Read docs/infrastructure.md, set the variables below, run step by step.
# This script never creates or downloads service-account key files (ADC / runtime identity only).
set -euo pipefail

: "${GCP_PROJECT_ID:?set GCP_PROJECT_ID}"
REGION="${GCP_REGION:-asia-southeast2}"
VERTEX_LOCATION="${VERTEX_LOCATION:-us-central1}"
REPO="${AR_REPO:-ritme}"
IMAGE="${REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${REPO}/ritme:${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo latest)}"
SQL_INSTANCE="${SQL_INSTANCE:-ritme-db}"
INSTANCE_CONNECTION_NAME="${GCP_PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
QUEUE="${CLOUD_TASKS_QUEUE:-ritme-runs}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"   # set to 1 before a scheduled demo to avoid cold starts

echo "1/7 enable APIs"
gcloud services enable run.googleapis.com sqladmin.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com cloudtasks.googleapis.com secretmanager.googleapis.com aiplatform.googleapis.com \
  identitytoolkit.googleapis.com --project "$GCP_PROJECT_ID"

echo "2/7 service accounts (least privilege)"
for sa in ritme-api ritme-worker ritme-tasks-invoker; do
  gcloud iam service-accounts describe "$sa@$GCP_PROJECT_ID.iam.gserviceaccount.com" >/dev/null 2>&1 \
    || gcloud iam service-accounts create "$sa" --project "$GCP_PROJECT_ID"
done
bind() { gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" --member "serviceAccount:$1@$GCP_PROJECT_ID.iam.gserviceaccount.com" --role "$2" --condition=None >/dev/null; }
bind ritme-api roles/cloudsql.client;        bind ritme-worker roles/cloudsql.client
bind ritme-api roles/aiplatform.user;        bind ritme-worker roles/aiplatform.user
bind ritme-api roles/cloudtasks.enqueuer
# secretmanager.secretAccessor is granted per secret below, not project-wide.

echo "3/7 secrets (create once; add values with: printf %s \"\$VALUE\" | gcloud secrets versions add NAME --data-file=-)"
for s in ritme-db-password ritme-extension-token-secret; do
  gcloud secrets describe "$s" --project "$GCP_PROJECT_ID" >/dev/null 2>&1 || gcloud secrets create "$s" --replication-policy=automatic --project "$GCP_PROJECT_ID"
  for sa in ritme-api ritme-worker; do
    gcloud secrets add-iam-policy-binding "$s" --member "serviceAccount:$sa@$GCP_PROJECT_ID.iam.gserviceaccount.com" --role roles/secretmanager.secretAccessor --project "$GCP_PROJECT_ID" >/dev/null
  done
done

echo "4/7 build + push the single image"
gcloud artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1 \
  || gcloud artifacts repositories create "$REPO" --repository-format=docker --location "$REGION"
gcloud builds submit --tag "$IMAGE" --config infra/cloudbuild.yaml --substitutions "_IMAGE=$IMAGE" .

COMMON_ENV="ENVIRONMENT=production,GCP_PROJECT_ID=$GCP_PROJECT_ID,GCP_REGION=$REGION,VERTEX_LOCATION=$VERTEX_LOCATION,LLM_PROVIDER=vertex,INSTANCE_CONNECTION_NAME=$INSTANCE_CONNECTION_NAME,DB_NAME=ritme,DB_USER=ritme,FIREBASE_PROJECT_ID=$GCP_PROJECT_ID,RUN_QUEUE=cloudtasks,CLOUD_TASKS_QUEUE=$QUEUE"
SECRETS="DB_PASSWORD=ritme-db-password:latest,EXTENSION_TOKEN_SECRET=ritme-extension-token-secret:latest"

echo "5/7 migrations (Cloud Run Job) — run BEFORE shifting traffic"
gcloud run jobs deploy ritme-migrate --image "$IMAGE" --region "$REGION" --service-account "ritme-api@$GCP_PROJECT_ID.iam.gserviceaccount.com" \
  --set-cloudsql-instances "$INSTANCE_CONNECTION_NAME" --set-env-vars "$COMMON_ENV" --set-secrets "$SECRETS" \
  --command alembic --args upgrade,head
gcloud run jobs execute ritme-migrate --region "$REGION" --wait

echo "6/7 worker (private) then api (public)"
gcloud run deploy ritme-worker --image "$IMAGE" --region "$REGION" --no-allow-unauthenticated \
  --service-account "ritme-worker@$GCP_PROJECT_ID.iam.gserviceaccount.com" --add-cloudsql-instances "$INSTANCE_CONNECTION_NAME" \
  --set-env-vars "$COMMON_ENV,ROLE=worker" --set-secrets "$SECRETS" --min-instances 0 --timeout 300
WORKER_URL="$(gcloud run services describe ritme-worker --region "$REGION" --format 'value(status.url)')"
gcloud run services add-iam-policy-binding ritme-worker --region "$REGION" \
  --member "serviceAccount:ritme-tasks-invoker@$GCP_PROJECT_ID.iam.gserviceaccount.com" --role roles/run.invoker
gcloud tasks queues describe "$QUEUE" --location "$REGION" >/dev/null 2>&1 || gcloud tasks queues create "$QUEUE" --location "$REGION"

gcloud run deploy ritme-api --image "$IMAGE" --region "$REGION" --allow-unauthenticated \
  --service-account "ritme-api@$GCP_PROJECT_ID.iam.gserviceaccount.com" --add-cloudsql-instances "$INSTANCE_CONNECTION_NAME" \
  --set-env-vars "$COMMON_ENV,ROLE=api,WORKER_URL=$WORKER_URL,ALLOWED_ORIGINS=${ALLOWED_ORIGINS:?set ALLOWED_ORIGINS (the api URL),EXTENSION_ID=${EXTENSION_ID:-}" \
  --set-secrets "$SECRETS" --min-instances "$MIN_INSTANCES"

echo "7/7 done. Verify: curl \$(gcloud run services describe ritme-api --region $REGION --format 'value(status.url)')/healthz"
