#!/usr/bin/env bash
# Provision the self-hosted LiveKit VM.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_ENV="$SCRIPT_DIR/config.env"
if [ ! -f "$CONFIG_ENV" ]; then
  echo "ERROR: $CONFIG_ENV not found. Copy config.env.example to config.env and fill it in." >&2
  exit 1
fi
# shellcheck source=/dev/null
. "$CONFIG_ENV"

ENVIRONMENT=prod
AUTO_YES=false

for arg in "$@"; do
  case "$arg" in
    --env=*)
      ENVIRONMENT="${arg#*=}"
      ;;
    --dev)
      ENVIRONMENT=dev
      ;;
    --prod)
      ENVIRONMENT=prod
      ;;
    -y|--yes)
      AUTO_YES=true
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

REGION=asia-northeast1
ZONE=asia-northeast1-b
MACHINE_TYPE=${MACHINE_TYPE:-e2-standard-2}
BOOT_DISK_SIZE=30GB
REPO_NAME=exe
LIVEKIT_AGENT_NAME=exe-task-review-agent
SA_NAME=${SA_NAME:-exe-livekit}
EXE_AGENT_MAX_CONCURRENT_JOBS=${EXE_AGENT_MAX_CONCURRENT_JOBS:-1}
EXE_AGENT_NUM_IDLE_PROCESSES=${EXE_AGENT_NUM_IDLE_PROCESSES:-1}
EXE_AGENT_LOAD_THRESHOLD=${EXE_AGENT_LOAD_THRESHOLD:-0.7}
RUN_BUNDLED_AGENT=${RUN_BUNDLED_AGENT:-true}
REALTIME_PROVIDER=${REALTIME_PROVIDER:-}
SENTRY_DSN=${SENTRY_DSN:-}
OPENAI_REALTIME_MODEL=${OPENAI_REALTIME_MODEL:-gpt-realtime-2}
OPENAI_REALTIME_VOICE=${OPENAI_REALTIME_VOICE:-marin}
OPENAI_REALTIME_REASONING_EFFORT=${OPENAI_REALTIME_REASONING_EFFORT:-low}
OPENAI_REALTIME_SPEED=${OPENAI_REALTIME_SPEED:-1.2}

case "$ENVIRONMENT" in
  dev)
    : "${PROJECT_DEV:?Set PROJECT_DEV in livekit/config.env}"
    : "${VM_NAME_DEV:?Set VM_NAME_DEV in livekit/config.env}"
    : "${DOMAIN_DEV:?Set DOMAIN_DEV in livekit/config.env}"
    : "${APP_URL_DEV:?Set APP_URL_DEV in livekit/config.env}"
    PROJECT=$PROJECT_DEV
    VM_NAME=$VM_NAME_DEV
    DOMAIN=$DOMAIN_DEV
    APP_URL=$APP_URL_DEV
    DEFAULT_REALTIME_PROVIDER=google
    LIVEKIT_ROOM_NAME_PREFIX=exe-dev-
    GBRAIN_DOMAIN=${GBRAIN_DOMAIN_DEV:-} # GBrain integration (optional)
    ;;
  prod)
    : "${PROJECT_PROD:?Set PROJECT_PROD in livekit/config.env}"
    : "${VM_NAME_PROD:?Set VM_NAME_PROD in livekit/config.env}"
    : "${DOMAIN_PROD:?Set DOMAIN_PROD in livekit/config.env}"
    : "${APP_URL_PROD:?Set APP_URL_PROD in livekit/config.env}"
    PROJECT=$PROJECT_PROD
    VM_NAME=$VM_NAME_PROD
    DOMAIN=$DOMAIN_PROD
    APP_URL=$APP_URL_PROD
    DEFAULT_REALTIME_PROVIDER=openai
    LIVEKIT_ROOM_NAME_PREFIX=exe-prod-
    GBRAIN_DOMAIN=${GBRAIN_DOMAIN_PROD:-} # GBrain integration (optional)
    ;;
  *)
    echo "ENVIRONMENT must be dev or prod." >&2
    exit 1
    ;;
esac

REALTIME_PROVIDER=${REALTIME_PROVIDER:-$DEFAULT_REALTIME_PROVIDER}

SA_EMAIL="$SA_NAME@$PROJECT.iam.gserviceaccount.com"
IMAGE="$REGION-docker.pkg.dev/$PROJECT/$REPO_NAME/agent:latest"
DEPLOY_DIR=/opt/exe

if ! gcloud auth print-access-token >/dev/null 2>&1; then
  echo "ERROR: Not logged in to gcloud." >&2
  exit 1
fi

access_first_available_secret() {
  local secret_name
  local secret_value

  for secret_name in "$@"; do
    if secret_value=$(gcloud secrets versions access latest --secret="$secret_name" --project="$PROJECT" 2>/dev/null); then
      printf '%s' "$secret_value"
      return 0
    fi
  done

  echo "ERROR: None of these secrets are available in $PROJECT: $*" >&2
  return 1
}

echo "========================================="
echo "  Environment  : $ENVIRONMENT"
echo "  Project      : $PROJECT"
echo "  Zone         : $ZONE"
echo "  VM           : $VM_NAME"
echo "  Domain       : $DOMAIN"
echo "  Image        : $IMAGE"
echo "========================================="

if [ "$AUTO_YES" = false ]; then
  read -rp "Provision this LiveKit VM? [y/N] " answer
  if [[ ! "$answer" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
fi

echo "=== 1. Enable required APIs ==="
gcloud services enable \
  aiplatform.googleapis.com \
  apikeys.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  compute.googleapis.com \
  generativelanguage.googleapis.com \
  iam.googleapis.com \
  secretmanager.googleapis.com \
  --project="$PROJECT"

echo "=== 2. Create service account ==="
if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" \
    --project="$PROJECT" \
    --display-name="exe LiveKit VM"
fi

for role in roles/aiplatform.user roles/artifactregistry.reader roles/datastore.user roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$role" \
    --quiet >/dev/null
done

echo "=== 3. Reserve static external IP ==="
if ! gcloud compute addresses describe "$VM_NAME" --region="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute addresses create "$VM_NAME" --region="$REGION" --project="$PROJECT"
fi
STATIC_IP=$(gcloud compute addresses describe "$VM_NAME" --region="$REGION" --project="$PROJECT" --format='value(address)')
echo "Static IP: $STATIC_IP"

echo "=== 4. Create firewall rules ==="
if ! gcloud compute firewall-rules describe allow-livekit-web --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute firewall-rules create allow-livekit-web \
    --project="$PROJECT" \
    --direction=INGRESS \
    --action=ALLOW \
    --rules=tcp:80,tcp:443 \
    --target-tags=livekit \
    --source-ranges=0.0.0.0/0
fi

if ! gcloud compute firewall-rules describe allow-livekit-turn --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute firewall-rules create allow-livekit-turn \
    --project="$PROJECT" \
    --direction=INGRESS \
    --action=ALLOW \
    --rules=tcp:7881 \
    --target-tags=livekit \
    --source-ranges=0.0.0.0/0
fi

if ! gcloud compute firewall-rules describe allow-livekit-webrtc --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute firewall-rules create allow-livekit-webrtc \
    --project="$PROJECT" \
    --direction=INGRESS \
    --action=ALLOW \
    --rules=udp:50000-60000 \
    --target-tags=livekit \
    --source-ranges=0.0.0.0/0
fi

echo "=== 5. Create Artifact Registry repository ==="
if ! gcloud artifacts repositories describe "$REPO_NAME" --location="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO_NAME" \
    --repository-format=docker \
    --location="$REGION" \
    --project="$PROJECT"
fi

echo "=== 6. Create VM ==="
if ! gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute instances create "$VM_NAME" \
    --project="$PROJECT" \
    --zone="$ZONE" \
    --machine-type="$MACHINE_TYPE" \
    --image-family=debian-12 \
    --image-project=debian-cloud \
    --boot-disk-size="$BOOT_DISK_SIZE" \
    --address="$VM_NAME" \
    --tags=livekit \
    --service-account="$SA_EMAIL" \
    --scopes=https://www.googleapis.com/auth/cloud-platform
else
  echo "VM already exists, skipping creation."
fi

echo "=== 7. Provision VM runtime ==="
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --project="$PROJECT" --command="$(cat <<REMOTE
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \$(. /etc/os-release && echo "\$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  sudo usermod -aG docker "\$USER"
fi

if [ ! -f /swapfile ]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

sudo gcloud auth configure-docker $REGION-docker.pkg.dev --quiet
sudo mkdir -p $DEPLOY_DIR
sudo chown "\$USER:\$USER" $DEPLOY_DIR
REMOTE
)"

echo "=== 8. Render LiveKit config from Secret Manager ==="
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

LIVEKIT_API_KEY=$(gcloud secrets versions access latest --secret=LIVEKIT_API_KEY --project="$PROJECT")
LIVEKIT_API_SECRET=$(gcloud secrets versions access latest --secret=LIVEKIT_API_SECRET --project="$PROJECT")
GOOGLE_API_KEY=$(access_first_available_secret GOOGLE_API_KEY GEMINI_API_KEY)
OPENAI_API_KEY=$(gcloud secrets versions access latest --secret=OPENAI_API_KEY --project="$PROJECT")
FIREBASE_CONFIG="{\"projectId\":\"$PROJECT\",\"storageBucket\":\"$PROJECT.firebasestorage.app\"}"
# GBrain integration (purgeable): empty when GBrain isn't provisioned -> agent no-op.
GBRAIN_INGEST_TOKEN=$(gcloud secrets versions access latest --secret=GBRAIN_ROUTER_INGEST_TOKEN --project="$PROJECT" 2>/dev/null || true)

cat >"$TMP_DIR/livekit.yaml" <<EOF
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true

keys:
  $LIVEKIT_API_KEY: $LIVEKIT_API_SECRET
EOF

cat >"$TMP_DIR/Caddyfile" <<EOF
$DOMAIN {
	reverse_proxy localhost:7880
}
EOF

cat >"$TMP_DIR/.env" <<EOF
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=$LIVEKIT_API_KEY
LIVEKIT_API_SECRET=$LIVEKIT_API_SECRET
LIVEKIT_AGENT_NAME=$LIVEKIT_AGENT_NAME
LIVEKIT_ROOM_NAME_PREFIX=$LIVEKIT_ROOM_NAME_PREFIX
EXE_AGENT_MAX_CONCURRENT_JOBS=$EXE_AGENT_MAX_CONCURRENT_JOBS
EXE_AGENT_NUM_IDLE_PROCESSES=$EXE_AGENT_NUM_IDLE_PROCESSES
EXE_AGENT_LOAD_THRESHOLD=$EXE_AGENT_LOAD_THRESHOLD
REALTIME_PROVIDER=$REALTIME_PROVIDER
EXE_ENV=$ENVIRONMENT
SENTRY_DSN=$SENTRY_DSN

GOOGLE_CLOUD_PROJECT=$PROJECT
FIREBASE_CONFIG=$FIREBASE_CONFIG
GOOGLE_API_KEY=$GOOGLE_API_KEY
GOOGLE_GENAI_USE_VERTEXAI=false
GEMINI_LIVE_MODEL=gemini-2.5-flash-native-audio-preview-12-2025
GEMINI_LIVE_VOICE=Aoede
OPENAI_API_KEY=$OPENAI_API_KEY
OPENAI_REALTIME_MODEL=$OPENAI_REALTIME_MODEL
OPENAI_REALTIME_VOICE=$OPENAI_REALTIME_VOICE
OPENAI_REALTIME_REASONING_EFFORT=$OPENAI_REALTIME_REASONING_EFFORT
OPENAI_REALTIME_SPEED=$OPENAI_REALTIME_SPEED

APP_URL=$APP_URL
SENDGRID_FROM_EMAIL=noreply@example.com

GBRAIN_INGEST_URL=${GBRAIN_INGEST_TOKEN:+https://$GBRAIN_DOMAIN/ingest}
GBRAIN_INGEST_TOKEN=$GBRAIN_INGEST_TOKEN
EOF

cat >"$TMP_DIR/docker-compose.yml" <<EOF
services:
  livekit:
    image: livekit/livekit-server:latest
    network_mode: host
    volumes:
      - ./livekit.yaml:/etc/livekit.yaml
    command: --config /etc/livekit.yaml
    restart: unless-stopped

  caddy:
    image: caddy:2-alpine
    network_mode: host
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    restart: unless-stopped
    depends_on:
      - livekit

  agent:
    image: $IMAGE
    network_mode: host
    env_file:
      - .env
    restart: unless-stopped
    depends_on:
      - livekit

volumes:
  caddy_data:
  caddy_config:
EOF

echo "=== 9. Copy config and start LiveKit/Caddy ==="
gcloud compute scp \
  "$TMP_DIR/docker-compose.yml" \
  "$TMP_DIR/livekit.yaml" \
  "$TMP_DIR/Caddyfile" \
  "$TMP_DIR/.env" \
  "$VM_NAME":$DEPLOY_DIR/ \
  --zone="$ZONE" \
  --project="$PROJECT"

if [ "$RUN_BUNDLED_AGENT" = true ]; then
  gcloud compute ssh "$VM_NAME" --zone="$ZONE" --project="$PROJECT" \
    --command="cd $DEPLOY_DIR && sudo docker compose up -d livekit caddy agent"
else
  gcloud compute ssh "$VM_NAME" --zone="$ZONE" --project="$PROJECT" \
    --command="cd $DEPLOY_DIR && sudo docker compose up -d livekit caddy && sudo docker compose stop agent >/dev/null 2>&1 || true && sudo docker compose rm -f agent >/dev/null 2>&1 || true"
fi

echo "=== Done ==="
echo "Static IP: $STATIC_IP"
echo "Set DNS: $DOMAIN -> $STATIC_IP"
