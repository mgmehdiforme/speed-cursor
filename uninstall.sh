#!/usr/bin/env bash
set -euo pipefail

UUID="speed-cursor@local"
EXT_BASE_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions"
TARGET_DIR="$EXT_BASE_DIR/$UUID"
APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
DESKTOP_FILE="$APPS_DIR/speed-cursor-settings.desktop"

echo "==> Disabling $UUID..."
if command -v gnome-extensions >/dev/null 2>&1; then
    gnome-extensions disable "$UUID" 2>/dev/null || true
fi

echo "==> Removing files..."
rm -rf "$TARGET_DIR"
rm -f "$DESKTOP_FILE"

echo "✅ Speed Cursor ($UUID) has been uninstalled."
