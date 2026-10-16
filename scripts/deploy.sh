#!/usr/bin/env bash
set -euo pipefail

# Invoke explicitly after review. This script creates demo GCP resources.
# API keys are sent to Secret Manager on stdin, never as command arguments.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ -n "${1:-}" ]]; then
  set -a
  source "$1"
  set +a
fi
: "${GOOGLE_CLOUD_PROJECT:?Set GOOGLE_CLOUD_PROJECT to the approved event project.}"
: "${GEMINI_API_KEY:?Load the event GEMINI_API_KEY in the environment.}"
command -v gcloud >/dev/null || { printf 'Install the official Google Cloud CLI and authenticate with the event project account.\n' >&2; exit 1; }

PROJECT="$GOOGLE_CLOUD_PROJECT"
REGION="${GOOGLE_CLOUD_REGION:-asia-northeast3}"
BUCKET="${GCS_BUCKET:-$PROJECT-kioskproof-evidence}"
ACCOUNT="kioskproof-runtime@$PROJECT.iam.gserviceaccount.com"
REVISION="$(git rev-parse --short HEAD)"
IMAGE="$REGION-docker.pkg.dev/$PROJECT/kioskproof/app:$REVISION"

gcloud projects describe "$PROJECT" --format='value(projectId)'
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com storage.googleapis.com iam.googleapis.com --project="$PROJECT"

if ! gcloud artifacts repositories describe kioskproof --location="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud artifacts repositories create kioskproof --repository-format=docker --location="$REGION" --project="$PROJECT"
fi
if ! gcloud storage buckets describe "gs://$BUCKET" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access --project="$PROJECT"
fi
if ! gcloud iam service-accounts describe "$ACCOUNT" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create kioskproof-runtime --display-name="KioskProof demo runtime" --project="$PROJECT"
fi
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$ACCOUNT" --role=roles/storage.objectAdmin --project="$PROJECT"
if gcloud secrets describe kioskproof-gemini --project="$PROJECT" >/dev/null 2>&1; then
  printf '%s' "$GEMINI_API_KEY" | gcloud secrets versions add kioskproof-gemini --data-file=- --project="$PROJECT"
else
  printf '%s' "$GEMINI_API_KEY" | gcloud secrets create kioskproof-gemini --data-file=- --replication-policy=automatic --project="$PROJECT"
fi
gcloud secrets add-iam-policy-binding kioskproof-gemini --member="serviceAccount:$ACCOUNT" --role=roles/secretmanager.secretAccessor --project="$PROJECT"

gcloud builds submit --config=cloudbuild.yaml --substitutions="_REGION=$REGION,_REVISION=$REVISION" --project="$PROJECT" .
gcloud run deploy kioskproof --image="$IMAGE" --project="$PROJECT" --region="$REGION" \
  --service-account="$ACCOUNT" --execution-environment=gen2 --cpu=2 --memory=4Gi \
  --min-instances=1 --max-instances=1 --concurrency=8 --timeout=300 \
  --no-cpu-throttling --session-affinity --allow-unauthenticated \
  --set-env-vars="GEMINI_MODEL=gemini-4-argon,GOOGLE_CLOUD_PROJECT=$PROJECT,GOOGLE_CLOUD_REGION=$REGION,GCS_BUCKET=$BUCKET" \
  --set-secrets="GEMINI_API_KEY=kioskproof-gemini:latest"
URL="$(gcloud run services describe kioskproof --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
printf 'KIOSKPROOF_CLOUD_URL %s\n' "$URL"
curl --fail --silent --show-error "$URL/healthz"
printf '\nExport evidence before the temporary event project is removed:\n'
printf 'gcloud storage rsync --recursive gs://%s .kioskproof/cloud-backup --project=%s\n' "$BUCKET" "$PROJECT"
