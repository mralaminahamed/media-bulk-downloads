#!/usr/bin/env bash
# Regenerate every platform app icon from the master SVG.
#
#   apps/desktop/assets/icon.svg  (master, committed)
#     -> icon.icns   macOS   (deno desktop --icon)
#     -> icon.ico    Windows (deno desktop --icon)
#     -> icon.png    Linux   (deno desktop --icon; 512x512)
#     -> icon-256.png        (README / docs)
#
# Requires: rsvg-convert, iconutil (macOS), sips (macOS), magick (ImageMagick).
# Idempotent: rerun any time the SVG changes. Only the SVG is hand-edited;
# the raster/.icns/.ico artifacts are outputs.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
assets="$(cd "$here/.." && pwd)/assets"
svg="$assets/icon.svg"

[ -f "$svg" ] || { echo "missing master: $svg" >&2; exit 1; }
for bin in rsvg-convert magick; do
  command -v "$bin" >/dev/null 2>&1 || { echo "missing tool: $bin" >&2; exit 1; }
done

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

render() { rsvg-convert -w "$1" -h "$1" "$svg" -o "$2"; }

echo "[icons] rendering from $svg"

# --- macOS .icns -----------------------------------------------------------
if command -v iconutil >/dev/null 2>&1; then
  set="$tmp/icon.iconset"
  mkdir -p "$set"
  render 16   "$set/icon_16x16.png"
  render 32   "$set/icon_16x16@2x.png"
  render 32   "$set/icon_32x32.png"
  render 64   "$set/icon_32x32@2x.png"
  render 128  "$set/icon_128x128.png"
  render 256  "$set/icon_128x128@2x.png"
  render 256  "$set/icon_256x256.png"
  render 512  "$set/icon_256x256@2x.png"
  render 512  "$set/icon_512x512.png"
  render 1024 "$set/icon_512x512@2x.png"
  iconutil -c icns "$set" -o "$assets/icon.icns"
  echo "[icons] wrote icon.icns"
else
  echo "[icons] iconutil not found (non-macOS) - skipping .icns"
fi

# --- Windows .ico ----------------------------------------------------------
render 256 "$tmp/ico-256.png"
magick "$tmp/ico-256.png" -define icon:auto-resize=256,128,64,48,32,16 "$assets/icon.ico"
echo "[icons] wrote icon.ico"

# --- Linux / distribution PNGs --------------------------------------------
render 512 "$assets/icon.png"
render 256 "$assets/icon-256.png"
echo "[icons] wrote icon.png (512), icon-256.png"

echo "[icons] done -> $assets"
