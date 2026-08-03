# Saizen · v1.0.3

Personal iOS anime client: **Next.js + Capacitor 7 + Swift**, with an in-app BitTorrent engine (libtorrent) that streams to **MobileVLCKit** over a loopback HTTP Range server.

Hayase is UX reference only — this repo does **not** fork Hayase.

## Changelog

### v1.0.3 — Typography, themes & airing calendar

**Typography**

- Display font **Fraunces** + UI/body **DM Sans** (replaces Instrument)
- Shared type roles in CSS: brand, hero title, page title, section, subhead, body, meta — used across Home, anime, rails, settings, schedule

**Schedule**

- Bottom / desktop nav: **Schedule** replaces the Client tab
- Week calendar strip (Mon–Sun + local dates); airings placed by **device-local** weekday and clock time
- **My list** (Watching / Rewatching) and **Season** (full current-season airing board) toggle
- Day agenda timeline with local times; tap a row to open the anime page

**Opening & Ending**

- AnimeThemes clips still open on tap; secondary control opens the AnimeThemes anime page

### v1.0.2 — Cast, relations & list editing

**Anime detail**

- Separate **Characters**, **Voice actors**, and **Staff** rails (cards link to in-app detail pages)
- New **/app/character** and **/app/staff** pages (AniList bios, appearances, voice roles, crew credits)
- **Relations** tab: walks AniList prequel/sequel/spin-off links and shows a numbered **watch-order** poster rail (no Mermaid diagram; ordering is local after the franchise fetch)
- **Edit list entry** sheet (status, score 0–10, progress, rewatched times) when AniList and/or MAL is connected — saves to both providers; Delete supported

**List sync & accounts**

- Watching / list status no longer defaults to **Plan to watch** when a list lookup fails — Save stays blocked until the entry loads (or is confirmed missing)
- AniList Home rails and list progress use a corrected score field (broken GraphQL selection had emptied rails)
- After AniList sign-in (and Settings → Refresh list), viewer lists warm so episode marks and Home rails match the account
- Offline episode completions flush to connected providers when you reconnect
- MAL sign-in token exchange runs natively (URLSession + PKCE). Register the MAL API app as **iOS** or **other** (public client — no secret); redirect `saizen://mal/callback`

**Fixes**

- Finished titles use AniList’s episode count so franchise/AniZip mappings no longer inflate lists (e.g. K-On)
- Hentai catalog / Sukebei: safer extension media payload, prefer magnet from infohash, native fetch User-Agent, consistent adult catalog gating

### v1.0.1 — Media player redesign

**Player (native VLC + web)**

- Chrome restyled to match the app (gold accent, glass chips, cinematic scrims)
- Transport: ±5s / ±10s, play/pause, **Next episode**
- Speed picker; native **Audio** / **Subs** track sheets; quality chip (current resolution)
- **Volume** button opens a vertical slider panel (no cramped horizontal slider)
- Torrent download stats moved into a compact bottom pill (not centered over video)
- Portrait / landscape layout fixes: volume pinned visible, shorter landscape bar, top bar flush under the safe area
- AniSkip OP/ED: skip pill while inside an opening/ending; optional **Auto-skip openings & endings** in Settings → Playback (default off)
- Fixed controls dismissing on every button tap; removed mid-play Sources chip
- AniSkip client fixed (`episodeLength` required by API); `spawnPlayer` / native contract extended with `skipTimes`, `resolution`, `autoSkipOpEd`, `hasNextEpisode`, and `playerAction` (`nextEpisode`)

**Security hardening (same release)**

- No OAuth client secrets in the app — MAL is a public/installed client (PKCE only)
- Access tokens live in Keychain (+ session memory); never mirrored to `localStorage`
- Loopback stream URLs include a per-session access token (`401` without it)
- `spawnPlayer` allowlists `https://` and `http://127.0.0.1` only
- Web Inspector (`isInspectable`) gated to Debug builds
- Extension code URLs must be `https://`
- MAL OAuth `state` verified fail-closed; refresh failures clear credentials
- React error boundaries; guarded `localStorage` writes; free-space gate before play
- Release packaging runs a secret scan (`pnpm package:ipa`) and fails closed on leaks

Full test matrix: [docs/SECURITY_TEST_PLAN.md](./docs/SECURITY_TEST_PLAN.md).

## Status

Proven on a physical iPhone for browse → sources → torrent/HTTP stream → VLC playback, AniList/MAL sign-in and list sync, plus Schedule (local airing calendar).

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

**Release policy:** GitHub Release IPAs use **minor** versions only (`1.1`, `1.2`, …). Patch marketing versions (`1.0.1`, `1.0.2`, `1.0.3`, …) are for in-app / local sideload builds — do not attach a new IPA for those.

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
pnpm package:ipa              # secret preflight → packs dist/Saizen-v1.0.ipa
```

### IPA security warning (read before uploading a Release)

`package-ipa.sh` **fails closed** if a client secret or `NEXT_PUBLIC_*SECRET` string appears in the `.app` / IPA.

| What you may see in the IPA | OK? |
|-----------------------------|-----|
| `NEXT_PUBLIC_ANILIST_CLIENT_ID` / `NEXT_PUBLIC_MAL_CLIENT_ID` (public OAuth Client IDs) | Yes — required for Sign in |
| Any `*_SECRET`, `client_secret`, or `malClientSecret` | **No — do not ship** |
| OAuth access/refresh tokens | **No — must never be baked in** |

**Rules:**

1. Only public Client IDs go in `apps/web/.env.local`. Register MAL as **iOS** or **other** (public client, PKCE, **no secret**). Web-type MAL apps are not supported.
2. If a secret was ever present in an older build, **rotate it** in the provider console and rebuild — treat the old value as compromised.
3. Always use `pnpm package:ipa` (or `bash scripts/preflight-release.sh` then `bash scripts/package-ipa.sh`). Do not zip an `.app` by hand for public releases.
4. Re-scan before upload: `bash scripts/preflight-release.sh` and confirm the packaged IPA has no `*_SECRET` identifiers.

**Last scanned:** `dist/Saizen-v1.0.ipa` (~19 MB) — no `*_SECRET` / `client_secret` identifiers; public Client IDs present (expected); token paths scrub `localStorage` and use Keychain; extension loads require `https://`.

Your device build lives under DerivedData, e.g.:

`~/Library/Developer/Xcode/DerivedData/App-…/Build/Products/Debug-iphoneos/App.app`

There is **no `.ipa` until you package one** — Run in Xcode only produces `.app`. Upload `dist/Saizen-v1.0.ipa` as a GitHub Release asset; install with Sideloadly/AltStore (free Apple ID, ~7-day cert).

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

Torrent sources come from **Hayase-compatible extensions** (https://exten.pages.dev). Manage them in-app under **Extensions**. NZB is not supported. HTTP progressive sources are preferred when an extension returns a direct URL. Extension JS is fetched over **HTTPS only**.

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
