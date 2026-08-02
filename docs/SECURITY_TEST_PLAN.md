# Saizen — Security Findings & Test Plan

Audit date: 2026-08-02 · Version audited: v1.0  
Remediation pass: 2026-08-02 (see status column)

This document lists known security issues and gives reproducible test cases for each.
Every test is written so it can be run on a personal device with no special tooling
beyond Xcode, Safari Web Inspector, `curl`, and `unzip`.

**Legend for status:** `VULNERABLE` = confirmed present in v1.0 · `FIXED` = re-test should fail to reproduce · `MITIGATED` = risk reduced, residual noted.

---

## Findings summary

| ID | Severity | Issue | Status |
|----|----------|-------|--------|
| S-01 | Critical | MAL client secret baked into JS bundle / IPA | **FIXED** |
| S-02 | Critical | Remote extension JS with full privileges | **MITIGATED** (HTTPS-only + tokens no longer in localStorage; full Worker sandbox still TODO) |
| S-03 | High | OAuth tokens mirrored to plaintext `localStorage` | **FIXED** |
| S-04 | High | `webView.isInspectable = true` in release builds | **FIXED** |
| S-05 | High | Loopback stream server had no auth | **FIXED** |
| S-06 | High | `spawnPlayer` accepted any URL | **FIXED** |
| S-07 | High | libtorrent file-index OOB + tick/destroy race | **FIXED** |
| S-08 | Medium | MAL OAuth `state` verified only if present | **FIXED** |
| S-09 | Medium | ATS fully disabled (`NSAllowsArbitraryLoads`) | BY DESIGN / review (HTTP torrent indexes) |
| S-10 | Medium | No React error boundary | **FIXED** |
| S-11 | Medium | No disk quota during download | **MITIGATED** (256 MB free-space gate before play) |
| S-12 | Low | `bytes=-N` suffix ranges mis-parsed | **FIXED** |
| S-13 | Low | MAL refresh failure returned stale token | **FIXED** |
| S-14 | Low | Unguarded `localStorage` writes | **FIXED** |

**Release tooling:** `scripts/preflight-release.sh` + secret-scanning `scripts/package-ipa.sh`. Cursor rule: `.cursor/rules/saizen-security.mdc`.

**Action for you:** rotate the previously leaked MAL client secret in the MAL developer console (treat it as compromised). Rebuild with `pnpm sync:ios`, then `pnpm package:ipa`. Delete any older `dist/Saizen-*.ipa`.

**IPA scan (2026-08-02):** `dist/Saizen-v1.0.ipa` — old secret absent; no `*_SECRET` / `client_secret` identifiers; public Client IDs present (expected). See README “IPA security warning”.

---

## S-01 · MAL client secret ships inside the app (CRITICAL) — FIXED

**Fix:** Removed `NEXT_PUBLIC_MAL_CLIENT_SECRET` from env/code. MAL is public-client + PKCE only. `package-ipa.sh` fails if secret identifiers appear in the bundle.

### Test S-01-a — secret in the web bundle

```bash
# After rebuild — should print nothing
grep -RIn 'MAL_CLIENT_SECRET\|NEXT_PUBLIC_.*SECRET' apps/web/out || echo clean
bash scripts/preflight-release.sh
```

- **Fixed:** preflight passes; no SECRET keys in `.env.local` or bundle.

---

## S-02 · Remote extensions run as trusted code (CRITICAL) — MITIGATED

**Partial fix:** extension `code` URLs must be `https://`; OAuth tokens no longer live in `localStorage` (S-03), so the trivial exfil path is gone. Full sandbox (Worker / iframe) is still future work.

### Test S-02-a

HTTP extension URLs must be rejected:

```js
// In a temp catalog entry with http://…/evil.js — load should throw
// "code URL must be https://"
```

Token read from localStorage after sign-in should be `null` (see S-03).

---

## S-03 · Tokens stored in plaintext localStorage (HIGH) — FIXED

**Fix:** Keychain + in-memory session cache only. `hydrateTokenMirrors` scrubs legacy `saizen.token.*` keys.

### Test S-03-a

```js
localStorage.getItem('saizen.token.anilist')  // null
localStorage.getItem('saizen.token.mal')      // null
```

After reload, still `null`. Sign-in still works via Keychain.

---

## S-04 · Web Inspector in release builds (HIGH) — FIXED

**Fix:** `isInspectable` wrapped in `#if DEBUG` in `AppDelegate.swift`.

### Test S-04

Release build on device → Safari Develop menu should **not** list Saizen.

---

## S-05 · Unauthenticated loopback stream server (HIGH) — FIXED

**Fix:** per-session random path token: `http://127.0.0.1:PORT/{token}/0/stream`. Requests without the token get `401`. Wildcard CORS removed.

### Test S-05-b

```js
// While playing — scanning bare /0/stream must NOT succeed
for (let p = 49152; p < 49500; p++) {
  fetch(`http://127.0.0.1:${p}/0/stream`, { method: 'HEAD' })
    .then(r => r.ok && console.warn('OPEN STREAM', p))
    .catch(() => {})
}
```

- **Fixed:** no open streams without the token path.

---

## S-06 · `spawnPlayer` accepts any URL (HIGH) — FIXED

**Fix:** allowlist `https://` and `http://127.0.0.1|localhost` only.

### Test S-06

```js
await window.saizen.spawnPlayer({ url: 'file:///etc/passwd', playerHint: 'vlc', title: 'probe' })
// → reject: Playback URL not allowed
```

---

## S-07 · libtorrent bridge memory safety (HIGH) — FIXED

**Fix:** `pick_video_file` returns `-1` on empty file lists; `handle_metadata` bails; `saizen_lt_tick` holds the session mutex for the whole alert pump; `destroy` waits for that lock.

### Test S-07-b

Run under Thread Sanitizer / Address Sanitizer; rapid start/stop 50× — no races/UAF.

---

## S-08 · MAL OAuth `state` (MEDIUM) — FIXED

**Fix:** require `res.state === expected`; fail closed if missing.

### Test S-08

```js
sessionStorage.removeItem('saizen:mal:state')
// finish MAL sign-in → must throw "MAL OAuth state mismatch"
```

---

## S-09 · ATS disabled (MEDIUM — intentional)

Still `NSAllowsArbitraryLoads` for HTTP torrent indexes. Prefer HTTPS sources when available. Extension code fetch is HTTPS-only (S-02).

---

## S-10 · No error boundary (MEDIUM) — FIXED

Added `apps/web/src/app/error.tsx` and `global-error.tsx`.

---

## S-11 · Disk quota (MEDIUM) — MITIGATED

`playTorrent` rejects when free space &lt; 256 MB. Full piece-window caps still TODO.

---

## S-12 · HTTP Range edge cases (LOW) — FIXED

Suffix `bytes=-N` handled; multi-range rejected with `416`; header idle timeout ~15s.

---

## S-13 · Stale MAL token (LOW) — FIXED

Refresh failure clears MAL tokens (`clearMalToken`) and returns `null`.

---

## S-14 · Unguarded localStorage writes (LOW) — FIXED

`try/catch` around progress / continue / episode-meta / extension registry writes.

---

## Pre-release checklist

```bash
bash scripts/preflight-release.sh
pnpm sync:ios
# Xcode build (Release preferred)
bash scripts/package-ipa.sh
# or: pnpm package:ipa
```

All gates must pass. Delete any IPA created before this remediation pass.
