<#
.SYNOPSIS
  Deploy Ritme Backend to Google Cloud Run with Google Cloud SQL from Windows PowerShell.
.DESCRIPTION
  This script provisions Google Cloud SQL (PostgreSQL 16), configures secrets in Secret Manager,
  builds the backend container via Cloud Build, runs Alembic migrations via Cloud Run Jobs,
  and deploys the FastAPI backend to Cloud Run with Cloud SQL integration and Vercel CORS support.
.EXAMPLE
  $env:GCP_PROJECT_ID = "your-gcp-project"
  $env:ALLOWED_ORIGINS = "https://your-app.vercel.app"
  .\infra\deploy.ps1
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$ProjectId = $env:GCP_PROJECT_ID,

  [Parameter(Mandatory = $false)]
  [string]$AllowedOrigins = $env:ALLOWED_ORIGINS,

  [Parameter(Mandatory = $false)]
  [string]$Region = $env:GCP_REGION,

  [Parameter(Mandatory = $false)]
  [string]$SqlInstance = "ritme-db",

  [Parameter(Mandatory = $false)]
  [string]$SqlTier = "db-f1-micro",

  [Parameter(Mandatory = $false)]
  [switch]$DeployWorker
)

$ErrorActionPreference = "Stop"

if (-not $ProjectId) {
  Write-Error "Please specify -ProjectId or set `$env:GCP_PROJECT_ID."
  exit 1
}

if (-not $AllowedOrigins) {
  Write-Error "Please specify -AllowedOrigins (e.g. https://your-app.vercel.app) or set `$env:ALLOWED_ORIGINS."
  exit 1
}

if (-not $Region) { $Region = "asia-southeast2" }
$VertexLocation = if ($env:VERTEX_LOCATION) { $env:VERTEX_LOCATION } else { "us-central1" }
$Repo = "ritme"
$Image = "$Region-docker.pkg.dev/$ProjectId/$Repo/ritme-backend:latest"
$InstanceConnectionName = "$ProjectId`:$Region`:$SqlInstance"
$Queue = "ritme-runs"
$PublicWebUrl = $AllowedOrigins

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Deploying Ritme Backend to Cloud Run & Cloud SQL" -ForegroundColor Cyan
Write-Host "Project: $ProjectId"
Write-Host "Region:  $Region"
Write-Host "Origin:  $AllowedOrigins"
Write-Host "========================================================" -ForegroundColor Cyan

Write-Host "--> [1/8] Enabling required GCP APIs..." -ForegroundColor Yellow
gcloud services enable `
  run.googleapis.com `
  sqladmin.googleapis.com `
  artifactregistry.googleapis.com `
  cloudbuild.googleapis.com `
  cloudtasks.googleapis.com `
  secretmanager.googleapis.com `
  aiplatform.googleapis.com `
  identitytoolkit.googleapis.com `
  --project $ProjectId

Write-Host "--> [2/8] Provisioning Cloud SQL PostgreSQL ($SqlInstance)..." -ForegroundColor Yellow
$instanceCheck = gcloud sql instances describe $SqlInstance --project $ProjectId 2>$null
if (-not $instanceCheck) {
  Write-Host "Instance $SqlInstance not found. Creating PostgreSQL 16 instance (takes 3-5 mins)..." -ForegroundColor Cyan
  gcloud sql instances create $SqlInstance `
    --project $ProjectId `
    --database-version=POSTGRES_16 `
    --tier=$SqlTier `
    --region=$Region `
    --storage-type=SSD `
    --storage-size=10GB `
    --edition=ENTERPRISE
} else {
  Write-Host "Cloud SQL instance $SqlInstance exists."
}

# Ensure database 'ritme' exists
$dbCheck = gcloud sql databases describe ritme --instance=$SqlInstance --project $ProjectId 2>$null
if (-not $dbCheck) {
  Write-Host "Creating database 'ritme'..."
  gcloud sql databases create ritme --instance=$SqlInstance --project $ProjectId
}

Write-Host "--> [3/8] Managing secrets in Secret Manager..." -ForegroundColor Yellow
# Database password secret
$pwSecretCheck = gcloud secrets describe ritme-db-password --project $ProjectId 2>$null
if (-not $pwSecretCheck) {
  Write-Host "Creating secret 'ritme-db-password'..."
  gcloud secrets create ritme-db-password --replication-policy=automatic --project $ProjectId
  $dbPassword = [System.Guid]::NewGuid().ToString("N") + [System.Guid]::NewGuid().ToString("N")
  $dbPassword | gcloud secrets versions add ritme-db-password --data-file=- --project $ProjectId
  Write-Host "Creating Cloud SQL user 'ritme'..."
  gcloud sql users create ritme --instance=$SqlInstance --password=$dbPassword --project $ProjectId
} else {
  Write-Host "Secret 'ritme-db-password' exists."
  $existingUsers = gcloud sql users list --instance=$SqlInstance --project $ProjectId --format="value(name)"
  if ($existingUsers -notmatch "(?m)^ritme$") {
    Write-Host "Creating Cloud SQL user 'ritme' from existing secret..."
    $existingPw = gcloud secrets versions access latest --secret=ritme-db-password --project=$ProjectId
    gcloud sql users create ritme --instance=$SqlInstance --password=$existingPw --project $ProjectId
  }
}

# Extension token signing secret
$extSecretCheck = gcloud secrets describe ritme-extension-token-secret --project $ProjectId 2>$null
if (-not $extSecretCheck) {
  Write-Host "Creating secret 'ritme-extension-token-secret'..."
  gcloud secrets create ritme-extension-token-secret --replication-policy=automatic --project $ProjectId
  $extSecret = [System.Guid]::NewGuid().ToString("N") + [System.Guid]::NewGuid().ToString("N")
  $extSecret | gcloud secrets versions add ritme-extension-token-secret --data-file=- --project $ProjectId
} else {
  Write-Host "Secret 'ritme-extension-token-secret' exists."
}

Write-Host "--> [4/8] Configuring IAM and Service Accounts..." -ForegroundColor Yellow
foreach ($sa in @("ritme-api", "ritme-worker", "ritme-tasks-invoker")) {
  $saCheck = gcloud iam service-accounts describe "$sa@$ProjectId.iam.gserviceaccount.com" --project $ProjectId 2>$null
  if (-not $saCheck) {
    gcloud iam service-accounts create $sa --project $ProjectId --display-name="Ritme $sa"
  }
}

function Bind-Role($saName, $role) {
  gcloud projects add-iam-policy-binding $ProjectId `
    --member "serviceAccount:$saName@$ProjectId.iam.gserviceaccount.com" `
    --role $role --condition=None *> $null
}

Bind-Role "ritme-api" "roles/cloudsql.client"
Bind-Role "ritme-api" "roles/aiplatform.user"
Bind-Role "ritme-api" "roles/cloudtasks.enqueuer"
Bind-Role "ritme-worker" "roles/cloudsql.client"
Bind-Role "ritme-worker" "roles/aiplatform.user"

# Grant ritme-api permission to act as ritme-tasks-invoker
gcloud iam service-accounts add-iam-policy-binding "ritme-tasks-invoker@$ProjectId.iam.gserviceaccount.com" `
  --member "serviceAccount:ritme-api@$ProjectId.iam.gserviceaccount.com" `
  --role roles/iam.serviceAccountUser --project $ProjectId *> $null

# Secret Manager access
foreach ($s in @("ritme-db-password", "ritme-extension-token-secret")) {
  foreach ($sa in @("ritme-api", "ritme-worker")) {
    gcloud secrets add-iam-policy-binding $s `
      --member "serviceAccount:$sa@$ProjectId.iam.gserviceaccount.com" `
      --role roles/secretmanager.secretAccessor --project $ProjectId *> $null
  }
}

Write-Host "--> [5/8] Building backend container image via Cloud Build..." -ForegroundColor Yellow
$arCheck = gcloud artifacts repositories describe $Repo --location $Region --project $ProjectId 2>$null
if (-not $arCheck) {
  gcloud artifacts repositories create $Repo --repository-format=docker --location $Region --project $ProjectId
}

gcloud builds submit --tag $Image `
  --config infra/cloudbuild.yaml `
  --substitutions "_IMAGE=$Image,_DOCKERFILE=infra/Dockerfile.backend" `
  --project $ProjectId .

$CommonEnv = "ENVIRONMENT=production,GCP_PROJECT_ID=$ProjectId,GCP_REGION=$Region,VERTEX_LOCATION=$VertexLocation,LLM_PROVIDER=vertex,INSTANCE_CONNECTION_NAME=$InstanceConnectionName,DB_NAME=ritme,DB_USER=ritme,FIREBASE_PROJECT_ID=$ProjectId"
$Secrets = "DB_PASSWORD=ritme-db-password:latest,EXTENSION_TOKEN_SECRET=ritme-extension-token-secret:latest"

Write-Host "--> [6/8] Running database migrations (Cloud Run Job: ritme-migrate)..." -ForegroundColor Yellow
gcloud run jobs deploy ritme-migrate `
  --image $Image `
  --region $Region `
  --project $ProjectId `
  --service-account "ritme-api@$ProjectId.iam.gserviceaccount.com" `
  --set-cloudsql-instances $InstanceConnectionName `
  --set-env-vars $CommonEnv `
  --set-secrets $Secrets `
  --command alembic --args upgrade,head

gcloud run jobs execute ritme-migrate --region $Region --project $ProjectId --wait

Write-Host "--> [7/8] Deploying Cloud Run API service..." -ForegroundColor Yellow
$workerUrl = ""
$queueMode = "local"

if ($DeployWorker) {
  Write-Host "Deploying private worker service..."
  gcloud run deploy ritme-worker `
    --image $Image `
    --region $Region `
    --project $ProjectId `
    --no-allow-unauthenticated `
    --service-account "ritme-worker@$ProjectId.iam.gserviceaccount.com" `
    --add-cloudsql-instances $InstanceConnectionName `
    --set-env-vars "$CommonEnv,ROLE=worker" `
    --set-secrets $Secrets `
    --min-instances 0 `
    --timeout 300

  $workerUrl = (gcloud run services describe ritme-worker --region $Region --project $ProjectId --format "value(status.url)").Trim()
  gcloud run services add-iam-policy-binding ritme-worker --region $Region --project $ProjectId `
    --member "serviceAccount:ritme-tasks-invoker@$ProjectId.iam.gserviceaccount.com" --role roles/run.invoker

  $qCheck = gcloud tasks queues describe $Queue --location $Region --project $ProjectId 2>$null
  if (-not $qCheck) {
    gcloud tasks queues create $Queue --location $Region --project $ProjectId
  }
  $queueMode = "cloudtasks"
}

gcloud run deploy ritme-api `
  --image $Image `
  --region $Region `
  --project $ProjectId `
  --allow-unauthenticated `
  --service-account "ritme-api@$ProjectId.iam.gserviceaccount.com" `
  --add-cloudsql-instances $InstanceConnectionName `
  --set-env-vars "$CommonEnv,ROLE=api,RUN_QUEUE=$queueMode,CLOUD_TASKS_QUEUE=$Queue,WORKER_URL=$workerUrl,ALLOWED_ORIGINS=$AllowedOrigins,PUBLIC_WEB_URL=$PublicWebUrl" `
  --set-secrets $Secrets `
  --min-instances 0

$ApiUrl = (gcloud run services describe ritme-api --region $Region --project $ProjectId --format "value(status.url)").Trim()

Write-Host "========================================================" -ForegroundColor Green
Write-Host "--> [8/8] Deployment successful!" -ForegroundColor Green
Write-Host "Cloud Run API URL: $ApiUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps for your Vercel frontend:" -ForegroundColor Yellow
Write-Host "1. In Vercel Project Settings -> Environment Variables, set:"
Write-Host "   VITE_API_BASE_URL = $ApiUrl" -ForegroundColor Cyan
Write-Host "2. In Firebase Console (Authentication -> Settings -> Authorized Domains):"
Write-Host "   Ensure your Vercel domain ($AllowedOrigins) is added."
Write-Host "3. Redeploy your frontend on Vercel to pick up the new API URL."
Write-Host "========================================================" -ForegroundColor Green
