# Saizen Native Contract

See `packages/shared/src/native.ts` for the TypeScript source of truth.

## window.saizen (Capacitor)

| Method | Status | Notes |
|--------|--------|-------|
| `isApp` | done | `true` on device |
| `playTorrent(source, mediaId, episode)` | done (HTTP progressive) | magnets need libtorrent Day-0 |
| `spawnPlayer({ url, playerHint, title, episode, anilistId, idMal, resolution, sourceLabel, totalEpisodes, hasNextEpisode, autoSkipOpEd, skipTimes })` | done | VLCKit default when linked; else AVPlayer |
| `playbackProgress` event | done | Native → JS every ~2s; drives local watch store |
| `playerAction` event | done | `{ action: 'nextEpisode' \| 'changeSource', anilistId, episode }` from player chrome |
| `torrentInfo(hash)` | stub/partial | |
| `checkAvailableSpace()` | done | Documents volume |
| `authAnilist` / `authMAL` | done | ASWebAuthenticationSession → `saizen://` callbacks |
| `exchangeMalToken` | done | URLSession form POST + Basic auth (public client / PKCE) |
| `getSecureItem` / `setSecureItem` / `deleteSecureItem` | done | Keychain-backed token storage |
| `enqueueDownload` / `downloadQueue` / `onDownloadProgress` | done | Offline queue (HTTP background + libtorrent) |
| `pauseDownload` / `resumeDownload` / `cancelDownload` | done | |
| `library` / `deleteTorrents` / `playLibraryItem` | done | Persistent offline library. `deleteTorrents` requires a non-empty `hashes`/`ids` list (empty = no-op / reject; no wipe-all). |
| `storageUsage` / `clearCache` | done | Library vs stream-cache bytes |
| `pickDownloadFolder` / `resetDownloadFolder` / `downloadFolder` | done | Security-scoped folder access |
| `updateSettings` | done | Parallel / Wi-Fi / quality |
| `cachedTorrents` | stub | Returns `[]` |

## Player hint

- `vlc` — default for MKV/HEVC/ASS (anime norm)
- `avplayer` — only when probe says MP4/H.264-compatible

## Skip times

`skipTimes` is fetched from AniSkip (`api.aniskip.com`) in JS using MAL id + episode, then passed into `spawnPlayer`. Auto-skip is controlled by watch setting `autoSkipOpEd` (Settings → Playback), not an in-player toggle.

## Downloads

Completed files live under `{chosen folder}/{Show}/{Season}/{original filename}`. Stream cache under `Documents/Saizen/{pieces,torrents,cache}` is still purged after playback. Loopback playback of library items uses a per-session Range token.
