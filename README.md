# Saizen · v1.4.3

Personal iOS anime client: **Next.js + Capacitor 7 + Swift**. Live Watch resolves installable CDN stream modules to **HLS/MP4** and plays them in a custom native **AVPlayer**. Libtorrent remains available for optional offline work — it is no longer the primary Watch path.

Hayase is UX reference only — this repo does **not** fork Hayase.

## What’s new in 1.4.3

Patch release for **AniList outage resilience** — catalog and lists keep working via Jikan/MAL (in-app / local sideload — not a new GitHub Release IPA):

| Area | Change |
|------|--------|
| **Failover** | AniList stays primary; on outage-class GraphQL errors, enter fallback mode (~20 min TTL or until AniList recovers) |
| **Catalog** | Browse / search / detail / schedule / themes route through Tenrai → public Jikan (MAL IDs mapped back toward AniList when possible) |
| **Lists** | Home personalization prefers MAL when connected during fallback; otherwise stale AniList cache |
| **Banner** | Dismissible “using catalog fallback” chrome while failover is active |
| **Episode titles** | Prefer AniZip / Jikan titles; ignore platform-name streaming labels that appear under MAL fallback |

Design notes: [docs/superpowers/specs/2026-09-07-anilist-jikan-fallback-design.md](./docs/superpowers/specs/2026-09-07-anilist-jikan-fallback-design.md).  
In-app history: Settings → About / Changelog (`apps/web/src/lib/version.ts`).

## What’s new in 1.4.2

Patch release focused on **UI breathing room**, **Home personalization reliability**, and **liquid-glass chrome controls** (in-app / local sideload — not a new GitHub Release IPA):

| Area | Change |
|------|--------|
| **Home hero** | Taller carousel; portrait covers fill edge-to-edge without letterbox bars |
| **Home rails** | Prequels & sequels and genre picks use the same large posters as Popular / Trending |
| **Spacing** | Airier section rhythm on Settings, Appearance, Downloads, Modules, Extensions, Schedule |
| **AniList Home** | Personalized rails load after Keychain hydrate; cache-first paint, background refresh |
| **Appearance** | Transparency slider + optional Frosted blur for the tab bar and top chrome |

In-app history: Settings → About / Changelog (`apps/web/src/lib/version.ts`).

## What’s new in 1.4.1

Patch release focused on **Downloads** stability and faster offline queueing (in-app / local sideload — not a new GitHub Release IPA):

| Area | Change |
|------|--------|
| **Downloads store** | One app-wide queue/library listener — navigate away and back without blank pages or Cap bridge floods |
| **Controls** | Pause / Resume / Cancel / Delete stay responsive (native work off the Cap UI thread + JS timeouts) |
| **Progress** | HTTP: speed + bytes; HLS: percent only (no fake totals); source labels kept |
| **Batch Save** | `resolveStreamsBatch` — cached show lookup, **lastGood** module first — far fewer module searches per episode |
| **Storage cleanup** | Clear cache also removes failed jobs, orphan `.movpkg` / partials, and leftover managed HLS assets |
| **Also** | Modules / Extensions UI refresh, manga detail for relations, appearance polish |

In-app history: Settings → About / Changelog (`apps/web/src/lib/version.ts`).

## What’s new in 1.4.0

Saizen’s playback middleware moved from “search torrents → stream” to “install modules → resolve HTTPS streams → AVPlayer”:

| Area | Before (≤1.3.x) | Now (1.4.0) |
|------|-----------------|-------------|
| **Watch** | Torrent / magnet candidates in the sources sheet | Module stream candidates (HLS/MP4) |
| **Sources** | Extensions + built-in indexes for Play | Settings → **Modules** catalog (install / enable / order) |
| **Player** | VLC-forward with glass chrome | Custom AVPlayer chrome (scrubber, OP/ED skip, gesture seek) |
| **Downloads** | Primarily torrent Save | Module streams preferred; quality-aware batch Save |
| **Privacy** | — | **Incognito Mode** (no list sync / Home continue while on) |

## Features

- **Browse & Home** — Discover rails with View more → Search filters, continue watching, and list-backed shelves after AniList / MAL sign-in; taller hero carousel with consistent large posters; **AniList → Jikan/MAL catalog fallback** when GraphQL is down
- **Search** — Title + Filters sheet (genre, year, season, format, status, sort, in-my-list); session kept when opening anime and returning; keyboard hides the tab bar
- **Anime detail** — Character / VA / staff rails + pages; franchise watch-order Relations; edit list entry; **Continue watching EP xx**; OP/ED song names (tap to copy)
- **Schedule** — Week airing calendar in the tab bar (device-local times); My list vs current season
- **Player** — Custom AVPlayer for CDN HLS/MP4; ±10s / play / next; double/triple-tap seek; speed + aspect; AniSkip OP/ED marks + Skip pill / optional auto-skip; MobileVLCKit only as a probe fallback
- **Downloads** — Settings → Downloads: resilient queue (pause/resume/cancel), accurate progress, fast batch Save via `resolveStreamsBatch`, lock-screen progress, offline library playback; Clear cache sweeps orphan/partial HLS packs
- **Transfers** — Settings: torrent download Mbps cap + max peers (applied live when torrent paths are used)
- **Accounts & lists** — AniList / MAL Sign in (`state` + Keychain-only tokens); Home rails; list sync; delete clears continue-watching without restart
- **Modules** — Settings → Modules: installable Watch/Save sources; HTTPS scripts only; theme catalog fallbacks elsewhere in the app
- **Incognito** — Settings toggle: pause list sync and Home continue; session resume clears when leaving Incognito (downloads stay on disk)
- **UI** — Icon-only frosted tab bar with drag-to-scrub selection (Home / Search / Schedule / More); Puritan + Quando type; Settings → Appearance (accent + liquid-glass transparency / Frosted); immersive Saizen chrome on Home only; swipe-down to dismiss sources
- **Security** — No `NEXT_PUBLIC_*` secrets; AniList Client Secret only in a gitignored local Swift file; Keychain key allowlist; OAuth host allowlist; Cap bridge logging off; authenticated loopback streams; HTTPS-only module/extension loads; CSP meta; secret-scanned IPA packaging

Full security matrix: [docs/SECURITY_TEST_PLAN.md](./docs/SECURITY_TEST_PLAN.md).

## Status

Proven on a physical iPhone for browse → search filters → module streams → AVPlayer, AniList/MAL sign-in and list sync, Schedule (local airing calendar), continue-watching, Incognito, and Downloads (pause/resume/cancel, batch queue, offline library).

This is a **personal sideload** project — not an App Store build. Packaging notes below.

## Repo layout

| Path | Role |
|------|------|
| `apps/web` | Next.js static UI (Capacitor `webDir`) |
| `apps/mobile` | Capacitor iOS shell + sync scripts |
| `packages/shared` | Shared TS types / `window.saizen` contract |
| `ios/App/SaizenCore` | Canonical Swift: modules, player, torrent, HTTP, auth |
| `ios/App/Plugins` | Capacitor plugins (`SaizenModules`, `SaizenPlayer`, `SaizenTorrent`, `SaizenAuth`) |
| `ios/vendor/` | **Gitignored** — build libtorrent here locally |
| `scripts/` | Sync Swift into Cap, build libtorrent, Cap HTML fixups, IPA packaging |
| `docs/` | Native contract, HTTP Range notes, architecture notes, security test plan |

See [STRUCTURE.md](./STRUCTURE.md) for the full tree.

## Prerequisites

- Node **≥ 20**, **pnpm** 10+
- Xcode 15+ (iOS 15 deployment target)
- CocoaPods (`pod` on PATH)
- Physical device recommended
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

**Release policy:** GitHub Release IPAs use **minor** versions only (`1.1`, `1.2`, `1.4`, …). Patch marketing versions (`1.0.1`, `1.3.1`, `1.4.1`, `1.4.2`, `1.4.3`, …) are for in-app / local sideload builds — do not attach a new IPA for those. **v1.4.0** remains the minor architecture IPA; **v1.4.1+** are local sideload patches.

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
pnpm package:ipa              # secret preflight → packs dist/Saizen-v1.4.0.ipa
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

Your device build lives under DerivedData, e.g.:

`~/Library/Developer/Xcode/DerivedData/App-…/Build/Products/Debug-iphoneos/App.app`

There is **no `.ipa` until you package one** — Run in Xcode only produces `.app`. Upload `dist/Saizen-v1.4.0.ipa` as a GitHub Release asset; install with Sideloadly/AltStore (free Apple ID, ~7-day cert).

Expect: no App Store listing, 7-day cert renewals on free IDs, and each installer must trust the certificate on their device.

## Playback path

```
Module catalog (Settings → Modules)
  → JS runtime resolves episode → StreamCandidate (HLS/MP4 + headers)
  → playStream → custom AVPlayer chrome
Optional: torrent/magnet → DownloadCoordinator (offline only)
```

Live Watch ranks module stream candidates and plays via `playStream`. Magnet / `.torrent` rows are not the primary Watch path.

Architecture notes for contributors: [docs/REFERENCE.md](./docs/REFERENCE.md) (behavior-level; no third-party source).

## Providers

**Watch / Save** use **CDN modules** installed under Settings → Modules. NZB is not supported. Module scripts load over **HTTPS only**. Adult index mirrors (when used) may fail over after TLS failure on the device network.

| Built-in | Notes |
|----------|--------|
| **Test Sample** | Offline / progressive pipeline check |

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
- [docs/SECURITY_TEST_PLAN.md](./docs/SECURITY_TEST_PLAN.md)
- [docs/REFERENCE.md](./docs/REFERENCE.md)

## License / intent

Personal sideload project. Do not redistribute copyrighted media. Respect local law and the ToS of any index you query.
