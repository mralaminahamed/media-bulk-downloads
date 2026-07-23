#!/usr/bin/env bash
# Patch the built macOS .app bundle metadata that `deno desktop` leaves at its
# defaults (bundle id `com.deno.desktop.*`, version 1.0.0), then re-seal the
# adhoc code signature (editing Info.plist breaks the one deno applied).
#
#   ./set-app-metadata.sh "Media Bulk Downloads.app"
#
# Bundle id / name are fixed to the project's convention; the version is read
# from deno.json so it stays a single source of truth.
set -euo pipefail

app="${1:-Media Bulk Downloads.app}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
plist="$app/Contents/Info.plist"

[ -d "$app" ] || { echo "no app bundle: $app" >&2; exit 1; }
[ -f "$plist" ] || { echo "no Info.plist in $app" >&2; exit 1; }

# macOS-only: PlistBuddy + codesign are not present elsewhere. Non-fatal skip.
if [ "$(uname)" != "Darwin" ]; then
  echo "[meta] not macOS - skipping bundle metadata patch"
  exit 0
fi

BUNDLE_ID="com.mralaminahamed.mediabulkdownloads.desktop"
version="$(grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' "$here/../deno.json" | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
version="${version:-0.1.0}"

pb() { /usr/libexec/PlistBuddy -c "$1" "$plist"; }
pb "Set :CFBundleIdentifier $BUNDLE_ID"
pb "Set :CFBundleShortVersionString $version"
pb "Set :CFBundleVersion $version"
echo "[meta] $BUNDLE_ID v$version"

# Re-seal: the plist edit invalidated deno's adhoc signature.
codesign --force --sign - "$app" >/dev/null 2>&1
codesign --verify --strict "$app" && echo "[meta] resigned + verified"
