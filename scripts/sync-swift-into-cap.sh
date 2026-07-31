#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/apps/mobile/ios/App/App/Saizen"
rm -rf "$DEST"
mkdir -p "$DEST/SaizenCore" "$DEST/Plugins"
rsync -a "$ROOT/ios/App/SaizenCore/" "$DEST/SaizenCore/"
rsync -a "$ROOT/ios/App/Plugins/" "$DEST/Plugins/"
echo "Copied → $DEST"
find "$DEST" \( -name '*.swift' -o -name '*.h' -o -name '*.cpp' -o -name '*.mm' \) | sort
