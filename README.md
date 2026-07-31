# Saizen (最善)

Personal iOS anime client: **SvelteKit + Capacitor 7 + Swift**, with an in-app BitTorrent engine (libtorrent) that streams to **MobileVLCKit** over a loopback HTTP Range server.

Hayase is UX reference only — this repo does **not** fork Hayase.

## Status (Day-0)

Proven on a physical iPhone:

- AniList browse (CapacitorHttp)
- Erai-raws / SubsPlease magnets → libtorrent metadata + download
- Disk-backed `PieceStore` + loopback `HTTPRangeServer`
- Warm head + MKV tail, then **VLC** playback (incl. 1080p HEVC + ASS)

Not productized yet: auth, library, polish UI, App Store packaging.

## Repo layout

| Path | Role |
|------|------|
| `apps/web` | SvelteKit UI (Capacitor `webDir`) |
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

Open http://localhost:5173 → pick anime → **Find sources** → **Test Sample** (bundled / progressive MP4 on native; HTML5 `<video>` on web).

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
Provider (magnet | .torrent URL | http test)
  → SaizenTorrent.playTorrent
  → libtorrent → PieceStore (Documents/Saizen/pieces)
  → HTTPRangeServer  http://127.0.0.1:PORT/0/stream
  → warm head (+ MKV tail)
  → SaizenPlayer.spawnPlayer → MobileVLCKit (MKV) / AVPlayer (MP4)
```

## Providers

| Provider | Notes |
|----------|--------|
| **Test Sample** | Offline / progressive pipeline check |
| **Erai-raws** | AnimeTosho RSS; prefers `.torrent` URL when available |
| **SubsPlease** | JSON API magnets |
| **Nyaa** | Off by default (many ISPs block TLS to nyaa.si) |

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
