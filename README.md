# Saizen · v1.3.2

Personal iOS anime client: **Next.js + Capacitor 7 + Swift**, with an in-app BitTorrent engine (libtorrent) that streams to **MobileVLCKit** over a loopback HTTP Range server.

Hayase is UX reference only — this repo does **not** fork Hayase.

## Features

- **Browse & Home** — Discover rails with View more → Search filters, continue watching, and list-backed shelves after AniList / MAL sign-in
- **Search** — Title + Filters sheet (genre, year, season, format, status, sort, in-my-list); session kept when opening anime and returning; keyboard hides the tab bar
- **Anime detail** — Character / VA / staff rails + pages; franchise watch-order Relations; edit list entry; **Continue watching EP xx**; OP/ED song names (tap to copy)
- **Schedule** — Week airing calendar in the tab bar (device-local times); My list vs current season
- **Player** — Native VLC + in-app chrome; ±seek / next episode; double/triple-tap seek; autoplay-next sources sheet; audio & subtitle tracks; AniSkip OP/ED skip + optional auto-skip
- **Downloads** — Settings → Downloads: pick a folder, queue episodes (all / range / selected), lock-screen progress, offline library playback
- **Transfers** — Settings: torrent download Mbps cap + max peers (applied live to libtorrent)
- **Accounts & lists** — AniList / MAL Sign in (`state` + Keychain-only tokens); Home rails; list sync; delete clears continue-watching without restart
- **Sources** — Hayase-compatible extensions; theme catalog fallbacks; Sukebei/Nyaa mirror failover after TLS failure
- **UI** — Icon-only frosted tab bar with drag-to-scrub selection (Home / Search / Schedule / More); Puritan + Quando type; Settings → Appearance (wheel, hex, live preview)
- **Security** — No `NEXT_PUBLIC_*` secrets; AniList Client Secret only in a gitignored local Swift file; Keychain key allowlist; OAuth host allowlist; Cap bridge logging off; authenticated loopback streams; HTTPS-only extensions; CSP meta; secret-scanned IPA packaging

Full security matrix: [docs/SECURITY_TEST_PLAN.md](./docs/SECURITY_TEST_PLAN.md).

## Status

Proven on a physical iPhone for browse → search filters → sources → torrent/HTTP stream → VLC playback, AniList/MAL sign-in and list sync, Schedule (local airing calendar), continue-watching, and adult index mirror failover.

This is a **personal sideload** project — not an App Store build. Packaging notes below.

## Repo layout

| Path | Role |
|------|------|
| `apps/web` | Next.js static UI (Capacitor `webDir`) |
| `apps/mobile` | Capacitor iOS shell + sync scripts |
| `packages/shared` | Shared TS types / `window.saizen` contract |
| `ios/App/SaizenCore` | Canonical Swift: torrent, HTTP, player, auth |
| `ios/App/Plugins` | Capacitor plugins (`SaizenTorrent`, `SaizenPlayer`, `SaizenAuth`) |
| `ios/vendor/` | **Gitignored** — build libtorrent here locally |
| `scripts/` | Sync Swift into Cap, build libtorrent, Cap HTML fixups, IPA packaging |
| `docs/` | Native contract, HTTP Range notes, extensions, security test plan |

See [STRUCTURE.md](./STRUCTURE.md) for the full tree.

## Prerequisites

- Node **≥ 20**, **pnpm** 10+
- Xcode 15+ (iOS 15 deployment target)
- CocoaPods (`pod` on PATH)
- Physical device recommended (BitTorrent + VLC)
- Optional: Boost + Xcode CLT to rebuild libtorrent (`scripts/build-libtorrent-ios.sh`)
- OAuth (once, as the app developer): set **public** Client IDs in `apps/web/.env.local` — see `.env.example`. Users only **Sign in**; they never create API apps. MAL app type must be **iOS** or **other** (PKCE only). **Never** put a client secret in `NEXT_PUBLIC_*`.
- AniList Authorization Code needs the Client Secret once on your machine: `bash scripts/set-anilist-secret.sh` (writes gitignored `AnilistSecret.local.swift`), then `pnpm sync:ios`. Redirect URL: `saizen://anilist/callback`.

## Quick start — web UI

```bash
pnpm install
pnpm dev
```

Open the local Next.js URL → pick anime → sources → **Test Sample** (bundled / progressive MP4 on native; HTML5 `<video>` on web).

## Native iOS (device)

### 1. Build web + sync Capacitor

```bash
pnpm install
# copy apps/web/.env.example → apps/web/.env.local and fill Client IDs (public IDs only)
# AniList only: bash scripts/set-anilist-secret.sh   # gitignored local secret — not NEXT_PUBLIC
pnpm sync:ios          # builds web, cap sync, registers plugins, copies Swift
cd apps/mobile/ios/App
pod install            # Capacitor + MobileVLCKit
```

Open **`App.xcworkspace`** (not `.xcodeproj`):

```bash
pnpm open:ios
```

### 2. Link libtorrent (once per machine)

Static libs are **not** in git (~GBs). Build locally:

```bash
bash scripts/build-libtorrent-ios.sh
```

This writes `ios/vendor/libtorrent-ios/` (`libtorrent.a`, `libtry_signal.a`, headers).  
In the App target, keep `SAIZEN_HAS_LIBTORRENT=1`, header search paths, and link `libtorrent.a` + `libtry_signal.a` + `libc++` + SystemConfiguration (as already wired in the Cap project after sync).

### 3. Run

Signing → your Team → select iPhone → **Run**.

After Swift changes under `ios/App/`, re-run:

```bash
bash scripts/sync-swift-into-cap.sh
# or full: pnpm sync:ios
```

**Blank WKWebView:** always use `pnpm build` / `pnpm sync:ios` so `scripts/fix-capacitor-html.mjs` rewrites asset URLs for Capacitor.

## Distributing an IPA (without the $99 Apple Developer Program)

**Release policy:** GitHub Release IPAs use **minor** versions only (`1.1`, `1.2`, …). Patch marketing versions (`1.0.1`, `1.0.2`, `1.0.3`, …) are for in-app / local sideload builds — do not attach a new IPA for those. **v1.1.0** is the first minor IPA after v1.0.

Apple’s paid program is required for **App Store**, TestFlight, and long-lived Ad Hoc / enterprise installs. You can still **attach an IPA to a GitHub Release** for yourself / friends via sideloading:

| Method | Needs $99? | Notes |
|--------|------------|--------|
| **Xcode → Run** on your phone | No (free Apple ID) | Best for daily personal use; cert lasts ~7 days |
| **Sideloadly / AltStore / Feather** + IPA | No | Free Apple ID; ~7-day signing; re-sign periodically |
| **GitHub Release asset** (`.ipa`) | No to *host* | Install still needs a sideload tool or a paid cert |
| App Store / TestFlight | **Yes** | Not available on a free account |

**Export an IPA from your local Xcode build (no paid account required to *create* the file):**

```bash
pnpm sync:ios                 # rebuild web + sync Swift
# Build/Run once on a device from Xcode (prefer Release when possible)
pnpm package:ipa              # secret preflight → packs dist/Saizen-v1.3.2.ipa
```

### IPA security warning (read before uploading a Release)

`package-ipa.sh` **fails closed** if a client secret or `NEXT_PUBLIC_*SECRET` string appears in the `.app` / IPA.

| What you may see in the IPA | OK? |
|-----------------------------|-----|
| `NEXT_PUBLIC_ANILIST_CLIENT_ID` / `NEXT_PUBLIC_MAL_CLIENT_ID` (public OAuth Client IDs) | Yes — required for Sign in |
| Any `NEXT_PUBLIC_*SECRET`, or MAL `client_secret` | **No — do not ship** |
| AniList Client Secret baked from `AnilistSecret.local.swift` | **Personal Debug only** — `package-ipa.sh` fails closed if that value appears; strip before a public IPA |
| OAuth access/refresh tokens | **No — must never be baked in** |

**Rules:**

1. Only public Client IDs go in `apps/web/.env.local`. Register MAL as **iOS** or **other** (public client, PKCE, **no secret**). Web-type MAL apps are not supported.
2. AniList Client Secret stays in gitignored `AnilistSecret.local.swift` via `scripts/set-anilist-secret.sh` — never Settings UI, never `NEXT_PUBLIC_*`.
3. If a secret was ever present in an older build or chat/log, **rotate it** in the provider console and rebuild — treat the old value as compromised.
4. Always use `pnpm package:ipa` (or `bash scripts/preflight-release.sh` then `bash scripts/package-ipa.sh`). Do not zip an `.app` by hand for public releases.
5. Re-scan before upload: `bash scripts/preflight-release.sh` and confirm the packaged IPA has no unexpected secret identifiers.

**Last scanned:** `dist/Saizen-v1.1.0.ipa` (~19 MB, 2026-08-04 Release-iphoneos) — no `*_SECRET` / `client_secret` / `malClientSecret` identifiers; public Client IDs present (expected); token paths scrub `localStorage` and use Keychain; extension loads require `https://`.

Your device build lives under DerivedData, e.g.:

`~/Library/Developer/Xcode/DerivedData/App-…/Build/Products/Debug-iphoneos/App.app`

There is **no `.ipa` until you package one** — Run in Xcode only produces `.app`. Upload `dist/Saizen-v1.1.0.ipa` as a GitHub Release asset; install with Sideloadly/AltStore (free Apple ID, ~7-day cert).

Expect: no App Store listing, 7-day cert renewals on free IDs, and each installer must trust the certificate on their device.

## Playback path

```
Provider (magnet | .torrent URL | http URL)
  → SaizenTorrent.playTorrent
  → libtorrent (or ProgressiveHTTP) → PieceStore
  → HTTPRangeServer  http://127.0.0.1:PORT/{token}/…/stream
  → focus ~4MB head (+ lookahead); MKV cues/tail deferred
  → open player ASAP (buffering overlay + live stats)
  → SaizenPlayer → MobileVLCKit (MKV / incomplete Range) / AVPlayer (MP4)
```

Download continues in the background while VLC plays from the contiguous head.

## Providers

Torrent sources come from **Hayase-compatible extensions** (https://exten.pages.dev). Manage them in-app under **Settings → Extensions**. NZB is not supported. HTTP progressive sources are preferred when an extension returns a direct URL. Extension JS is fetched over **HTTPS only**. Adult indexes (Sukebei) may use public Nyaa mirrors when `nyaa.si` TLS is blocked on the device network.

| Built-in | Notes |
|----------|--------|
| **Test Sample** | Offline / progressive pipeline check |
| SubsPlease / Erai / Nyaa | Legacy — off by default |

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm sync:ios` | Build web + Capacitor sync + plugin register + Swift copy |
| `pnpm preflight` | Fail-closed security gate before release |
| `pnpm package:ipa` | Preflight + secret-scanned IPA → `dist/Saizen-v*.ipa` |
| `scripts/sync-swift-into-cap.sh` | Copy `ios/App/*` → Cap `App/Saizen/` |
| `scripts/build-libtorrent-ios.sh` | Build ios-arm64 libtorrent into `ios/vendor/` |
| `scripts/register-local-ios-plugins.mjs` | Register local Capacitor plugins |
| `scripts/set-anilist-secret.sh` | Write gitignored AniList Client Secret for Authorization Code |
| `scripts/fix-capacitor-html.mjs` | Fix relative asset paths for WKWebView |
| `scripts/package-ipa.sh` | Secret-scanned zip of DerivedData `App.app` → `dist/Saizen-v*.ipa` |
| `scripts/preflight-release.sh` | Fail-closed gate: no secrets in env/source/out before release |

## Docs

- [docs/NATIVE_CONTRACT.md](./docs/NATIVE_CONTRACT.md)
- [docs/HTTP_RANGE_SERVER.md](./docs/HTTP_RANGE_SERVER.md)
- [docs/EXTENSIONS.md](./docs/EXTENSIONS.md)
- [docs/SECURITY_TEST_PLAN.md](./docs/SECURITY_TEST_PLAN.md)
- [docs/REFERENCE.md](./docs/REFERENCE.md)

## License / intent

Personal sideload project. Do not redistribute copyrighted media. Respect local law and the ToS of any index you query.
