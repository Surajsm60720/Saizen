# Libtorrent Day-0 Spike

**Goal:** Link libtorrent into the Capacitor iOS app and open a peer connection on a **physical device**, then stream via `PieceStore` + `HTTPRangeServer`.

## Status

| Piece | State |
|---|---|
| Player + bundled MP4 | ✅ working |
| `LibtorrentBridge` C API + Swift `LibtorrentEngine` | ✅ code landed |
| `libtorrent.a` ios-arm64 build | ✅ `ios/vendor/libtorrent-ios/lib/libtorrent.a` |
| Xcode link flags (`SAIZEN_HAS_LIBTORRENT=1`) | ✅ wired in App.xcodeproj |

## Build libtorrent (device arm64)

```bash
# once: brew install boost-build boost
chmod +x scripts/build-libtorrent-ios.sh
./scripts/build-libtorrent-ios.sh
# → ios/vendor/libtorrent-ios/lib/libtorrent.a
```

Takes 10–40 minutes. Needs network the first time (clones libtorrent + boost sources).

## Wire into Xcode (after `.a` exists)

1. Add to **App** target:
   - `LibtorrentBridge.cpp`, `LibtorrentBridge.h`, `LibtorrentEngine.swift`
   - Library: `ios/vendor/libtorrent-ios/lib/libtorrent.a`
2. Build settings:
   - `SWIFT_OBJC_BRIDGING_HEADER` = `App/Saizen-Bridging-Header.h`
   - `HEADER_SEARCH_PATHS` += `$(PROJECT_DIR)/../../../vendor/libtorrent-ios/include` (adjust path)
   - `OTHER_CFLAGS` / `OTHER_CPLUSPLUSFLAGS` += `-DSAIZEN_HAS_LIBTORRENT=1`
   - `OTHER_LDFLAGS` += `-lc++` (and the `.a`)
   - Compile `LibtorrentBridge.cpp` as C++ (`-std=c++17`)
3. Clean + Run on **physical iPhone**.

## Prove Day-0

Play Test Sample **Sintel magnet** (or any small magnet). Console should show:

```text
[Saizen][lt] libtorrent session created
[Saizen][lt] magnet added (waiting for metadata)
[Saizen][lt] peer connect: …
[Saizen][lt] metadata: …
```

Then AVPlayer/VLCKit opens `http://127.0.0.1:PORT/0/stream`.

## Pivot

If iOS link fails after reasonable effort → embedded Node + WebTorrent sidecar. Keep ProgressiveHTTP + player path either way.

## Limits (Day-0)

- In-memory `PieceStore` capped at **~400MB** per active file (disk-backed next).
- Sequential download; seeking distant ranges may wait.
- Device-only (`arm64`) first; simulator slice later.
