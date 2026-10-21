#!/usr/bin/env bash
# Deploy Ritme Backend to Google Cloud Run with Google Cloud SQL (PostgreSQL).
# Frontend is hosted on Vercel; this script provisions and deploys the backend services.
# Usage:
#   export GCP_PROJECT_ID="your-project-id"
#   export ALLOWED_ORIGINS="https://your-app.vercel.app"
#   bash infra/deploy.sh
set -euo pipefail

: "${GCP_PROJECT_ID:?Error: Set GCP_PROJECT_ID before running this script}"
: "${ALLOWED_ORIGINS:?Error: Set ALLOWED_ORIGINS (e.g. https://your-app.vercel.app) before running this script}"

REGION="${GCP_REGION:-asia-southeast2}"
VERTEX_LOCATION="${VERTEX_LOCATION:-us-central1}"
REPO="${AR_REPO:-ritme}"
IMAGE="${REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${REPO}/ritme-backend:${IMAGE_TAG:-latest}"
SQL_INSTANCE="${SQL_INSTANCE:-ritme-db}"
SQL_TIER="${SQL_TIER:-db-f1-micro}"   # cost-effective tier; upgrade to db-custom-1-3840 for heavy workloads
INSTANCE_CONNECTION_NAME="${GCP_PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
QUEUE="${CLOUD_TASKS_QUEUE:-ritme-runs}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"   # set to 1 before a scheduled demo to avoid cold starts
DEPLOY_WORKER="${DEPLOY_WORKER:-false}" # true to deploy private worker + Cloud Tasks; false for simple in-process queue
PUBLIC_WEB_URL="${PUBLIC_WEB_URL:-$ALLOWED_ORIGINS}"

echo "========================================================"
echo "Deploying Ritme Backend to Cloud Run & Cloud SQL"
echo "Project: $GCP_PROJECT_ID"
echo "Region:  $REGION"
echo "Origin:  $ALLOWED_ORIGINS"
echo "========================================================"

echo "--> [1/8] Enabling required GCP APIs..."
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  cloudtasks.googleapis.com \
  secretmanager.googleapis.com \
  aiplatform.googleapis.com \
  identitytoolkit.googleapis.com \
  --project "$GCP_PROJECT_ID"

echo "--> [2/8] Provisioning Cloud SQL PostgreSQL ($SQL_INSTANCE)..."
if ! gcloud sql instances describe "$SQL_INSTANCE" --project "$GCP_PROJECT_ID" >/dev/null 2>&1; then
  echo "Instance $SQL_INSTANCE not found. Creating PostgreSQL 16 instance (takes 3-5 mins)..."
  gcloud sql instances create "$SQL_INSTANCE" \
    --project "$GCP_PROJECT_ID" \
    --database-version=POSTGRES_16 \
    --tier="$SQL_TIER" \
    --region="$REGION" \
    --storage-type=SSD \
    --storage-size=10GB \
    --edition=ENTERPRISE
else
  echo "Cloud SQL instance $SQL_INSTANCE exists."
fi

# Ensure database 'ritme' exists
if ! gcloud sql databases describe ritme --instance="$SQL_INSTANCE" --project "$GCP_PROJECT_ID" >/dev/null 2>&1; then
  echo "Creating database 'ritme'..."
  gcloud sql databases create ritme --instance="$SQL_INSTANCE" --project "$GCP_PROJECT_ID"
fi

echo "--> [3/8] Managing secrets in Secret Manager..."
# Database password secret
if ! gcloud secrets describe ritme-db-password --project "$GCP_PROJECT_ID" >/dev/null 2>&1; then
  echo "Generating secure DB password and creating secret 'ritme-db-password'..."
  gcloud secrets create ritme-db-password --replication-policy=automatic --project "$GCP_PROJECT_ID"
  DB_PW="$(openssl rand -hex 16 2>/dev/null || python3 -c 'import secrets; print(secrets.token_hex(16))')"
  printf "%s" "$DB_PW" | gcloud secrets versions add ritme-db-password --data-file=- --project "$GCP_PROJECT_ID"
  echo "Creating Cloud SQL user 'ritme'..."
  gcloud sql users create ritme --instance="$SQL_INSTANCE" --password="$DB_PW" --project "$GCP_PROJECT_ID"
else
  echo "Secret 'ritme-db-password' exists."
  # Ensure user 'ritme' exists
  if ! gcloud sql users list --instance="$SQL_INSTANCE" --project "$GCP_PROJECT_ID" --format="value(name)" | grep -w "^ritme$" >/dev/null 2>&1; then
    echo "Creating Cloud SQL user 'ritme' from existing secret..."
    EXISTING_PW="$(gcloud secrets versions access latest --secret=ritme-db-password --project="$GCP_PROJECT_ID")"
    gcloud sql users create ritme --instance="$SQL_INSTANCE" --password="$EXISTING_PW" --project "$GCP_PROJECT_ID"
  fi
fi

# Extension token signing secret
if ! gcloud secrets describe ritme-extension-token-secret --project "$GCP_PROJECT_ID" >/dev/null 2>&1; then
  echo "Generating signing key for 'ritme-extension-token-secret'..."
  gcloud secrets create ritme-extension-token-secret --replication-policy=automatic --project "$GCP_PROJECT_ID"
  EXT_SECRET="$(openssl rand -hex 32 2>/dev/null || python3 -c 'import secrets; print(secrets.token_hex(32))')"
  printf "%s" "$EXT_SECRET" | gcloud secrets versions add ritme-extension-token-secret --data-file=- --project "$GCP_PROJECT_ID"
else
  echo "Secret 'ritme-extension-token-secret' exists."
fi

echo "--> [4/8] Configuring IAM and Service Accounts..."
for sa in ritme-api ritme-worker ritme-tasks-invoker; do
  gcloud iam service-accounts describe "$sa@$GCP_PROJECT_ID.iam.gserviceaccount.com" --project "$GCP_PROJECT_ID" >/dev/null 2>&1 \
    || gcloud iam service-accounts create "$sa" --project "$GCP_PROJECT_ID" --display-name="Ritme $sa"
done

bind() {
  gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
    --member "serviceAccount:$1@$GCP_PROJECT_ID.iam.gserviceaccount.com" \
    --role "$2" --condition=None >/dev/null
}

bind ritme-api roles/cloudsql.client
bind ritme-api roles/aiplatform.user
bind ritme-api roles/cloudtasks.enqueuer

bind ritme-worker roles/cloudsql.client
bind ritme-worker roles/aiplatform.user

# Grant ritme-api permission to act as ritme-tasks-invoker when creating tasks
gcloud iam service-accounts add-iam-policy-binding "ritme-tasks-invoker@$GCP_PROJECT_ID.iam.gserviceaccount.com" \
  --member "serviceAccount:ritme-api@$GCP_PROJECT_ID.iam.gserviceaccount.com" \
  --role roles/iam.serviceAccountUser --project "$GCP_PROJECT_ID" >/dev/null 2>&1 || true

# Grant Secret Manager accessor to the service accounts for the two secrets
for s in ritme-db-password ritme-extension-token-secret; do
  for sa in ritme-api ritme-worker; do
    gcloud secrets add-iam-policy-binding "$s" \
      --member "serviceAccount:$sa@$GCP_PROJECT_ID.iam.gserviceaccount.com" \
      --role roles/secretmanager.secretAccessor --project "$GCP_PROJECT_ID" >/dev/null
  done
done

echo "--> [5/8] Building backend container image via Cloud Build..."
gcloud artifacts repositories describe "$REPO" --location "$REGION" --project "$GCP_PROJECT_ID" >/dev/null 2>&1 \
  || gcloud artifacts repositories create "$REPO" --repository-format=docker --location "$REGION" --project "$GCP_PROJECT_ID"

gcloud builds submit \
  --config infra/cloudbuild.yaml \
  --substitutions "_IMAGE=$IMAGE,_DOCKERFILE=infra/Dockerfile.backend" \
  --project "$GCP_PROJECT_ID" .

COMMON_ENV="ENVIRONMENT=production,GCP_PROJECT_ID=$GCP_PROJECT_ID,GCP_REGION=$REGION,VERTEX_LOCATION=$VERTEX_LOCATION,LLM_PROVIDER=vertex,INSTANCE_CONNECTION_NAME=$INSTANCE_CONNECTION_NAME,DB_NAME=ritme,DB_USER=ritme,FIREBASE_PROJECT_ID=$GCP_PROJECT_ID"
SECRETS="DB_PASSWORD=ritme-db-password:latest,EXTENSION_TOKEN_SECRET=ritme-extension-token-secret:latest"

echo "--> [6/8] Running database migrations (Cloud Run Job: ritme-migrate)..."
gcloud run jobs deploy ritme-migrate \
  --image "$IMAGE" \
  --region "$REGION" \
  --project "$GCP_PROJECT_ID" \
  --service-account "ritme-api@$GCP_PROJECT_ID.iam.gserviceaccount.com" \
  --set-cloudsql-instances "$INSTANCE_CONNECTION_NAME" \
  --set-env-vars "$COMMON_ENV" \
  --set-secrets "$SECRETS" \
  --command "sh" --args "-c,alembic upgrade head"

gcloud run jobs execute ritme-migrate --region "$REGION" --project "$GCP_PROJECT_ID" --wait

echo "--> [7/8] Deploying Cloud Run API service..."
WORKER_URL=""
QUEUE_MODE="local"

if [ "$DEPLOY_WORKER" = "true" ]; then
  echo "Deploying private worker service..."
  gcloud run deploy ritme-worker \
    --image "$IMAGE" \
    --region "$REGION" \
    --project "$GCP_PROJECT_ID" \
    --no-allow-unauthenticated \
    --service-account "ritme-worker@$GCP_PROJECT_ID.iam.gserviceaccount.com" \
    --add-cloudsql-instances "$INSTANCE_CONNECTION_NAME" \
    --set-env-vars "$COMMON_ENV,ROLE=worker" \
    --set-secrets "$SECRETS" \
    --min-instances 0 \
    --timeout 300

  WORKER_URL="$(gcloud run services describe ritme-worker --region "$REGION" --project "$GCP_PROJECT_ID" --format 'value(status.url)')"
  gcloud run services add-iam-policy-binding ritme-worker --region "$REGION" --project "$GCP_PROJECT_ID" \
    --member "serviceAccount:ritme-tasks-invoker@$GCP_PROJECT_ID.iam.gserviceaccount.com" --role roles/run.invoker

  gcloud tasks queues describe "$QUEUE" --location "$REGION" --project "$GCP_PROJECT_ID" >/dev/null 2>&1 \
    || gcloud tasks queues create "$QUEUE" --location "$REGION" --project "$GCP_PROJECT_ID"

  QUEUE_MODE="cloudtasks"
fi

gcloud run deploy ritme-api \
  --image "$IMAGE" \
  --region "$REGION" \
  --project "$GCP_PROJECT_ID" \
  --allow-unauthenticated \
  --service-account "ritme-api@$GCP_PROJECT_ID.iam.gserviceaccount.com" \
  --add-cloudsql-instances "$INSTANCE_CONNECTION_NAME" \
  --set-env-vars "$COMMON_ENV,ROLE=api,RUN_QUEUE=$QUEUE_MODE,CLOUD_TASKS_QUEUE=$QUEUE,WORKER_URL=$WORKER_URL,ALLOWED_ORIGINS=$ALLOWED_ORIGINS,PUBLIC_WEB_URL=$PUBLIC_WEB_URL,EXTENSION_ID=${EXTENSION_ID:-}" \
  --set-secrets "$SECRETS" \
  --min-instances "$MIN_INSTANCES"

API_URL="$(gcloud run services describe ritme-api --region "$REGION" --project "$GCP_PROJECT_ID" --format 'value(status.url)')"

echo "========================================================"
echo "--> [8/8] Deployment successful!"
echo "Cloud Run API URL: $API_URL"
echo ""
echo "Next steps for your Vercel frontend:"
echo "1. In Vercel Project Settings -> Environment Variables, set:"
echo "   VITE_API_BASE_URL = $API_URL"
echo "2. In Firebase Console (Authentication -> Settings -> Authorized Domains):"
echo "   Ensure your Vercel domain ($ALLOWED_ORIGINS) is added."
echo "3. Redeploy your frontend on Vercel to pick up the new API URL."
echo "========================================================"
