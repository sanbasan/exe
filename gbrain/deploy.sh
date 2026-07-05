#!/usr/bin/env bash
# Redeploy the GBrain router to an already-provisioned VM (see gbrain/setup.sh).
# Re-renders config from Secret Manager, copies sources, and rebuilds.
set -euo pipefail

ENVIRONMENT=prod
AUTO_YES=false

for arg in "$@"; do
  case "$arg" in
    --env=*) ENVIRONMENT="${arg#*=}" ;;
    --dev) ENVIRONMENT=dev ;;
    --prod) ENVIRONMENT=prod ;;
    -y|--yes) AUTO_YES=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_ENV="$SCRIPT_DIR/config.env"
if [ ! -f "$CONFIG_ENV" ]; then
  echo "ERROR: $CONFIG_ENV not found. Copy config.env.example to config.env and fill it in." >&2
  exit 1
fi
# shellcheck source=/dev/null
. "$CONFIG_ENV"
ZONE=asia-northeast1-b
GBRAIN_REF=${GBRAIN_REF:-master}
# Keep these defaults in sync with gbrain/setup.sh (same .env is re-rendered here).
EMBEDDING_MODEL=${GBRAIN_EMBEDDING_MODEL:-google:gemini-embedding-001}
EMBEDDING_DIMENSIONS=${GBRAIN_EMBEDDING_DIMENSIONS:-1536}
CHAT_MODEL=${GBRAIN_MODEL:-google:gemini-2.5-flash}
DEPLOY_DIR=/opt/gbrain

case "$ENVIRONMENT" in
  dev)
    : "${PROJECT_DEV:?Set PROJECT_DEV in gbrain/config.env}"
    : "${VM_NAME_DEV:?Set VM_NAME_DEV in gbrain/config.env}"
    : "${DOMAIN_DEV:?Set DOMAIN_DEV in gbrain/config.env}"
    PROJECT=$PROJECT_DEV; VM_NAME=$VM_NAME_DEV; DOMAIN=$DOMAIN_DEV ;;
  prod)
    : "${PROJECT_PROD:?Set PROJECT_PROD in gbrain/config.env}"
    : "${VM_NAME_PROD:?Set VM_NAME_PROD in gbrain/config.env}"
    : "${DOMAIN_PROD:?Set DOMAIN_PROD in gbrain/config.env}"
    PROJECT=$PROJECT_PROD; VM_NAME=$VM_NAME_PROD; DOMAIN=$DOMAIN_PROD ;;
  *) echo "ENVIRONMENT must be dev or prod." >&2; exit 1 ;;
esac

if ! gcloud auth print-access-token >/dev/null 2>&1; then
  echo "ERROR: Not logged in to gcloud." >&2
  exit 1
fi

if [ "$AUTO_YES" = false ]; then
  read -rp "Redeploy GBrain router to $VM_NAME ($PROJECT)? [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
fi

secret() { gcloud secrets versions access latest --secret="$1" --project="$PROJECT"; }

OPENAI_API_KEY=$(secret OPENAI_API_KEY)
# Same secret precedence as livekit/*.sh: GOOGLE_API_KEY first, then GEMINI_API_KEY.
GOOGLE_GENERATIVE_AI_API_KEY=$(secret GOOGLE_API_KEY 2>/dev/null || secret GEMINI_API_KEY)
INGEST_TOKEN=$(secret GBRAIN_ROUTER_INGEST_TOKEN)
ADMIN_TOKEN=$(secret GBRAIN_ROUTER_ADMIN_TOKEN)
POSTGRES_PASSWORD=$(secret GBRAIN_POSTGRES_PASSWORD)

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

cat >"$TMP_DIR/.env" <<EOF
PORT=8080
PUBLIC_BASE_URL=https://$DOMAIN
GBRAIN_ROUTER_INGEST_TOKEN=$INGEST_TOKEN
GBRAIN_ROUTER_ADMIN_TOKEN=$ADMIN_TOKEN
OPENAI_API_KEY=$OPENAI_API_KEY
GOOGLE_GENERATIVE_AI_API_KEY=$GOOGLE_GENERATIVE_AI_API_KEY
GBRAIN_MODEL=$CHAT_MODEL
GBRAIN_EMBEDDING_MODEL=$EMBEDDING_MODEL
GBRAIN_EMBEDDING_DIMENSIONS=$EMBEDDING_DIMENSIONS
GBRAIN_DATA_DIR=/data/brains
GBRAIN_REF=$GBRAIN_REF
PGHOST=postgres
PGPORT=5432
PGUSER=gbrain
PGPASSWORD=$POSTGRES_PASSWORD
EOF

cat >"$TMP_DIR/Caddyfile" <<EOF
$DOMAIN {
	reverse_proxy router:8080
}
EOF

gcloud compute scp --recurse \
  "$SCRIPT_DIR/Dockerfile" \
  "$SCRIPT_DIR/docker-compose.yml" \
  "$SCRIPT_DIR/router" \
  "$TMP_DIR/.env" \
  "$TMP_DIR/Caddyfile" \
  "$VM_NAME":$DEPLOY_DIR/ \
  --zone="$ZONE" --project="$PROJECT"

# Restart caddy explicitly: the Caddyfile is a bind mount, so `up -d` alone
# won't make a running Caddy reload a changed domain/config.
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --project="$PROJECT" \
  --command="cd $DEPLOY_DIR && sudo docker compose up -d --build && sudo docker compose restart caddy"

echo "Redeployed GBrain router to $VM_NAME."
