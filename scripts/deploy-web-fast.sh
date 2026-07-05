#!/bin/bash
# Fast web deploy: build Next.js locally, push a runtime-only image, and roll
# it out to Firebase App Hosting via the REST API (Build.source.container.image
# + Rollout). Skips App Hosting's Cloud Build entirely; the *.hosted.app URL
# and backend config (env/secrets) are untouched.
#
# Usage: scripts/deploy-web-fast.sh --dev|--prod [--skip-build]

set -euo pipefail

ENVIRONMENT=""
SKIP_BUILD=false

for arg in "$@"; do
  case "$arg" in
    --dev) ENVIRONMENT=dev ;;
    --prod) ENVIRONMENT=prod ;;
    --skip-build) SKIP_BUILD=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

if [ -z "$ENVIRONMENT" ]; then
  echo "Specify --dev or --prod" >&2
  exit 1
fi

REGION=us-central1
BACKEND=exe-web-app
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Project ids come from .firebaserc (copy .firebaserc.example and fill it in).
PROJECT="$(node -p "require('${REPO_ROOT}/.firebaserc').projects['${ENVIRONMENT}']" 2>/dev/null || true)"
if [ -z "$PROJECT" ] || [ "$PROJECT" = "undefined" ]; then
  echo "Could not resolve project id for '${ENVIRONMENT}' from .firebaserc (copy .firebaserc.example and fill it in)." >&2
  exit 1
fi
STANDALONE_DIR="${REPO_ROOT}/app/.next/standalone"
BUILD_ID="web-$(date +%Y%m%d%H%M%S)"
# Reuse App Hosting's own Artifact Registry repo so its service agent can
# pull the image without extra IAM setup.
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/firebaseapphosting-images/web:${BUILD_ID}"
API="https://firebaseapphosting.googleapis.com/v1"
PARENT="projects/${PROJECT}/locations/${REGION}/backends/${BACKEND}"

echo "=== 1. Build Next.js standalone locally ==="
if [ "$SKIP_BUILD" = true ]; then
  echo "(skipped)"
else
  npm --prefix "${REPO_ROOT}/app" -w @exe/apphosting run build
fi

if [ ! -f "${STANDALONE_DIR}/server.js" ]; then
  echo "standalone output not found at ${STANDALONE_DIR}" >&2
  exit 1
fi

echo "=== 2. Build + push runtime image (${IMAGE}) ==="
docker buildx build \
  --platform linux/amd64 \
  -f "${REPO_ROOT}/scripts/web.Dockerfile" \
  -t "$IMAGE" \
  --push \
  "$STANDALONE_DIR"

TOKEN="$(gcloud auth print-access-token)"

echo "=== 3. Register App Hosting build (inheriting env from latest build) ==="
# Container-source builds do not go through apphosting.yaml processing, so
# runtime env/secrets must be attached explicitly. Copy config.env/runConfig
# from the most recent build to stay in parity with the last source deploy.
REQUEST_BODY="$(curl -sS -H "Authorization: Bearer ${TOKEN}" \
  "${API}/${PARENT}/builds" | python3 -c "
import json, sys

builds = json.load(sys.stdin).get('builds', [])
withEnv = [b for b in builds if b.get('config', {}).get('env')]
if not withEnv:
    sys.exit('No previous build with config.env found; run a source deploy first.')
latest = max(withEnv, key=lambda b: b.get('createTime', ''))
# Container builds only accept RUNTIME-available env; BUILD-only vars (e.g.
# FIREBASE_WEBAPP_CONFIG) belong to the skipped cloud build and are dropped.
runtimeEnv = [
    e
    for e in latest['config']['env']
    if 'RUNTIME' in e.get('availability', ['RUNTIME'])
]
config = {'env': runtimeEnv}
if 'runConfig' in latest['config']:
    config['runConfig'] = latest['config']['runConfig']
print(json.dumps({
    'source': {'container': {'image': '${IMAGE}'}},
    'config': config,
}))
")"

curl -sS -f -X POST \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  "${API}/${PARENT}/builds?buildId=${BUILD_ID}" \
  -d "$REQUEST_BODY" > /dev/null

echo "=== 4. Create rollout ==="
curl -sS -f -X POST \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  "${API}/${PARENT}/rollouts?rolloutId=${BUILD_ID}" \
  -d "{\"build\": \"${PARENT}/builds/${BUILD_ID}\"}" > /dev/null

echo "=== 5. Wait for rollout ==="
for _ in $(seq 1 60); do
  STATE="$(curl -sS -H "Authorization: Bearer ${TOKEN}" \
    "${API}/${PARENT}/rollouts/${BUILD_ID}" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("state","?"))')"
  echo "rollout: ${STATE}"
  case "$STATE" in
    SUCCEEDED) echo "=== Done ($(date)) ==="; exit 0 ;;
    FAILED|CANCELLED) echo "Rollout ${STATE}" >&2; exit 1 ;;
  esac
  sleep 5
done

echo "Timed out waiting for rollout." >&2
exit 1
