#!/usr/bin/env bash
# Package a sideloadable .ipa AND refuse to ship known secret leaks.
#
# Usage:
#   bash scripts/package-ipa.sh [path/to/App.app]
#
# Prefers Release-iphoneos, then Debug-iphoneos. Always runs a secret scan
# against the .app bundle before zipping. Fails closed if anything looks like
# a client secret or leftover NEXT_PUBLIC_*_SECRET string.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${ROOT}/dist"
VERSION="1.0"
if [[ -f "${ROOT}/apps/web/src/lib/version.ts" ]]; then
  VERSION="$(grep -E "APP_VERSION = '" "${ROOT}/apps/web/src/lib/version.ts" | head -1 | sed -E "s/.*'([^']+)'.*/\1/" || echo "1.0")"
fi
OUT_IPA="${OUT_DIR}/Saizen-v${VERSION}.ipa"

# --- locate App.app ----------------------------------------------------------
APP_PATH="${1:-}"
find_app() {
  local config="$1"
  find "${HOME}/Library/Developer/Xcode/DerivedData" \
    -path "*/Build/Products/${config}/App.app" \
    ! -path '*/Index.noindex/*' \
    -type d 2>/dev/null | head -1 || true
}

if [[ -z "$APP_PATH" ]]; then
  APP_PATH="$(find_app Release-iphoneos)"
  if [[ -z "$APP_PATH" ]]; then
    APP_PATH="$(find_app Debug-iphoneos)"
  fi
fi

if [[ -z "$APP_PATH" || ! -d "$APP_PATH" ]]; then
  echo "No App.app found. Build/run the app once from Xcode, then re-run:"
  echo "  bash scripts/package-ipa.sh"
  echo "Or pass the path explicitly:"
  echo "  bash scripts/package-ipa.sh /path/to/App.app"
  exit 1
fi

echo "Using App.app:"
echo "  $APP_PATH"
echo ""

# --- secret / leak preflight -------------------------------------------------
echo "==> Secret scan (fail closed)"
FAIL=0

# 1) Any NEXT_PUBLIC_*_SECRET keys must not appear as identifiers in the bundle.
if grep -RIn --exclude='*.png' --exclude='*.jpg' --exclude='*.car' \
  -E 'NEXT_PUBLIC_[A-Z0-9_]*SECRET|MAL_CLIENT_SECRET|malClientSecret' \
  "$APP_PATH" 2>/dev/null | head -20; then
  echo "ERROR: Secret-related identifiers found inside App.app (see above)."
  FAIL=1
fi

# 2) If .env.local still has a secret value, that exact value must not appear.
ENV_LOCAL="${ROOT}/apps/web/.env.local"
if [[ -f "$ENV_LOCAL" ]]; then
  while IFS= read -r line; do
    case "$line" in
      ''|\#*) continue ;;
      *SECRET*=*)
        val="${line#*=}"
        val="${val%$'\r'}"
        if [[ -n "$val" ]] && grep -RIq --exclude='*.png' --exclude='*.jpg' --exclude='*.car' \
          -F -- "$val" "$APP_PATH" 2>/dev/null; then
          echo "ERROR: Value from .env.local key containing SECRET is present in App.app."
          echo "       Remove NEXT_PUBLIC_*_SECRET from .env.local, rebuild, re-sync."
          FAIL=1
        fi
        ;;
    esac
  done < "$ENV_LOCAL"
fi

# 3) Web Inspector must not be forced on in Release-looking payloads
#    (symbol check is soft — AppDelegate is compiled in).
if strings "$APP_PATH/App" 2>/dev/null | grep -q 'isInspectable'; then
  # Soft warning only — DEBUG builds legitimately contain the symbol.
  echo "note: isInspectable symbol present (ok for Debug; gate with #if DEBUG for Release)."
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo ""
  echo "Aborting IPA packaging. Fix leaks, rebuild (pnpm sync:ios), then retry."
  echo "See docs/SECURITY_TEST_PLAN.md and scripts/preflight-release.sh"
  exit 2
fi
echo "Secret scan clean."
echo ""

# --- zip Payload -------------------------------------------------------------
mkdir -p "$OUT_DIR"
STAGE="$(mktemp -d)"
mkdir -p "$STAGE/Payload"
cp -R "$APP_PATH" "$STAGE/Payload/App.app"
(
  cd "$STAGE"
  zip -qr "$OUT_IPA" Payload
)
rm -rf "$STAGE"

# Final post-zip scan of the IPA itself
STAGE2="$(mktemp -d)"
unzip -q "$OUT_IPA" -d "$STAGE2"
if grep -RIq --exclude='*.png' --exclude='*.jpg' --exclude='*.car' \
  -E 'NEXT_PUBLIC_[A-Z0-9_]*SECRET|MAL_CLIENT_SECRET' "$STAGE2" 2>/dev/null; then
  rm -rf "$STAGE2" "$OUT_IPA"
  echo "ERROR: Secret identifiers found inside packed IPA — deleted $OUT_IPA"
  exit 2
fi
rm -rf "$STAGE2"

echo "Packed IPA (safe to sideload / attach to a GitHub Release):"
echo "  $OUT_IPA"
echo "From:"
echo "  $APP_PATH"
echo ""
echo "Install via Sideloadly / AltStore (free Apple ID, ~7-day cert)."
