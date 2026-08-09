#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/apps/mobile/ios/App/App/Saizen"
AUTH_DIR="$ROOT/ios/App/SaizenCore/Auth"
LOCAL_SECRET="$AUTH_DIR/AnilistSecret.local.swift"
EXAMPLE_SECRET="$AUTH_DIR/AnilistSecret.local.swift.example"

if [[ ! -f "$LOCAL_SECRET" ]]; then
  cp "$EXAMPLE_SECRET" "$LOCAL_SECRET"
  echo "Created $LOCAL_SECRET — set AnilistSecretLocal.value to your AniList Client Secret (gitignored)."
fi

rm -rf "$DEST"
mkdir -p "$DEST/SaizenCore" "$DEST/Plugins"
rsync -a "$ROOT/ios/App/SaizenCore/" "$DEST/SaizenCore/"
rsync -a "$ROOT/ios/App/Plugins/" "$DEST/Plugins/"
echo "Copied → $DEST"
find "$DEST" \( -name '*.swift' -o -name '*.h' -o -name '*.cpp' -o -name '*.mm' \) | sort
