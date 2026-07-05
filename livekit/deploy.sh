#!/usr/bin/env bash
# Build and deploy the LiveKit agent image to the provisioned VM.
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
REPO_NAME=exe
DEPLOY_DIR=/opt/exe
LIVEKIT_AGENT_NAME=exe-task-review-agent
EXE_AGENT_MAX_CONCURRENT_JOBS=${EXE_AGENT_MAX_CONCURRENT_JOBS:-1}
EXE_AGENT_NUM_IDLE_PROCESSES=${EXE_AGENT_NUM_IDLE_PROCESSES:-1}
EXE_AGENT_LOAD_THRESHOLD=${EXE_AGENT_LOAD_THRESHOLD:-0.7}
RUN_BUNDLED_AGENT=${RUN_BUNDLED_AGENT:-true}
REALTIME_PROVIDER=${REALTIME_PROVIDER:-}
SENTRY_DSN=${SENTRY_DSN:-}
OPENAI_REALTIME_MODEL=${OPENAI_REALTIME_MODEL:-gpt-realtime-2}
OPENAI_REALTIME_VOICE=${OPENAI_REALTIME_VOICE:-marin}
OPENAI_REALTIME_REASONING_EFFORT=${OPENAI_REALTIME_REASONING_EFFORT:-minimal}
OPENAI_REALTIME_SPEED=${OPENAI_REALTIME_SPEED:-1.2}
# Background assistant (tool-caller) text model; the voice model only dispatches to it.
EXE_ASSISTANT_MODEL=${EXE_ASSISTANT_MODEL:-gemini-3.5-flash}

case "$ENVIRONMENT" in
  dev)
    : "${PROJECT_DEV:?Set PROJECT_DEV in livekit/config.env}"
    : "${VM_NAME_DEV:?Set VM_NAME_DEV in livekit/config.env}"
    : "${APP_URL_DEV:?Set APP_URL_DEV in livekit/config.env}"
    PROJECT=$PROJECT_DEV
    VM_NAME=$VM_NAME_DEV
    APP_URL=$APP_URL_DEV
    DEFAULT_REALTIME_PROVIDER=google
    LIVEKIT_ROOM_NAME_PREFIX=exe-dev-
    GBRAIN_DOMAIN=${GBRAIN_DOMAIN_DEV:-} # GBrain integration (optional)
    ;;
  prod)
    : "${PROJECT_PROD:?Set PROJECT_PROD in livekit/config.env}"
    : "${VM_NAME_PROD:?Set VM_NAME_PROD in livekit/config.env}"
    : "${APP_URL_PROD:?Set APP_URL_PROD in livekit/config.env}"
    PROJECT=$PROJECT_PROD
    VM_NAME=$VM_NAME_PROD
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

APP_DIR="$SCRIPT_DIR/../app"
IMAGE="$REGION-docker.pkg.dev/$PROJECT/$REPO_NAME/agent:latest"

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
echo "  Environment : $ENVIRONMENT"
echo "  Project     : $PROJECT"
echo "  Zone        : $ZONE"
echo "  VM          : $VM_NAME"
echo "  Image       : $IMAGE"
echo "========================================="

if [ "$AUTO_YES" = false ]; then
  read -rp "Deploy this agent image? [y/N] " answer
  if [[ ! "$answer" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
fi

echo "=== 1. Configure Docker auth ==="
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet

echo "=== 2. Build image ==="
if docker info >/dev/null 2>&1; then
  docker build --platform linux/amd64 -t "$IMAGE" "$APP_DIR"

  echo "=== 3. Push image ==="
  docker push "$IMAGE"
else
  echo "Docker daemon is not available; using Cloud Build."
  gcloud builds submit "$APP_DIR" --project="$PROJECT" --tag="$IMAGE"
fi

echo "=== 4. Start VM if needed ==="
STATUS=$(gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --project="$PROJECT" --format='value(status)')
if [ "$STATUS" = "TERMINATED" ]; then
  gcloud compute instances start "$VM_NAME" --zone="$ZONE" --project="$PROJECT"
fi

echo "=== 5. Wait for SSH ==="
SSH_READY=false
for _ in $(seq 1 30); do
  if gcloud compute ssh "$VM_NAME"     --zone="$ZONE"     --project="$PROJECT"     --ssh-flag="-o ConnectTimeout=10"     --command="true" >/dev/null 2>&1; then
    SSH_READY=true
    break
  fi
  sleep 5
done

if [ "$SSH_READY" != true ]; then
  echo "ERROR: VM did not become SSH-ready." >&2
  exit 1
fi

echo "=== 6. Render agent env from Secret Manager ==="
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

LIVEKIT_API_KEY=$(gcloud secrets versions access latest --secret=LIVEKIT_API_KEY --project="$PROJECT")
LIVEKIT_API_SECRET=$(gcloud secrets versions access latest --secret=LIVEKIT_API_SECRET --project="$PROJECT")
GOOGLE_API_KEY=$(access_first_available_secret GOOGLE_API_KEY GEMINI_API_KEY)
OPENAI_API_KEY=$(gcloud secrets versions access latest --secret=OPENAI_API_KEY --project="$PROJECT")
FIREBASE_CONFIG="{\"projectId\":\"$PROJECT\",\"storageBucket\":\"$PROJECT.firebasestorage.app\"}"
# GBrain integration (purgeable): empty when GBrain isn't provisioned -> agent no-op.
GBRAIN_INGEST_TOKEN=$(gcloud secrets versions access latest --secret=GBRAIN_ROUTER_INGEST_TOKEN --project="$PROJECT" 2>/dev/null || true)
# Required by createFirebaseServerComposition (gbrain admin gateway) on every call.
GBRAIN_ADMIN_TOKEN=$(gcloud secrets versions access latest --secret=GBRAIN_ROUTER_ADMIN_TOKEN --project="$PROJECT" 2>/dev/null || true)
# Required to decrypt the Slack bot token (workspace member roster at call start).
ENCRYPTION_KEY=$(gcloud secrets versions access latest --secret=ENCRYPTION_KEY --project="$PROJECT")

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
EXE_ASSISTANT_MODEL=$EXE_ASSISTANT_MODEL
OPENAI_API_KEY=$OPENAI_API_KEY
OPENAI_REALTIME_MODEL=$OPENAI_REALTIME_MODEL
OPENAI_REALTIME_VOICE=$OPENAI_REALTIME_VOICE
OPENAI_REALTIME_REASONING_EFFORT=$OPENAI_REALTIME_REASONING_EFFORT
OPENAI_REALTIME_SPEED=$OPENAI_REALTIME_SPEED

APP_URL=$APP_URL
SENDGRID_FROM_EMAIL=noreply@example.com
ENCRYPTION_KEY=$ENCRYPTION_KEY

GBRAIN_INGEST_URL=${GBRAIN_INGEST_TOKEN:+https://$GBRAIN_DOMAIN/ingest}
GBRAIN_INGEST_TOKEN=$GBRAIN_INGEST_TOKEN
GBRAIN_ROUTER_ADMIN_TOKEN=$GBRAIN_ADMIN_TOKEN
EOF
chmod 600 "$TMP_DIR/.env"

gcloud compute scp "$TMP_DIR/.env" "$VM_NAME":$DEPLOY_DIR/.env.next \
  --zone="$ZONE" \
  --project="$PROJECT"

gcloud compute ssh "$VM_NAME" --zone="$ZONE" --project="$PROJECT" \
  --command="cd $DEPLOY_DIR && sudo install -m 600 .env.next .env && rm -f .env.next"

echo "=== 7. Restart agent ==="
if [ "$RUN_BUNDLED_AGENT" = true ]; then
  gcloud compute ssh "$VM_NAME" --zone="$ZONE" --project="$PROJECT" \
    --command="cd $DEPLOY_DIR && sudo docker compose pull agent && sudo docker compose up -d --force-recreate agent"
else
  gcloud compute ssh "$VM_NAME" --zone="$ZONE" --project="$PROJECT" \
    --command="cd $DEPLOY_DIR && sudo docker compose stop agent >/dev/null 2>&1 || true && sudo docker compose rm -f agent >/dev/null 2>&1 || true"
fi

echo "=== Done ==="
if [ "$RUN_BUNDLED_AGENT" = true ]; then
  echo "Logs: gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT --command='cd $DEPLOY_DIR && sudo docker compose logs -f agent'"
else
  echo "Bundled agent is disabled. Use livekit/agent-pool.sh to manage agent workers."
fi
