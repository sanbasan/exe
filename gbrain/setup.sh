#!/usr/bin/env bash
# Provision the self-hosted GBrain VM (multi-tenant router + Postgres +
# Caddy via Docker Compose). Mirrors livekit/setup.sh.
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
SA_NAME=${SA_NAME:-exe-gbrain}
REGION=asia-northeast1
ZONE=asia-northeast1-b
MACHINE_TYPE=${MACHINE_TYPE:-e2-standard-2}
BOOT_DISK_SIZE=${BOOT_DISK_SIZE:-30GB}
GBRAIN_REF=${GBRAIN_REF:-master}
# LLM/embedding provider is Google (Gemini) to keep backends on Google Cloud.
# gemini-embedding-001 at 1536 dims stays column-compatible with the previous
# openai:text-embedding-3-small brains (both vector(1536)); after switching an
# existing brain, re-embed with `gbrain embed --all` (see gbrain/README.md).
EMBEDDING_MODEL=${GBRAIN_EMBEDDING_MODEL:-google:gemini-embedding-001}
EMBEDDING_DIMENSIONS=${GBRAIN_EMBEDDING_DIMENSIONS:-1536}
# Chat model powers facts extraction / think / dream in every workspace brain.
CHAT_MODEL=${GBRAIN_MODEL:-google:gemini-2.5-flash}
DEPLOY_DIR=/opt/gbrain

case "$ENVIRONMENT" in
  dev)
    : "${PROJECT_DEV:?Set PROJECT_DEV in gbrain/config.env}"
    : "${VM_NAME_DEV:?Set VM_NAME_DEV in gbrain/config.env}"
    : "${DOMAIN_DEV:?Set DOMAIN_DEV in gbrain/config.env}"
    PROJECT=$PROJECT_DEV
    VM_NAME=$VM_NAME_DEV
    DOMAIN=$DOMAIN_DEV
    ;;
  prod)
    : "${PROJECT_PROD:?Set PROJECT_PROD in gbrain/config.env}"
    : "${VM_NAME_PROD:?Set VM_NAME_PROD in gbrain/config.env}"
    : "${DOMAIN_PROD:?Set DOMAIN_PROD in gbrain/config.env}"
    PROJECT=$PROJECT_PROD
    VM_NAME=$VM_NAME_PROD
    DOMAIN=$DOMAIN_PROD
    ;;
  *)
    echo "ENVIRONMENT must be dev or prod." >&2; exit 1 ;;
esac

SA_EMAIL="$SA_NAME@$PROJECT.iam.gserviceaccount.com"

if ! gcloud auth print-access-token >/dev/null 2>&1; then
  echo "ERROR: Not logged in to gcloud." >&2
  exit 1
fi

# Create a Secret Manager secret with a random value if it doesn't exist yet;
# always print the current value. Lets re-runs reuse the same tokens so the
# agent's GBRAIN_INGEST_TOKEN keeps matching.
ensure_random_secret() {
  local name="$1"
  if gcloud secrets describe "$name" --project="$PROJECT" >/dev/null 2>&1; then
    gcloud secrets versions access latest --secret="$name" --project="$PROJECT"
  else
    local val
    val="$(openssl rand -hex 32)"
    printf '%s' "$val" | gcloud secrets create "$name" \
      --project="$PROJECT" --replication-policy=automatic --data-file=- >/dev/null
    printf '%s' "$val"
  fi
}

echo "========================================="
echo "  Environment : $ENVIRONMENT"
echo "  Project     : $PROJECT"
echo "  VM          : $VM_NAME ($ZONE)"
echo "  Domain      : $DOMAIN"
echo "  GBrain ref  : $GBRAIN_REF"
echo "========================================="

if [ "$AUTO_YES" = false ]; then
  read -rp "Provision this GBrain VM? [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
fi

echo "=== 1. Enable required APIs ==="
gcloud services enable \
  compute.googleapis.com \
  iam.googleapis.com \
  secretmanager.googleapis.com \
  --project="$PROJECT"

echo "=== 2. Service account ==="
if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" \
    --project="$PROJECT" --display-name="exe GBrain VM"
fi
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/logging.logWriter" --quiet >/dev/null

echo "=== 3. Reserve static external IP ==="
if ! gcloud compute addresses describe "$VM_NAME" --region="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute addresses create "$VM_NAME" --region="$REGION" --project="$PROJECT"
fi
STATIC_IP=$(gcloud compute addresses describe "$VM_NAME" --region="$REGION" --project="$PROJECT" --format='value(address)')
echo "Static IP: $STATIC_IP"

echo "=== 4. Firewall (HTTP/HTTPS) ==="
if ! gcloud compute firewall-rules describe allow-gbrain-web --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute firewall-rules create allow-gbrain-web \
    --project="$PROJECT" --direction=INGRESS --action=ALLOW \
    --rules=tcp:80,tcp:443 --target-tags=gbrain --source-ranges=0.0.0.0/0
fi

echo "=== 5. Create VM ==="
if ! gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute instances create "$VM_NAME" \
    --project="$PROJECT" --zone="$ZONE" --machine-type="$MACHINE_TYPE" \
    --image-family=debian-12 --image-project=debian-cloud \
    --boot-disk-size="$BOOT_DISK_SIZE" --address="$VM_NAME" \
    --tags=gbrain --service-account="$SA_EMAIL" \
    --scopes=https://www.googleapis.com/auth/cloud-platform
else
  echo "VM already exists, skipping creation."
fi

echo "=== 6. Wait for SSH ==="
SSH_READY=false
for _ in $(seq 1 40); do
  if gcloud compute ssh "$VM_NAME" --zone="$ZONE" --project="$PROJECT" \
    --ssh-flag="-o ConnectTimeout=10" --command="true" >/dev/null 2>&1; then
    SSH_READY=true
    break
  fi
  sleep 5
done
if [ "$SSH_READY" != true ]; then
  echo "ERROR: VM did not become SSH-ready." >&2
  exit 1
fi

echo "=== 7. Provision Docker on the VM ==="
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --project="$PROJECT" --command="$(cat <<'REMOTE'
set -euo pipefail
if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
if [ ! -f /swapfile ]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi
sudo mkdir -p /opt/gbrain
sudo chown "$USER:$USER" /opt/gbrain
REMOTE
)"

echo "=== 8. Render config from Secret Manager ==="
OPENAI_API_KEY=$(gcloud secrets versions access latest --secret=OPENAI_API_KEY --project="$PROJECT")
# Same secret precedence as livekit/*.sh: GOOGLE_API_KEY first, then GEMINI_API_KEY.
GOOGLE_GENERATIVE_AI_API_KEY=$(gcloud secrets versions access latest --secret=GOOGLE_API_KEY --project="$PROJECT" 2>/dev/null \
  || gcloud secrets versions access latest --secret=GEMINI_API_KEY --project="$PROJECT")
INGEST_TOKEN=$(ensure_random_secret GBRAIN_ROUTER_INGEST_TOKEN)
ADMIN_TOKEN=$(ensure_random_secret GBRAIN_ROUTER_ADMIN_TOKEN)
POSTGRES_PASSWORD=$(ensure_random_secret GBRAIN_POSTGRES_PASSWORD)

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

echo "=== 9. Copy sources + config and start ==="
gcloud compute scp --recurse \
  "$SCRIPT_DIR/Dockerfile" \
  "$SCRIPT_DIR/docker-compose.yml" \
  "$SCRIPT_DIR/router" \
  "$TMP_DIR/.env" \
  "$TMP_DIR/Caddyfile" \
  "$VM_NAME":$DEPLOY_DIR/ \
  --zone="$ZONE" --project="$PROJECT"

gcloud compute ssh "$VM_NAME" --zone="$ZONE" --project="$PROJECT" \
  --command="cd $DEPLOY_DIR && sudo docker compose up -d --build && sudo docker compose restart caddy"

echo "=== Done ==="
echo "Static IP     : $STATIC_IP"
echo "Set DNS       : $DOMAIN -> $STATIC_IP"
echo "Ingest URL    : https://$DOMAIN/ingest   (agent GBRAIN_INGEST_URL)"
echo "Ingest token  : secret GBRAIN_ROUTER_INGEST_TOKEN (agent GBRAIN_INGEST_TOKEN)"
echo "Mint a Claude Code token for a workspace:"
echo "  curl -s -X POST https://$DOMAIN/admin/w/<workspaceId>/token \\"
echo "    -H \"Authorization: Bearer \$(gcloud secrets versions access latest --secret=GBRAIN_ROUTER_ADMIN_TOKEN --project=$PROJECT)\""
