#!/bin/sh

set -eu

export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH:-}"

case "${CONFIGURATION:-}" in
  Release*)
    ;;
  *)
    echo "Skipping Sentry dSYM upload for ${CONFIGURATION:-unknown} configuration."
    exit 0
    ;;
esac

if [ "${PLATFORM_NAME:-}" = "iphonesimulator" ] || [ "${EFFECTIVE_PLATFORM_NAME:-}" = "-iphonesimulator" ]; then
  echo "Skipping Sentry dSYM upload for iOS Simulator build."
  exit 0
fi

if [ -z "${SENTRY_DSN:-}" ]; then
  echo "Skipping Sentry dSYM upload because SENTRY_DSN is empty."
  exit 0
fi

if [ -z "${DWARF_DSYM_FOLDER_PATH:-}" ] || [ ! -d "${DWARF_DSYM_FOLDER_PATH}" ]; then
  echo "warning: Skipping Sentry dSYM upload because dSYM folder was not found."
  exit 0
fi

if command -v sentry-cli >/dev/null 2>&1; then
  SENTRY_CLI="$(command -v sentry-cli)"
elif [ -n "${PROJECT_DIR:-}" ] && [ -x "${PROJECT_DIR}/node_modules/.bin/sentry-cli" ]; then
  SENTRY_CLI="${PROJECT_DIR}/node_modules/.bin/sentry-cli"
elif [ -n "${SRCROOT:-}" ] && [ -x "${SRCROOT}/node_modules/.bin/sentry-cli" ]; then
  SENTRY_CLI="${SRCROOT}/node_modules/.bin/sentry-cli"
else
  echo "warning: Skipping Sentry dSYM upload because sentry-cli was not found."
  exit 0
fi

if ! SENTRY_INFO_OUTPUT="$("${SENTRY_CLI}" info 2>&1)"; then
  echo "warning: Skipping Sentry dSYM upload because sentry-cli is not authenticated or configured."
  echo "${SENTRY_INFO_OUTPUT}"
  exit 0
fi

set -- debug-files upload

if [ -n "${SENTRY_ORG:-}" ]; then
  set -- "$@" --org "${SENTRY_ORG}"
fi

if [ -n "${SENTRY_PROJECT:-}" ]; then
  set -- "$@" --project "${SENTRY_PROJECT}"
fi

set -- "$@" "${DWARF_DSYM_FOLDER_PATH}"

echo "Uploading dSYMs to Sentry with sentry-cli."
if ! SENTRY_UPLOAD_OUTPUT="$("${SENTRY_CLI}" "$@" 2>&1)"; then
  echo "warning: Skipping Sentry dSYM upload because sentry-cli upload failed."
  echo "${SENTRY_UPLOAD_OUTPUT}"
  exit 0
fi

echo "${SENTRY_UPLOAD_OUTPUT}"
echo "Sentry dSYM upload completed."
