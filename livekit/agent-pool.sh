#!/usr/bin/env bash
# Create or update an autoscaled pool of LiveKit agent-only VMs.
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
MIN_REPLICAS=${MIN_REPLICAS:-1}
MAX_REPLICAS=${MAX_REPLICAS:-20}
TARGET_CPU_UTILIZATION=${TARGET_CPU_UTILIZATION:-0.6}
MACHINE_TYPE=${MACHINE_TYPE:-e2-small}
BOOT_DISK_SIZE=${BOOT_DISK_SIZE:-20GB}
AGENT_VM_IMAGE_FAMILY=${AGENT_VM_IMAGE_FAMILY:-exe-livekit-agent}
AGENT_VM_IMAGE_PROJECT=${AGENT_VM_IMAGE_PROJECT:-}
USE_AGENT_VM_IMAGE=${USE_AGENT_VM_IMAGE:-auto}
PULL_AGENT_IMAGE_ON_BOOT=${PULL_AGENT_IMAGE_ON_BOOT:-true}

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
    --min=*)
      MIN_REPLICAS="${arg#*=}"
      ;;
    --max=*)
      MAX_REPLICAS="${arg#*=}"
      ;;
    --image-family=*)
      AGENT_VM_IMAGE_FAMILY="${arg#*=}"
      ;;
    --pull-image-on-boot)
      PULL_AGENT_IMAGE_ON_BOOT=true
      ;;
    --no-custom-image)
      USE_AGENT_VM_IMAGE=false
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
LIVEKIT_AGENT_NAME=exe-task-review-agent
MIG_NAME=${MIG_NAME:-exe-livekit-agent-pool}
SA_NAME=${AGENT_SA_NAME:-exe-livekit-agent}
EXE_AGENT_MAX_CONCURRENT_JOBS=${EXE_AGENT_MAX_CONCURRENT_JOBS:-1}
EXE_AGENT_NUM_IDLE_PROCESSES=${EXE_AGENT_NUM_IDLE_PROCESSES:-1}
EXE_AGENT_LOAD_THRESHOLD=${EXE_AGENT_LOAD_THRESHOLD:-0.7}
REALTIME_PROVIDER=${REALTIME_PROVIDER:-}
SENTRY_DSN=${SENTRY_DSN:-}
OPENAI_REALTIME_MODEL=${OPENAI_REALTIME_MODEL:-gpt-realtime-2}
OPENAI_REALTIME_VOICE=${OPENAI_REALTIME_VOICE:-marin}
OPENAI_REALTIME_REASONING_EFFORT=${OPENAI_REALTIME_REASONING_EFFORT:-low}
OPENAI_REALTIME_SPEED=${OPENAI_REALTIME_SPEED:-1.2}
# Background assistant (tool-caller) text model; the voice model only dispatches to it.
EXE_ASSISTANT_MODEL=${EXE_ASSISTANT_MODEL:-gemini-3.5-flash}

case "$ENVIRONMENT" in
  dev)
    : "${PROJECT_DEV:?Set PROJECT_DEV in livekit/config.env}"
    : "${DOMAIN_DEV:?Set DOMAIN_DEV in livekit/config.env}"
    : "${APP_URL_DEV:?Set APP_URL_DEV in livekit/config.env}"
    PROJECT=$PROJECT_DEV
    DEFAULT_REALTIME_PROVIDER=google
    LIVEKIT_PUBLIC_URL=wss://$DOMAIN_DEV
    APP_URL=$APP_URL_DEV
    LIVEKIT_ROOM_NAME_PREFIX=exe-dev-
    GBRAIN_DOMAIN=${GBRAIN_DOMAIN_DEV:-} # GBrain integration (optional)
    ;;
  prod)
    : "${PROJECT_PROD:?Set PROJECT_PROD in livekit/config.env}"
    : "${DOMAIN_PROD:?Set DOMAIN_PROD in livekit/config.env}"
    : "${APP_URL_PROD:?Set APP_URL_PROD in livekit/config.env}"
    PROJECT=$PROJECT_PROD
    DEFAULT_REALTIME_PROVIDER=openai
    LIVEKIT_PUBLIC_URL=wss://$DOMAIN_PROD
    APP_URL=$APP_URL_PROD
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
TEMPLATE_NAME="$MIG_NAME-$(date +%Y%m%d%H%M%S)"
AGENT_VM_IMAGE_PROJECT=${AGENT_VM_IMAGE_PROJECT:-$PROJECT}

SOURCE_IMAGE_ARGS=(--image-family=debian-12 --image-project=debian-cloud)
BOOT_IMAGE_LABEL="debian-12/debian-cloud"
RESOLVED_PULL_AGENT_IMAGE_ON_BOOT="$PULL_AGENT_IMAGE_ON_BOOT"

if [ "$USE_AGENT_VM_IMAGE" != false ]; then
  if gcloud compute images describe-from-family "$AGENT_VM_IMAGE_FAMILY" \
    --project="$AGENT_VM_IMAGE_PROJECT" >/dev/null 2>&1; then
    SOURCE_IMAGE_ARGS=(
      --image-family="$AGENT_VM_IMAGE_FAMILY"
      --image-project="$AGENT_VM_IMAGE_PROJECT"
    )
    BOOT_IMAGE_LABEL="$AGENT_VM_IMAGE_FAMILY/$AGENT_VM_IMAGE_PROJECT"
    if [ "$RESOLVED_PULL_AGENT_IMAGE_ON_BOOT" = auto ]; then
      RESOLVED_PULL_AGENT_IMAGE_ON_BOOT=false
    fi
  elif [ "$USE_AGENT_VM_IMAGE" = true ]; then
    echo "ERROR: custom image family not found: $AGENT_VM_IMAGE_PROJECT/$AGENT_VM_IMAGE_FAMILY" >&2
    exit 1
  fi
fi

if [ "$RESOLVED_PULL_AGENT_IMAGE_ON_BOOT" = auto ]; then
  RESOLVED_PULL_AGENT_IMAGE_ON_BOOT=true
fi

if ! gcloud auth print-access-token >/dev/null 2>&1; then
  echo "ERROR: Not logged in to gcloud." >&2
  exit 1
fi

echo "========================================="
echo "  Environment : $ENVIRONMENT"
echo "  Project     : $PROJECT"
echo "  Zone        : $ZONE"
echo "  MIG         : $MIG_NAME"
echo "  Min/Max     : $MIN_REPLICAS/$MAX_REPLICAS"
echo "  Machine     : $MACHINE_TYPE"
echo "  Boot image  : $BOOT_IMAGE_LABEL"
echo "  Image       : $IMAGE"
echo "  Pull on boot: $RESOLVED_PULL_AGENT_IMAGE_ON_BOOT"
echo "========================================="

if [ "$AUTO_YES" = false ]; then
  read -rp "Create/update this LiveKit agent VM pool? [y/N] " answer
  if [[ ! "$answer" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
fi

echo "=== 1. Enable required APIs ==="
gcloud services enable \
  artifactregistry.googleapis.com \
  compute.googleapis.com \
  iam.googleapis.com \
  secretmanager.googleapis.com \
  --project="$PROJECT"

echo "=== 2. Create service account ==="
if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" \
    --project="$PROJECT" \
    --display-name="exe LiveKit agent pool"
fi

for role in \
  roles/aiplatform.user \
  roles/artifactregistry.reader \
  roles/datastore.user \
  roles/logging.logWriter \
  roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$role" \
    --quiet >/dev/null
done

echo "=== 3. Render startup script ==="
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

cat >"$TMP_DIR/start-agent.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail

PROJECT="$PROJECT"
IMAGE="$IMAGE"
LIVEKIT_PUBLIC_URL="$LIVEKIT_PUBLIC_URL"
LIVEKIT_AGENT_NAME="$LIVEKIT_AGENT_NAME"
LIVEKIT_ROOM_NAME_PREFIX="$LIVEKIT_ROOM_NAME_PREFIX"
EXE_AGENT_MAX_CONCURRENT_JOBS="$EXE_AGENT_MAX_CONCURRENT_JOBS"
EXE_AGENT_NUM_IDLE_PROCESSES="$EXE_AGENT_NUM_IDLE_PROCESSES"
EXE_AGENT_LOAD_THRESHOLD="$EXE_AGENT_LOAD_THRESHOLD"
PULL_AGENT_IMAGE_ON_BOOT="$RESOLVED_PULL_AGENT_IMAGE_ON_BOOT"
REALTIME_PROVIDER="$REALTIME_PROVIDER"
SENTRY_DSN="$SENTRY_DSN"
OPENAI_REALTIME_MODEL="$OPENAI_REALTIME_MODEL"
OPENAI_REALTIME_VOICE="$OPENAI_REALTIME_VOICE"
OPENAI_REALTIME_REASONING_EFFORT="$OPENAI_REALTIME_REASONING_EFFORT"
OPENAI_REALTIME_SPEED="$OPENAI_REALTIME_SPEED"
APP_URL="$APP_URL"
GBRAIN_DOMAIN="$GBRAIN_DOMAIN" # GBrain integration (optional)
EXE_ASSISTANT_MODEL="$EXE_ASSISTANT_MODEL"
DEPLOY_DIR=/opt/exe-agent

if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \$(. /etc/os-release && echo "\$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io
fi

access_secret() {
  gcloud secrets versions access latest --secret="\$1" --project="\$PROJECT"
}

access_first_available_secret() {
  local secret_name

  for secret_name in "\$@"; do
    if access_secret "\$secret_name" 2>/dev/null; then
      return 0
    fi
  done

  echo "ERROR: no configured secret found: \$*" >&2
  return 1
}

LIVEKIT_API_KEY=\$(access_secret LIVEKIT_API_KEY)
LIVEKIT_API_SECRET=\$(access_secret LIVEKIT_API_SECRET)
GOOGLE_API_KEY=\$(access_first_available_secret GOOGLE_API_KEY GEMINI_API_KEY)
OPENAI_API_KEY=\$(access_secret OPENAI_API_KEY)
FIREBASE_CONFIG="{\\"projectId\\":\\"$PROJECT\\",\\"storageBucket\\":\\"$PROJECT.firebasestorage.app\\"}"
# GBrain integration (purgeable): empty when GBrain isn't provisioned -> agent no-op.
GBRAIN_INGEST_TOKEN=\$(access_secret GBRAIN_ROUTER_INGEST_TOKEN 2>/dev/null || true)
# Required by createFirebaseServerComposition (gbrain admin gateway) on every call.
GBRAIN_ADMIN_TOKEN=\$(access_secret GBRAIN_ROUTER_ADMIN_TOKEN 2>/dev/null || true)
# Required to decrypt the Slack bot token (workspace member roster at call start).
ENCRYPTION_KEY=\$(access_secret ENCRYPTION_KEY)

mkdir -p "\$DEPLOY_DIR"
cat >"\$DEPLOY_DIR/.env" <<ENV
LIVEKIT_URL=\$LIVEKIT_PUBLIC_URL
LIVEKIT_API_KEY=\$LIVEKIT_API_KEY
LIVEKIT_API_SECRET=\$LIVEKIT_API_SECRET
LIVEKIT_AGENT_NAME=\$LIVEKIT_AGENT_NAME
LIVEKIT_ROOM_NAME_PREFIX=\$LIVEKIT_ROOM_NAME_PREFIX
EXE_AGENT_MAX_CONCURRENT_JOBS=\$EXE_AGENT_MAX_CONCURRENT_JOBS
EXE_AGENT_NUM_IDLE_PROCESSES=\$EXE_AGENT_NUM_IDLE_PROCESSES
EXE_AGENT_LOAD_THRESHOLD=\$EXE_AGENT_LOAD_THRESHOLD
REALTIME_PROVIDER=\$REALTIME_PROVIDER
EXE_ENV=$ENVIRONMENT
SENTRY_DSN=\$SENTRY_DSN

GOOGLE_CLOUD_PROJECT=\$PROJECT
FIREBASE_CONFIG=\$FIREBASE_CONFIG
GOOGLE_API_KEY=\$GOOGLE_API_KEY
GOOGLE_GENAI_USE_VERTEXAI=false
GEMINI_LIVE_MODEL=gemini-2.5-flash-native-audio-preview-12-2025
GEMINI_LIVE_VOICE=Aoede
EXE_ASSISTANT_MODEL=\$EXE_ASSISTANT_MODEL
OPENAI_API_KEY=\$OPENAI_API_KEY
OPENAI_REALTIME_MODEL=\$OPENAI_REALTIME_MODEL
OPENAI_REALTIME_VOICE=\$OPENAI_REALTIME_VOICE
OPENAI_REALTIME_REASONING_EFFORT=\$OPENAI_REALTIME_REASONING_EFFORT
OPENAI_REALTIME_SPEED=\$OPENAI_REALTIME_SPEED

APP_URL=\$APP_URL
SENDGRID_FROM_EMAIL=noreply@example.com
ENCRYPTION_KEY=\$ENCRYPTION_KEY

GBRAIN_INGEST_URL=\${GBRAIN_INGEST_TOKEN:+https://\$GBRAIN_DOMAIN/ingest}
GBRAIN_INGEST_TOKEN=\$GBRAIN_INGEST_TOKEN
GBRAIN_ROUTER_ADMIN_TOKEN=\$GBRAIN_ADMIN_TOKEN
ENV
chmod 600 "\$DEPLOY_DIR/.env"

if [ "\$PULL_AGENT_IMAGE_ON_BOOT" = true ] || ! docker image inspect "\$IMAGE" >/dev/null 2>&1; then
  gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet
  docker pull "\$IMAGE"
fi
docker rm -f exe-livekit-agent >/dev/null 2>&1 || true
docker run -d \
  --name exe-livekit-agent \
  --restart=always \
  --network=host \
  --env-file "\$DEPLOY_DIR/.env" \
  "\$IMAGE"
EOF

echo "=== 4. Create instance template ==="
gcloud compute instance-templates create "$TEMPLATE_NAME" \
  --project="$PROJECT" \
  --machine-type="$MACHINE_TYPE" \
  "${SOURCE_IMAGE_ARGS[@]}" \
  --boot-disk-size="$BOOT_DISK_SIZE" \
  --service-account="$SA_EMAIL" \
  --scopes=https://www.googleapis.com/auth/cloud-platform \
  --metadata-from-file=startup-script="$TMP_DIR/start-agent.sh"

echo "=== 5. Create or update managed instance group ==="
if ! gcloud compute instance-groups managed describe "$MIG_NAME" \
  --zone="$ZONE" \
  --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute instance-groups managed create "$MIG_NAME" \
    --zone="$ZONE" \
    --project="$PROJECT" \
    --base-instance-name="$MIG_NAME" \
    --size="$MIN_REPLICAS" \
    --template="$TEMPLATE_NAME"
else
  gcloud compute instance-groups managed set-instance-template "$MIG_NAME" \
    --zone="$ZONE" \
    --project="$PROJECT" \
    --template="$TEMPLATE_NAME"
  gcloud compute instance-groups managed rolling-action start-update "$MIG_NAME" \
    --zone="$ZONE" \
    --project="$PROJECT" \
    --version=template="$TEMPLATE_NAME" \
    --max-unavailable=1
fi

echo "=== 6. Configure autoscaling ==="
gcloud compute instance-groups managed set-autoscaling "$MIG_NAME" \
  --zone="$ZONE" \
  --project="$PROJECT" \
  --min-num-replicas="$MIN_REPLICAS" \
  --max-num-replicas="$MAX_REPLICAS" \
  --target-cpu-utilization="$TARGET_CPU_UTILIZATION" \
  --cool-down-period=60

echo "=== Done ==="
echo "Agent pool: $MIG_NAME"
echo "Each VM accepts up to EXE_AGENT_MAX_CONCURRENT_JOBS=$EXE_AGENT_MAX_CONCURRENT_JOBS active job(s)."
