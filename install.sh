#!/usr/bin/env bash
# install.sh - Copies the built theme files in themes/ into Zed's user themes
# directory (~/.config/zed/themes) so they're available immediately. Zed
# watches that directory and auto-reloads on change, no restart needed.
set -euo pipefail

SRC_DIR="$(dirname "$(realpath "$0")")/themes"
DEST_DIR="$HOME/.config/zed/themes"

mkdir -p "$DEST_DIR"
cp -v "$SRC_DIR"/pkstheme-*.json "$DEST_DIR"/
