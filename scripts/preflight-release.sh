#!/usr/bin/env bash
# Pre-release security gate. Run before packaging an IPA or pushing a release.
# Exit 0 = clean. Exit non-zero = do not ship.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAIL=0

echo "==> Saizen preflight-release"

# 1. Never track env secrets or IPAs
if git -C "$ROOT" ls-files | grep -Ei '\.env($|\.)|\.ipa$' | grep -v '\.env\.example' >/dev/null; then
  echo "FAIL: env/ipa files are tracked by git"
  git -C "$ROOT" ls-files | grep -Ei '\.env($|\.)|\.ipa$' | grep -v '\.env\.example'
  FAIL=1
else
  echo "ok: no env/ipa tracked"
fi

# 2. .env.local must not define *SECRET
ENV_LOCAL="${ROOT}/apps/web/.env.local"
if [[ -f "$ENV_LOCAL" ]] && grep -E '^[A-Z0-9_]*SECRET=' "$ENV_LOCAL" >/dev/null; then
  echo "FAIL: $ENV_LOCAL still defines a SECRET key — remove it (use public MAL client + PKCE)"
  FAIL=1
else
  echo "ok: no SECRET keys in .env.local"
fi

# 3. Source must not reference NEXT_PUBLIC_*_SECRET
if grep -RIn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' \
  -E 'NEXT_PUBLIC_[A-Z0-9_]*SECRET|process\.env\.NEXT_PUBLIC_MAL_CLIENT_SECRET' \
  "$ROOT/apps/web/src" "$ROOT/packages" 2>/dev/null | grep -v 'SECURITY' | head -20; then
  echo "FAIL: source still references NEXT_PUBLIC_*SECRET"
  FAIL=1
else
  echo "ok: no NEXT_PUBLIC_*SECRET in source"
fi

# 4. Web Inspector gated by DEBUG
if ! grep -n 'isInspectable' "$ROOT/apps/mobile/ios/App/App/AppDelegate.swift" | grep -B2 -A2 'DEBUG' >/dev/null; then
  # Check for #if DEBUG wrapping
  if grep -A3 'isInspectable' "$ROOT/apps/mobile/ios/App/App/AppDelegate.swift" | grep -q '#if DEBUG'; then
    :
  fi
fi
if grep -n 'isInspectable' "$ROOT/apps/mobile/ios/App/App/AppDelegate.swift" >/dev/null; then
  if awk '/#if DEBUG/{d=1} /isInspectable/{if(d) ok=1} /#endif/{d=0} END{exit ok?0:1}' \
    "$ROOT/apps/mobile/ios/App/App/AppDelegate.swift"; then
    echo "ok: isInspectable gated by #if DEBUG"
  else
    echo "FAIL: isInspectable is not inside #if DEBUG"
    FAIL=1
  fi
fi

# 5. Built web out/ must not contain a secret from .env.local (if any leftover)
if [[ -d "$ROOT/apps/web/out" && -f "$ENV_LOCAL" ]]; then
  while IFS= read -r line; do
    case "$line" in
      ''|\#*) continue ;;
      *SECRET*=*)
        val="${line#*=}"
        if [[ -n "$val" ]] && grep -RIq -F -- "$val" "$ROOT/apps/web/out" 2>/dev/null; then
          echo "FAIL: secret value from .env.local found in apps/web/out — rebuild after removing it"
          FAIL=1
        fi
        ;;
    esac
  done < "$ENV_LOCAL"
fi

# 6. Tokens must not be mirrored to localStorage
if grep -n 'localStorage.setItem(PREFIX' "$ROOT/apps/web/src/lib/auth/tokens.ts" >/dev/null 2>&1; then
  echo "FAIL: tokens.ts still writes PREFIX keys to localStorage"
  FAIL=1
else
  echo "ok: tokens not written to localStorage"
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo ""
  echo "Preflight FAILED — do not package or publish."
  exit 1
fi

echo ""
echo "Preflight PASSED."
echo "Next: pnpm sync:ios → Xcode build → bash scripts/package-ipa.sh"
