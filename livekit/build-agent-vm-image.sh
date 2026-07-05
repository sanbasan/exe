#!/usr/bin/env bash
# Build a GCE VM image with Docker installed and the latest exe agent image
# already pulled. Agent pool VMs can boot from this image to avoid apt-get and
# Docker image pull on the cold-start path.
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
MACHINE_TYPE=${MACHINE_TYPE:-e2-small}
BOOT_DISK_SIZE=${BOOT_DISK_SIZE:-20GB}
AGENT_VM_IMAGE_FAMILY=${AGENT_VM_IMAGE_FAMILY:-exe-livekit-agent}

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
    --image-family=*)
      AGENT_VM_IMAGE_FAMILY="${arg#*=}"
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
SA_NAME=${AGENT_SA_NAME:-exe-livekit-agent}

case "$ENVIRONMENT" in
  dev)
    : "${PROJECT_DEV:?Set PROJECT_DEV in livekit/config.env}"
    PROJECT=$PROJECT_DEV
    ;;
  prod)
    : "${PROJECT_PROD:?Set PROJECT_PROD in livekit/config.env}"
    PROJECT=$PROJECT_PROD
    ;;
  *)
    echo "ENVIRONMENT must be dev or prod." >&2
    exit 1
    ;;
esac

SA_EMAIL="$SA_NAME@$PROJECT.iam.gserviceaccount.com"
IMAGE="$REGION-docker.pkg.dev/$PROJECT/$REPO_NAME/agent:latest"
STAMP=$(date +%Y%m%d%H%M%S)
BUILDER_VM="exe-agent-image-build-$ENVIRONMENT-$STAMP"
IMAGE_NAME="$AGENT_VM_IMAGE_FAMILY-$STAMP"

if ! gcloud auth print-access-token >/dev/null 2>&1; then
  echo "ERROR: Not logged in to gcloud." >&2
  exit 1
fi

cleanup() {
  gcloud compute instances delete "$BUILDER_VM" \
    --zone="$ZONE" \
    --project="$PROJECT" \
    --quiet >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "========================================="
echo "  Environment  : $ENVIRONMENT"
echo "  Project      : $PROJECT"
echo "  Zone         : $ZONE"
echo "  Builder VM   : $BUILDER_VM"
echo "  Image family : $AGENT_VM_IMAGE_FAMILY"
echo "  Image name   : $IMAGE_NAME"
echo "  Agent image  : $IMAGE"
echo "========================================="

if [ "$AUTO_YES" = false ]; then
  read -rp "Build this LiveKit agent VM image? [y/N] " answer
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
  --project="$PROJECT"

echo "=== 2. Create service account ==="
if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" \
    --project="$PROJECT" \
    --display-name="exe LiveKit agent pool"
fi

for role in roles/artifactregistry.reader roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$role" \
    --quiet >/dev/null
done

echo "=== 3. Create builder VM ==="
gcloud compute instances create "$BUILDER_VM" \
  --project="$PROJECT" \
  --zone="$ZONE" \
  --machine-type="$MACHINE_TYPE" \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --boot-disk-size="$BOOT_DISK_SIZE" \
  --service-account="$SA_EMAIL" \
  --scopes=https://www.googleapis.com/auth/cloud-platform

echo "=== 4. Wait for SSH ==="
SSH_READY=false
for _ in $(seq 1 30); do
  if gcloud compute ssh "$BUILDER_VM" \
    --zone="$ZONE" \
    --project="$PROJECT" \
    --ssh-flag="-o ConnectTimeout=10" \
    --command="true" >/dev/null 2>&1; then
    SSH_READY=true
    break
  fi
  sleep 5
done

if [ "$SSH_READY" != true ]; then
  echo "ERROR: builder VM did not become SSH-ready." >&2
  exit 1
fi

echo "=== 5. Install Docker and cache agent image ==="
gcloud compute ssh "$BUILDER_VM" --zone="$ZONE" --project="$PROJECT" \
  --command="$(cat <<REMOTE
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \$(. /etc/os-release && echo "\$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io
fi

sudo systemctl enable docker
sudo systemctl start docker
sudo gcloud auth configure-docker $REGION-docker.pkg.dev --quiet
sudo docker pull $IMAGE
sudo docker image inspect $IMAGE >/dev/null
sudo apt-get clean
sudo rm -rf /var/lib/apt/lists/*
REMOTE
)"

echo "=== 6. Stop builder VM ==="
gcloud compute instances stop "$BUILDER_VM" \
  --zone="$ZONE" \
  --project="$PROJECT" \
  --quiet

echo "=== 7. Create reusable VM image ==="
gcloud compute images create "$IMAGE_NAME" \
  --project="$PROJECT" \
  --source-disk="$BUILDER_VM" \
  --source-disk-zone="$ZONE" \
  --family="$AGENT_VM_IMAGE_FAMILY"

echo "=== Done ==="
echo "Built image family: $PROJECT/$AGENT_VM_IMAGE_FAMILY"
echo "Update the pool with:"
echo "  livekit/agent-pool.sh --$ENVIRONMENT --yes"
