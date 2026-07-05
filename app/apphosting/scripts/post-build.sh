#!/bin/bash

set -e

SCRIPT_DIR="$(dirname "$0")"

STANDALONE_DIR="${SCRIPT_DIR}/../../.next/standalone"
APPHOSTING_DIR="${STANDALONE_DIR}/apphosting"
SERVER_JS="${APPHOSTING_DIR}/server.js"
TARGET_SERVER_JS="${STANDALONE_DIR}/server.js"
SOURCE_PUBLIC="${SCRIPT_DIR}/../public"
SOURCE_STATIC="${SCRIPT_DIR}/../../.next/static"
TARGET_PUBLIC="${STANDALONE_DIR}/public"
TARGET_STATIC="${STANDALONE_DIR}/.next/static"

echo "Running App Hosting post-build script..."

if [ ! -f "${SERVER_JS}" ]; then
  echo "ERROR: ${SERVER_JS} not found."
  exit 1
fi

mv "${SERVER_JS}" "${TARGET_SERVER_JS}"
echo "Moved server.js to ${TARGET_SERVER_JS}"

if [ -d "${SOURCE_PUBLIC}" ]; then
  cp -R "${SOURCE_PUBLIC}" "${TARGET_PUBLIC}"
  echo "Copied public directory to ${TARGET_PUBLIC}"
fi

if [ -d "${SOURCE_STATIC}" ]; then
  mkdir -p "${TARGET_STATIC}"
  cp -R "${SOURCE_STATIC}"/* "${TARGET_STATIC}/"
  echo "Copied .next/static directory to ${TARGET_STATIC}"
fi

rm -rf "${APPHOSTING_DIR}"
perl -pi -e 's|"distDir":"\./\.\./\.next"|"distDir":".next"|g' "${TARGET_SERVER_JS}"

echo "App Hosting post-build processing complete."
