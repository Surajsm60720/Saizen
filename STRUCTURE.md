# Saizen — Project Structure

```
Saizen/
├── apps/
│   ├── web/                          # SvelteKit UI (Capacitor webDir)
│   │   └── src/
│   │       ├── lib/
│   │       │   ├── anilist/          # GraphQL client
│   │       │   ├── providers/        # Erai / SubsPlease / Nyaa / Test Sample
│   │       │   ├── native/           # window.saizen bridge
│   │       │   └── …
│   │       └── routes/app/           # home, anime/[id], player, …
│   └── mobile/                       # Capacitor shell
│       └── ios/App/                  # Xcode workspace (Pods gitignored)
├── packages/
│   └── shared/                       # TS contracts (SaizenNative, TorrentFile)
├── ios/
│   ├── App/                          # Canonical Swift (source of truth)
│   │   ├── Plugins/
│   │   │   ├── SaizenTorrent/
│   │   │   ├── SaizenPlayer/
│   │   │   └── SaizenAuth/
│   │   └── SaizenCore/
│   │       ├── HTTP/HTTPRangeServer.swift
│   │       ├── Torrent/              # LibtorrentEngine, PieceStore, Bridge
│   │       └── Player/PlayerRouter.swift
│   ├── spike/LibtorrentSpike/        # Optional bare libtorrent spike
│   └── vendor/                       # GITIGNORED — local libtorrent build
├── docs/
├── scripts/
│   ├── sync-swift-into-cap.sh
│   ├── build-libtorrent-ios.sh
│   ├── register-local-ios-plugins.mjs
│   └── fix-capacitor-html.mjs
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── STRUCTURE.md
└── README.md
```

## Data flow (playback)

```
UI (provider → magnet | torrentUrl | httpUrl)
  → window.saizen.playTorrent(source)
  → SaizenTorrent / HybridTorrentEngine
  → LibtorrentEngine (magnet or .torrent file)
  → PieceStore (disk) ← piece_finished / read_piece
  → HTTPRangeServer streams Range on 127.0.0.1
  → warm head (+ MKV tail)
  → SaizenPlayer → MobileVLCKit (default) | AVPlayer (MP4)
```

## What is generated vs committed

| Committed | Generated / local only |
|-----------|-------------------------|
| `ios/App/**` Swift (source of truth) | `ios/vendor/**` (except `README.md`) |
| Cap copy `apps/mobile/.../App/Saizen/**` (synced; re-run sync after Swift edits) | `Pods/`, `node_modules/`, `.pnpm-store/` |
| `Podfile`, `Podfile.lock` | Xcode `xcuserdata`, DerivedData |
| `sample-test.mp4` (~1 MB) | |
