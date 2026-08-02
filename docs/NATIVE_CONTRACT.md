# Saizen Native Contract

See `packages/shared/src/native.ts` for the TypeScript source of truth.

## window.saizen (Capacitor)

| Method | Status | Notes |
|--------|--------|-------|
| `isApp` | done | `true` on device |
| `playTorrent(source, mediaId, episode)` | done (HTTP progressive) | magnets need libtorrent Day-0 |
| `spawnPlayer({ url, playerHint, title, episode, anilistId, idMal })` | done | VLCKit default when linked; else AVPlayer |
| `playbackProgress` event | done | Native → JS every ~2s; drives local watch store |
| `torrentInfo(hash)` | stub/partial | |
| `checkAvailableSpace()` | done | Documents volume |
| `authAnilist` / `authMAL` | done | ASWebAuthenticationSession → `saizen://` callbacks |
| `getSecureItem` / `setSecureItem` / `deleteSecureItem` | done | Keychain-backed token storage |
| `library` / `cachedTorrents` | stub | Phase 5 |

## Player hint

- `vlc` — default for MKV/HEVC/ASS (anime norm)
- `avplayer` — only when probe says MP4/H.264-compatible
