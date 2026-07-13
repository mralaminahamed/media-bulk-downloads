#!/usr/bin/env bash
# Generate/refresh the Safari Web Extension Xcode wrapper from the built
# extension. macOS + full Xcode.app only — safari-web-extension-converter ships
# with Xcode, NOT with the Command Line Tools.
#
# Usage (from the repo root, after `yarn build:safari`):
#   ./apps/safari-native/convert.sh            # macOS target (default)
#   PLATFORM=ios ./apps/safari-native/convert.sh   # iOS/iPadOS target
#   PLATFORM=all ./apps/safari-native/convert.sh   # both macOS + iOS targets
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUILD_DIR="$REPO_ROOT/apps/extension/.output/safari-mv3"
OUT_DIR="$REPO_ROOT/apps/safari-native"
APP_NAME="Media Bulk Downloads"
BUNDLE_ID="com.mralaminahamed.mediabulkdownloads"

# Target platform → converter flags. Empty for `all` (converter builds both).
PLATFORM="${PLATFORM:-macos}"
case "$PLATFORM" in
  macos) PLATFORM_FLAGS=(--macos-only) ;;
  ios)   PLATFORM_FLAGS=(--ios-only) ;;
  all)   PLATFORM_FLAGS=() ;;
  *) echo "error: PLATFORM must be macos|ios|all (got '$PLATFORM')." >&2; exit 1 ;;
esac

if [[ "$(uname)" != "Darwin" ]]; then
  echo "error: Safari conversion requires macOS + Xcode." >&2
  exit 1
fi
if ! command -v xcrun >/dev/null 2>&1; then
  echo "error: xcrun not found — install the Xcode Command Line Tools (xcode-select --install)." >&2
  exit 1
fi
# xcrun exists with Command Line Tools alone, but the converter ships only with
# the full Xcode.app — check for it directly so the failure is actionable, not a
# raw "unable to find utility" from xcrun.
if ! xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  echo "error: safari-web-extension-converter not found." >&2
  echo "       It ships with the full Xcode.app, not the Command Line Tools." >&2
  echo "       Install Xcode from the App Store, then point the toolchain at it:" >&2
  echo "         sudo xcode-select -s /Applications/Xcode.app/Contents/Developer" >&2
  exit 1
fi
if [[ ! -f "$BUILD_DIR/manifest.json" ]]; then
  echo "error: $BUILD_DIR/manifest.json not found. Run 'yarn build:safari' first." >&2
  exit 1
fi

xcrun safari-web-extension-converter "$BUILD_DIR" \
  --project-location "$OUT_DIR" \
  --app-name "$APP_NAME" \
  --bundle-identifier "$BUNDLE_ID" \
  ${PLATFORM_FLAGS[@]+"${PLATFORM_FLAGS[@]}"} \
  --no-open \
  --force

PROJECT_DIR="$OUT_DIR/$APP_NAME"
PBXPROJ="$PROJECT_DIR/$APP_NAME.xcodeproj/project.pbxproj"
BUILD_BASENAME="$(basename "$BUILD_DIR")"

# Fix the converter's off-by-one resource paths. In a nested monorepo layout it
# computes each build reference from the App-Extension subfolder depth, yet the
# Resources group is anchored at SOURCE_ROOT (the project dir) — one level
# shallower — so every reference (manifest.json, background.js, content-scripts,
# …) is one "../" too deep and Xcode can't find it (the wrapper would build with
# NO extension inside). Strip exactly one leading "../" from the paths that point
# at our build output, keyed on the build dir's basename so the app target's own
# resources are left untouched. macOS/BSD sed (this script is macOS-only).
if [[ -f "$PBXPROJ" ]]; then
  sed -i '' -E "/$BUILD_BASENAME/ s#(path = \")\.\./#\1#" "$PBXPROJ"
fi

# Sanity: every build reference must now resolve from the project dir. Fail loud
# rather than emit a wrapper that silently builds without the extension.
missing=0
while IFS= read -r rel; do
  [[ -e "$PROJECT_DIR/$rel" ]] || { echo "  unresolved reference: $rel" >&2; missing=$((missing+1)); }
done < <(grep -oE "path = \"[^\"]*$BUILD_BASENAME[^\"]*\"" "$PBXPROJ" | sed 's/path = "//;s/"$//')
if [[ "$missing" -gt 0 ]]; then
  echo "error: $missing extension resource reference(s) do not resolve after the path-fix." >&2
  echo "       The converter's layout assumptions may have changed — inspect $PBXPROJ." >&2
  exit 1
fi

echo
echo "✔ Xcode project generated: $PROJECT_DIR"
echo
echo "Next:"
echo "  1. open \"$PROJECT_DIR/$APP_NAME.xcodeproj\""
echo "  2. Signing & Capabilities → set your Development Team (macOS + any iOS target)."
echo "  3. Run (⌘R) to load it in Safari. For local testing, enable:"
echo "       Safari → Settings → Advanced → 'Show features for web developers',"
echo "       then Develop → 'Allow unsigned extensions'."
echo "  4. Verify Safari registered it:"
echo "       pluginkit -mAvvv -p com.apple.Safari.web-extension"
echo "  5. Release: bump the version in Xcode (it does NOT sync from manifest.json),"
echo "     then Product → Archive. See docs/store-submissions/SAFARI_APPSTORE.md."
