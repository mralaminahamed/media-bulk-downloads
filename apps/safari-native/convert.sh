#!/usr/bin/env bash
# Generate/refresh the Safari Web Extension Xcode wrapper from the built
# extension. macOS + Xcode only (safari-web-extension-converter ships with Xcode).
#
# Usage (from the repo root, after `yarn build:safari`):
#   ./apps/safari-native/convert.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUILD_DIR="$REPO_ROOT/apps/extension/.output/safari-mv3"
OUT_DIR="$REPO_ROOT/apps/safari-native"
APP_NAME="Media Bulk Downloads"
BUNDLE_ID="com.mralaminahamed.mediabulkdownloads"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "error: Safari conversion requires macOS + Xcode." >&2
  exit 1
fi
if ! command -v xcrun >/dev/null 2>&1; then
  echo "error: Xcode Command Line Tools not found (xcrun missing)." >&2
  exit 1
fi
if [[ ! -d "$BUILD_DIR" ]]; then
  echo "error: $BUILD_DIR not found. Run 'yarn build:safari' first." >&2
  exit 1
fi

# --macos-only for now; drop the flag (or add --ios-only) to target iPadOS/iOS.
xcrun safari-web-extension-converter "$BUILD_DIR" \
  --project-location "$OUT_DIR" \
  --app-name "$APP_NAME" \
  --bundle-identifier "$BUNDLE_ID" \
  --macos-only \
  --no-open \
  --force

echo "Xcode project generated under $OUT_DIR. Open it, set your signing team, and run."
