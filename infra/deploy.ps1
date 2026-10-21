<#
.SYNOPSIS
  Deploy Ritme Backend to Google Cloud Run with Google Cloud SQL from Windows PowerShell.
.DESCRIPTION
  This script provisions Google Cloud SQL (PostgreSQL 16), configures secrets in Secret Manager,
  builds the backend container via Cloud Build, runs Alembic migrations via Cloud Run Jobs,
  and deploys the FastAPI backend to Cloud Run with Cloud SQL integration and Vercel CORS support.
.EXAMPLE
  .\infra\deploy.ps1
  .\infra\deploy.ps1 -ProjectId "orchestration-489516" -AllowedOrigins "https://ritme-sigma.vercel.app"
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$ProjectId,

  [Parameter(Mandatory = $false)]
  [string]$AllowedOrigins,

  [Parameter(Mandatory = $false)]
  [string]$Region,

  [Parameter(Mandatory = $false)]
  [string]$SqlInstance = "ritme-db",

  [Parameter(Mandatory = $false)]
  [string]$SqlTier = "db-f1-micro",

  [Parameter(Mandatory = $false)]
  [switch]$DeployWorker
)

# Do not abort script on harmless external stderr outputs (e.g. gcloud status/progress logs)
$ErrorActionPreference = "Continue"
if (Test-Path variable:global:PSNativeCommandUseErrorActionPreference) {
  $global:PSNativeCommandUseErrorActionPreference = $false
}

# Resolve repository root
$RepoRoot = if (Test-Path (Join-Path $PSScriptRoot "..\package.json")) {
  (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} elseif (Test-Path ".\package.json") {
  (Get-Location).Path
} else {
  (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

# Auto-load environment variables from .env if present
$envFile = Join-Path $RepoRoot ".env"
if (Test-Path $envFile) {
  Write-Host "--> Reading configuration from $envFile" -ForegroundColor DarkGray
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
      $parts = $line.Split("=", 2)
      $key = $parts[0].Trim()
      $val = $parts[1].Trim().Trim('"').Trim("'")
      if (-not [System.Environment]::GetEnvironmentVariable($key)) {
        [System.Environment]::SetEnvironmentVariable($key, $val)
      }
    }
  }
}

# Fallbacks from environment
if (-not $ProjectId -and $env:GCP_PROJECT_ID) { $ProjectId = $env:GCP_PROJECT_ID }
if (-not $AllowedOrigins -and $env:ALLOWED_ORIGINS) { $AllowedOrigins = $env:ALLOWED_ORIGINS }
if (-not $Region) {
  $Region = if ($env:GCP_REGION) { $env:GCP_REGION } else { "asia-southeast2" }
}

# Check for gcloud CLI (auto-detect standard installation paths if not yet in current session PATH)
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  $candidatePaths = @(
    "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin",
    "C:\Program Files\Google\Cloud SDK\google-cloud-sdk\bin",
    "C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin"
  )
  foreach ($p in $candidatePaths) {
    if (Test-Path (Join-Path $p "gcloud.cmd")) {
      $env:Path = "$p;$env:Path"
      Write-Host "--> Detected Google Cloud SDK at $p" -ForegroundColor DarkGray
      break
    }
  }
}

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  Write-Host "`n[ERROR] Google Cloud SDK ('gcloud') is not installed or not in your PATH!" -ForegroundColor Red
  Write-Host "`nYou have two easy options to deploy:" -ForegroundColor Yellow
  Write-Host "  Option 1 (Recommended - 0 Local Setup):" -ForegroundColor Cyan
  Write-Host "    Open Google Cloud Shell in your browser: https://shell.cloud.google.com" -ForegroundColor White
  Write-Host "    Clone your repo and run: bash infra/deploy.sh`n" -ForegroundColor Gray
  Write-Host "  Option 2 (Install locally on Windows):" -ForegroundColor Cyan
  Write-Host "    Run in terminal: winget install Google.CloudSDK" -ForegroundColor White
  Write-Host "    Restart your terminal, then run: gcloud auth login" -ForegroundColor Gray
  exit 1
}

# Auto-resolve numeric Project ID to alphanumeric GCP Project ID string if needed
if ($ProjectId -match "^\d+$") {
  Write-Host "--> Detected numeric project number ($ProjectId). Resolving Project ID..." -ForegroundColor DarkGray
  $resolvedId = (& gcloud projects describe $ProjectId --format="value(projectId)" 2>$null)
  if ($resolvedId) {
    $ProjectId = $resolvedId.Trim()
    Write-Host "--> Using GCP Project ID: $ProjectId" -ForegroundColor Cyan
  }
}

# Validation checks
if (-not $ProjectId -or $ProjectId -eq "your-gcp-project-id") {
  Write-Host "`n[ERROR] Missing or placeholder GCP Project ID!" -ForegroundColor Red
  Write-Host "Please set GCP_PROJECT_ID in your .env file or pass -ProjectId 'your-id'." -ForegroundColor Yellow
  exit 1
}

if (-not $AllowedOrigins -or $AllowedOrigins -eq "https://your-frontend.vercel.app") {
  Write-Host "`n[ERROR] Missing or placeholder Vercel Allowed Origins!" -ForegroundColor Red
  Write-Host "Please set ALLOWED_ORIGINS in your .env file (e.g. https://your-project.vercel.app) or pass -AllowedOrigins." -ForegroundColor Yellow
  exit 1
}

# Normalize origins (strip trailing slashes for clean CORS comparison)
$AllowedOrigins = ($AllowedOrigins.Split(",") | ForEach-Object { $_.Trim().TrimEnd("/") }) -join ","
$PublicWebUrl = ($AllowedOrigins.Split(",")[0]).Trim()

$VertexLocation = if ($env:VERTEX_LOCATION) { $env:VERTEX_LOCATION } else { "us-central1" }
$Repo = "ritme"
$Image = "$Region-docker.pkg.dev/$ProjectId/$Repo/ritme-backend:latest"
$InstanceConnectionName = "$ProjectId`:$Region`:$SqlInstance"
$Queue = "ritme-runs"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Deploying Ritme Backend to Cloud Run & Cloud SQL" -ForegroundColor Cyan
Write-Host "Repo Root: $RepoRoot"
Write-Host "Project:   $ProjectId"
Write-Host "Region:    $Region"
Write-Host "Origin:    $AllowedOrigins"
Write-Host "========================================================" -ForegroundColor Cyan

Write-Host "--> [1/8] Enabling required GCP APIs..." -ForegroundColor Yellow
& gcloud services enable `
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
$existingInstances = @(& gcloud sql instances list --project $ProjectId --format="value(name)" 2>$null)
if ($existingInstances -notcontains $SqlInstance) {
  Write-Host "Instance $SqlInstance not found. Creating PostgreSQL 16 instance (takes 3-5 mins)..." -ForegroundColor Cyan
  & gcloud sql instances create $SqlInstance `
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
$existingDbs = @(& gcloud sql databases list --instance=$SqlInstance --project $ProjectId --format="value(name)" 2>$null)
if ($existingDbs -notcontains "ritme") {
  Write-Host "Creating database 'ritme'..."
  & gcloud sql databases create ritme --instance=$SqlInstance --project $ProjectId
} else {
  Write-Host "Database 'ritme' exists."
}

Write-Host "--> [3/8] Managing secrets in Secret Manager..." -ForegroundColor Yellow
$existingSecrets = @(& gcloud secrets list --project $ProjectId --format="value(name)" 2>$null)

# Database password secret
if ($existingSecrets -notcontains "ritme-db-password") {
  Write-Host "Creating secret 'ritme-db-password'..."
  & gcloud secrets create ritme-db-password --replication-policy=automatic --project $ProjectId
  $dbPassword = [System.Guid]::NewGuid().ToString("N") + [System.Guid]::NewGuid().ToString("N")
  $dbPassword | & gcloud secrets versions add ritme-db-password --data-file=- --project $ProjectId
  Write-Host "Creating Cloud SQL user 'ritme'..."
  & gcloud sql users create ritme --instance=$SqlInstance --password=$dbPassword --project $ProjectId
} else {
  Write-Host "Secret 'ritme-db-password' exists."
  $existingUsers = @(& gcloud sql users list --instance=$SqlInstance --project $ProjectId --format="value(name)" 2>$null)
  if ($existingUsers -notcontains "ritme") {
    Write-Host "Creating Cloud SQL user 'ritme' from existing secret..."
    $existingPw = (& gcloud secrets versions access latest --secret=ritme-db-password --project=$ProjectId).Trim()
    & gcloud sql users create ritme --instance=$SqlInstance --password=$existingPw --project $ProjectId
  }
}

# Extension token signing secret
if ($existingSecrets -notcontains "ritme-extension-token-secret") {
  Write-Host "Creating secret 'ritme-extension-token-secret'..."
  & gcloud secrets create ritme-extension-token-secret --replication-policy=automatic --project $ProjectId
  $extSecret = [System.Guid]::NewGuid().ToString("N") + [System.Guid]::NewGuid().ToString("N")
  $extSecret | & gcloud secrets versions add ritme-extension-token-secret --data-file=- --project $ProjectId
} else {
  Write-Host "Secret 'ritme-extension-token-secret' exists."
}

Write-Host "--> [4/8] Configuring IAM and Service Accounts..." -ForegroundColor Yellow
$existingSas = @(& gcloud iam service-accounts list --project $ProjectId --format="value(email)" 2>$null)
foreach ($sa in @("ritme-api", "ritme-worker", "ritme-tasks-invoker")) {
  $saEmail = "$sa@$ProjectId.iam.gserviceaccount.com"
  if ($existingSas -notcontains $saEmail) {
    & gcloud iam service-accounts create $sa --project $ProjectId --display-name="Ritme $sa"
  }
}

function Bind-Role($saName, $role) {
  & gcloud projects add-iam-policy-binding $ProjectId `
    --member "serviceAccount:$saName@$ProjectId.iam.gserviceaccount.com" `
    --role $role --condition=None *> $null
}

Bind-Role "ritme-api" "roles/cloudsql.client"
Bind-Role "ritme-api" "roles/aiplatform.user"
Bind-Role "ritme-api" "roles/cloudtasks.enqueuer"
Bind-Role "ritme-worker" "roles/cloudsql.client"
Bind-Role "ritme-worker" "roles/aiplatform.user"

# Grant ritme-api permission to act as ritme-tasks-invoker
& gcloud iam service-accounts add-iam-policy-binding "ritme-tasks-invoker@$ProjectId.iam.gserviceaccount.com" `
  --member "serviceAccount:ritme-api@$ProjectId.iam.gserviceaccount.com" `
  --role roles/iam.serviceAccountUser --project $ProjectId *> $null

# Secret Manager access
foreach ($s in @("ritme-db-password", "ritme-extension-token-secret")) {
  foreach ($sa in @("ritme-api", "ritme-worker")) {
    & gcloud secrets add-iam-policy-binding $s `
      --member "serviceAccount:$sa@$ProjectId.iam.gserviceaccount.com" `
      --role roles/secretmanager.secretAccessor --project $ProjectId *> $null
  }
}

Write-Host "--> [5/8] Building backend container image via Cloud Build..." -ForegroundColor Yellow
$existingRepos = @(& gcloud artifacts repositories list --location $Region --project $ProjectId --format="value(name)" 2>$null)
$repoMatches = $existingRepos | Where-Object { $_ -match "(?:/repositories/|^)$Repo$" }
if (-not $repoMatches) {
  Write-Host "Creating Artifact Registry repository '$Repo' in $Region..."
  & gcloud artifacts repositories create $Repo --repository-format=docker --location $Region --project $ProjectId
}

Push-Location $RepoRoot
try {
  & gcloud builds submit `
    --config "infra/cloudbuild.yaml" `
    --substitutions "_IMAGE=$Image,_DOCKERFILE=infra/Dockerfile.backend" `
    --project $ProjectId .
} finally {
  Pop-Location
}

$CommonEnv = "ENVIRONMENT=production,GCP_PROJECT_ID=$ProjectId,GCP_REGION=$Region,VERTEX_LOCATION=$VertexLocation,LLM_PROVIDER=vertex,INSTANCE_CONNECTION_NAME=$InstanceConnectionName,DB_NAME=ritme,DB_USER=ritme,FIREBASE_PROJECT_ID=$ProjectId"
$Secrets = "DB_PASSWORD=ritme-db-password:latest,EXTENSION_TOKEN_SECRET=ritme-extension-token-secret:latest"

Write-Host "--> [6/8] Running database migrations (Cloud Run Job: ritme-migrate)..." -ForegroundColor Yellow
& gcloud run jobs deploy ritme-migrate `
  --image $Image `
  --region $Region `
  --project $ProjectId `
  --service-account "ritme-api@$ProjectId.iam.gserviceaccount.com" `
  --set-cloudsql-instances $InstanceConnectionName `
  --set-env-vars $CommonEnv `
  --set-secrets $Secrets `
  --command alembic --args upgrade,head

& gcloud run jobs execute ritme-migrate --region $Region --project $ProjectId --wait

Write-Host "--> [7/8] Deploying Cloud Run API service..." -ForegroundColor Yellow
$workerUrl = ""
$queueMode = "local"

if ($DeployWorker) {
  Write-Host "Deploying private worker service..."
  & gcloud run deploy ritme-worker `
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

  $workerUrl = (& gcloud run services describe ritme-worker --region $Region --project $ProjectId --format "value(status.url)").Trim()
  & gcloud run services add-iam-policy-binding ritme-worker --region $Region --project $ProjectId `
    --member "serviceAccount:ritme-tasks-invoker@$ProjectId.iam.gserviceaccount.com" --role roles/run.invoker

  $existingQueues = @(& gcloud tasks queues list --location $Region --project $ProjectId --format="value(name)" 2>$null)
  $queueMatches = $existingQueues | Where-Object { $_ -match "(?:/queues/|^)$Queue$" }
  if (-not $queueMatches) {
    & gcloud tasks queues create $Queue --location $Region --project $ProjectId
  }
  $queueMode = "cloudtasks"
}

$extensionId = if ($env:EXTENSION_ID) { $env:EXTENSION_ID } else { "" }

& gcloud run deploy ritme-api `
  --image $Image `
  --region $Region `
  --project $ProjectId `
  --allow-unauthenticated `
  --service-account "ritme-api@$ProjectId.iam.gserviceaccount.com" `
  --add-cloudsql-instances $InstanceConnectionName `
  --set-env-vars "$CommonEnv,ROLE=api,RUN_QUEUE=$queueMode,CLOUD_TASKS_QUEUE=$Queue,WORKER_URL=$workerUrl,ALLOWED_ORIGINS=$AllowedOrigins,PUBLIC_WEB_URL=$PublicWebUrl,EXTENSION_ID=$extensionId" `
  --set-secrets $Secrets `
  --min-instances 0

$ApiUrl = (& gcloud run services describe ritme-api --region $Region --project $ProjectId --format "value(status.url)").Trim()

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
