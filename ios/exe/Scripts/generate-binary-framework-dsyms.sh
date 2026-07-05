#!/bin/sh
set -eu

if [ "${PLATFORM_NAME:-}" != "iphoneos" ]; then
  exit 0
fi

if [ "${ACTION:-}" != "install" ]; then
  exit 0
fi

frameworks_dir="${TARGET_BUILD_DIR}/${FRAMEWORKS_FOLDER_PATH}"
dsym_dir="${DWARF_DSYM_FOLDER_PATH}"

if [ ! -d "${frameworks_dir}" ]; then
  echo "warning: embedded frameworks directory does not exist: ${frameworks_dir}"
  exit 0
fi

mkdir -p "${dsym_dir}"

frameworks="
LiveKitWebRTC
Sentry
"

for framework in ${frameworks}; do
  binary="${frameworks_dir}/${framework}.framework/${framework}"
  output="${dsym_dir}/${framework}.framework.dSYM"

  if [ ! -f "${binary}" ]; then
    echo "warning: framework binary not found: ${binary}"
    continue
  fi

  echo "Generating dSYM for ${framework}.framework"
  if ! dsymutil_output="$(dsymutil "${binary}" -o "${output}" 2>&1)"; then
    echo "${dsymutil_output}"
    continue
  fi

  if [ -n "${dsymutil_output}" ]; then
    printf "%s\n" "${dsymutil_output}" | sed "/^warning: no debug symbols in executable/d"
  fi
done
