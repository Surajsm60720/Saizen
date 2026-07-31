# HTTP Range Server (Saizen)

## Role

Serve torrent (or progressive-download) file bytes on `127.0.0.1:PORT` with HTTP `Range` / `206` so **MobileVLCKit** (default) or **AVPlayer** (probe opt-in) can play without a custom byte pipe.

## Rules

1. Bind **loopback only** (`127.0.0.1`), never `0.0.0.0`.
2. Support `GET` + `HEAD`, `Range: bytes=start-end`, respond `206` with `Content-Range`.
3. **Never block a handler thread** waiting for pieces.
4. Unavailable ranges → register continuation on `PieceStore` → return to event loop → resume when bytes arrive.
5. Concurrent ranges must not deadlock (multiple waiters OK).
6. Disconnect / seek-away → cancel waiter; timeout → `503`.
7. Piece prioritization is driven by **incoming Range requests**, not a separate playhead IPC.

## Types involved

- `PieceStore` — byte availability + async `read(range:)`
- `HTTPRangeServer` — Network.framework `NWListener`
- `TorrentEngine` — fills `PieceStore` (progressive HTTP today; libtorrent after Day-0 spike)

## Manual test

```bash
# After playTorrent returns a URL:
curl -v -H "Range: bytes=0-1048575" "http://127.0.0.1:PORT/0/stream"
# Concurrent:
curl -H "Range: bytes=0-65535" URL &
curl -H "Range: bytes=1048576-1114111" URL &
wait
```

## ATS

Add an App Transport Security exception for `localhost` / `127.0.0.1` only in Info.plist.
