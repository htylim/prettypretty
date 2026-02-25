#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build"
MASTER_ICON="$BUILD_DIR/icon-master.png"
PNG_ICON="$BUILD_DIR/icon.png"
ICO_ICON="$BUILD_DIR/icon.ico"
ICNS_ICON="$BUILD_DIR/icon.icns"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

resolve_app_builder() {
  local app_builder_arch
  case "$(uname -m)" in
    arm64 | aarch64) app_builder_arch="arm64" ;;
    x86_64 | amd64) app_builder_arch="amd64" ;;
    *)
      echo "Unsupported CPU architecture for app-builder icon generation." >&2
      exit 1
      ;;
  esac

  local candidate
  for candidate in "$ROOT_DIR"/node_modules/.pnpm/app-builder-bin@*/node_modules/app-builder-bin/mac/app-builder_"$app_builder_arch"; do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  echo "Could not locate app-builder binary in node_modules. Run pnpm install first." >&2
  exit 1
}

if [ "$(uname -s)" != "Darwin" ]; then
  echo "Icon generation currently supports macOS only (required for .icns)." >&2
  exit 1
fi

require_command magick

APP_BUILDER="$(resolve_app_builder)"

mkdir -p "$BUILD_DIR"

magick -size 1024x1024 gradient:'#0B1220-#146C94' \
  \( +clone -alpha transparent -fill white -stroke none -draw "roundrectangle 64,64 960,960 220,220" \) \
  -compose copyopacity -composite \
  -stroke none \
  -fill 'rgba(255,255,255,0.16)' -draw "roundrectangle 132,122 892,476 150,150" \
  -fill 'rgba(15,33,62,0.30)' -draw "roundrectangle 168,560 856,846 100,100" \
  -font 'Helvetica-Bold' -fill white -pointsize 360 -kerning -20 -gravity center -annotate +0-6 '{}' \
  -define png:color-type=6 -depth 8 \
  "$MASTER_ICON"

cp "$MASTER_ICON" "$PNG_ICON"
magick "$MASTER_ICON" -define icon:auto-resize=256,128,64,48,32,16 "$ICO_ICON"

TEMP_SIZED_INPUT="$BUILD_DIR/1024x1024.png"
cp "$MASTER_ICON" "$TEMP_SIZED_INPUT"
"$APP_BUILDER" icon --input "$TEMP_SIZED_INPUT" --format icns --out "$BUILD_DIR" >/dev/null
rm -f "$TEMP_SIZED_INPUT"

file "$PNG_ICON" "$ICO_ICON" "$ICNS_ICON"
