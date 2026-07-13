#!/bin/bash
set -euo pipefail

REPO="tasjen/daily-report"
APP_NAME="Daily Report"
APP_PATH="/Applications/$APP_NAME.app"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This installer is for macOS only. Windows installers: https://github.com/$REPO/releases/latest" >&2
  exit 1
fi

if [ "$(uname -m)" != "arm64" ]; then
  echo "Only Apple Silicon (arm64) builds are available; this Mac is $(uname -m)." >&2
  exit 1
fi

echo "Looking up the latest release..."
RELEASE_JSON="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest")"
ASSET_URL="$(printf '%s' "$RELEASE_JSON" |
  grep -o '"browser_download_url": *"[^"]*\.app\.tar\.gz"' |
  head -n 1 | cut -d '"' -f 4 || true)"

if [ -z "$ASSET_URL" ]; then
  echo "Could not find a .app.tar.gz asset in the latest release." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Downloading $ASSET_URL"
curl -fL --progress-bar "$ASSET_URL" -o "$TMP_DIR/app.tar.gz"

echo "Installing to $APP_PATH"
osascript -e "quit app \"$APP_NAME\"" 2>/dev/null || true
rm -rf "$APP_PATH"
tar -xzf "$TMP_DIR/app.tar.gz" -C /Applications

# curl downloads carry no quarantine attribute; this is belt-and-braces in
# case the tarball was produced from a quarantined source.
xattr -dr com.apple.quarantine "$APP_PATH" 2>/dev/null || true

echo "Installed. Launching..."
open "$APP_PATH"
