# Saizen (最善)

Personal iOS anime client: **Next.js + Capacitor 7 + Swift**, with an in-app BitTorrent engine (libtorrent) that streams to **MobileVLCKit** over a loopback HTTP Range server.

Hayase is UX reference only — this repo does **not** fork Hayase.

## Status (Day-0)

Proven on a physical iPhone:

- AniList browse (CapacitorHttp)
- Hayase-compatible **remote extensions** (catalogs from https://exten.pages.dev) + legacy SubsPlease / Erai / Nyaa (off by default)
- Magnets / `.torrent` URLs → libtorrent metadata + **piece-priority head focus**
- Disk-backed `PieceStore` + loopback `HTTPRangeServer`
- **Early open**: player launches as soon as metadata + local HTTP URL exist (no long warm wait)
- In-player HUD on loopback streams (peers / speed / buffered)
- Progressive **HTTP** sources also stream via PieceStore + Range (open ASAP), not download-then-play
- **VLC** for incomplete Range / MKV (incl. 1080p HEVC + ASS); AVPlayer for complete MP4 when appropriate

Not productized yet: auth, library, polish UI, App Store packaging.

## Repo layout

| Path | Role |
|------|------|
| `apps/web` | Next.js static UI (Capacitor `webDir`) |
| `apps/mobile` | Capacitor iOS shell + sync scripts |
| `packages/shared` | Shared TS types / `window.saizen` contract |
| `ios/App/SaizenCore` | Canonical Swift: torrent, HTTP, player |
| `ios/App/Plugins` | Capacitor plugins (`SaizenTorrent`, `SaizenPlayer`, …) |
| `ios/vendor/` | **Gitignored** — build libtorrent here locally |
| `scripts/` | Sync Swift into Cap, build libtorrent, Cap HTML fixups |
| `docs/` | Native contract, HTTP Range notes, extensions |

See [STRUCTURE.md](./STRUCTURE.md) for the full tree.

## Prerequisites

- Node **≥ 20**, **pnpm** 10+
- Xcode 15+ (iOS 15 deployment target)
- CocoaPods (`pod` on PATH)
- Physical device recommended (BitTorrent + VLC)
- Optional: Boost + Xcode CLT to rebuild libtorrent (`scripts/build-libtorrent-ios.sh`)

## Quick start — web UI

```bash
pnpm install
pnpm dev
```

Open the local Next.js URL → pick anime → **Find sources** → **Test Sample** (bundled / progressive MP4 on native; HTML5 `<video>` on web).

## Native iOS (device)

### 1. Build web + sync Capacitor

```bash
pnpm install
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

## Playback path

```
Provider (magnet | .torrent URL | http URL)
  → SaizenTorrent.playTorrent
  → libtorrent (or ProgressiveHTTP) → PieceStore
  → HTTPRangeServer  http://127.0.0.1:PORT/…/stream
  → focus ~4MB head (+ lookahead); MKV cues/tail deferred
  → open player ASAP (buffering overlay + live stats)
  → SaizenPlayer → MobileVLCKit (MKV / incomplete Range) / AVPlayer (MP4)
```

Download continues in the background while VLC plays from the contiguous head. File-wide “high priority” alone is avoided so mid/tail pieces do not starve the start of the file.

## Providers

Torrent sources come from **Hayase-compatible extensions** (https://exten.pages.dev — sub / dub / multi / hentai catalogs). Manage them in-app under **Extensions**. NZB is not supported. HTTP progressive sources are preferred when an extension returns a direct URL (often faster time-to-first-frame than magnets).

| Built-in | Notes |
|----------|--------|
| **Test Sample** | Offline / progressive pipeline check |
| SubsPlease / Erai / Nyaa | Legacy — off by default |

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm sync:ios` | Build web + Capacitor sync + plugin register + Swift copy |
| `scripts/sync-swift-into-cap.sh` | Copy `ios/App/*` → Cap `App/Saizen/` |
| `scripts/build-libtorrent-ios.sh` | Build ios-arm64 libtorrent into `ios/vendor/` |
| `scripts/register-local-ios-plugins.mjs` | Register local Capacitor plugins |
| `scripts/fix-capacitor-html.mjs` | Fix relative asset paths for WKWebView |

## Docs

- [docs/NATIVE_CONTRACT.md](./docs/NATIVE_CONTRACT.md)
- [docs/HTTP_RANGE_SERVER.md](./docs/HTTP_RANGE_SERVER.md)
- [docs/EXTENSIONS.md](./docs/EXTENSIONS.md)
- [docs/REFERENCE.md](./docs/REFERENCE.md)

## License / intent

Personal sideload project. Do not redistribute copyrighted media. Respect local law and the ToS of any index you query.
