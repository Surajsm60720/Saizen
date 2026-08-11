# Saizen — CDN Watch Middleware (Keep Cap UI)

**Status:** Active design — supersedes full native SwiftUI rewrite for near-term work  
**Date:** 2026-08-11  
**Supersedes for implementation:** [`2026-08-11-native-swiftui-rewrite-design.md`](./2026-08-11-native-swiftui-rewrite-design.md) (deferred; UI rewrite on hold)  
**Companion docs:**
- v1 feature freeze: [`docs/reference/FEATURES_SNAPSHOT_v1.3.3.md`](../../reference/FEATURES_SNAPSHOT_v1.3.3.md)
- Historical pivot notes: [`docs/saizen-native-rewrite-plan.md`](../../saizen-native-rewrite-plan.md) (architecture ideas still useful; repo-layout / SwiftUI phases **not** current)
- Module library: `https://library.cufiy.net/library/` · API `https://library.cufiy.net/api/modules.json`

---

## 1. Problem

Live **Watch** via magnet → libtorrent → Range → VLC is structurally unreliable. The Cap + Next.js UI built over the last weeks is product-valuable and should not be thrown away to fix playback.

## 2. Decision summary (locked)

| Topic | Choice |
|---|---|
| UI | **Keep** Capacitor + Next.js (`apps/web`) — no SwiftUI rewrite, no UI redesign pass |
| Watch transport | **Module-resolved HTTP/HLS → AVPlayer** (Shirox-style), via native Swift middleware |
| Module runtime | **Native `JSContext`** (Approach A) — not the web Hayase extension loader |
| Live torrent Watch | **Dropped** — `playTorrent` must not be the default/primary Watch path |
| Torrent downloads | **Kept** — libtorrent / existing download queue remains an **optional Download** path |
| Reliability | Multi-module fan-out + automatic playback fallback + `lastGoodModule` |
| Module catalog | Sora Module Library (`library.cufiy.net`) + custom HTTPS module URL |
| Player | AVPlayer primary (HLS preferred); MobileVLCKit per-candidate probe fallback only |
| Auth / lists / progress / Incognito / Appearance | **Unchanged** in web — no reimplementation |
| Persistence for modules | Native + bridge (UserDefaults/Keychain/files as needed); web Settings → Modules UI may be thin |

## 3. Target architecture

```
[Existing Next.js UI]
  Home / Search / Schedule / Detail / Settings / Downloads / …
        │
        │ Cap bridge (extend, don't replace)
        ▼
[SaizenCore]
  ModuleRuntime (JSContext session + private URLSession/cookies)
        → StreamResolver → StreamCandidate
        → PlayerRouter → AVPlayer (default) / VLC (probe only)

  DownloadCoordinator
        → HTTP/HLS offline (default Save from stream)
        → torrent/libtorrent download (optional Save)

  Live Watch never uses libtorrent progressive streaming.
```

## 4. What changes vs what stays

### Stays (do not redesign)

- All Cap web screens and chrome (Home, Search, Schedule, detail, Character/Staff, Settings, Appearance, Changelog, glass tab bar, Incognito, list edit, AniSkip wiring in UI, etc.)
- AniList/MAL auth as implemented today (Keychain; no Implicit Grant migration required for this phase)
- Watch-progress threshold + dual sync in web (`lib/watch/*`, `lib/auth/sync.ts`)
- Download **product** UX (queue, folder, Wi‑Fi only, parallel, library) — extend kinds, don’t rebuild the page from scratch
- Security invariants that still apply: HTTPS module/script URLs, Keychain tokens, `spawnPlayer` allowlist (`https` or authorized loopback for **local completed files** only)

### Changes (middleware + minimal bridge/UI glue)

| Area | Change |
|---|---|
| Default Watch | Resolve via modules → `playStream` / resolve-and-play → AVPlayer |
| Sources sheet | Prefer stream candidates (module + quality); magnets not offered for Watch |
| Extensions page | Evolve or add **Modules** management (catalog + custom URL + enable/reorder/health) — functional glue only, not a visual redesign |
| `playTorrent` | Not used for Watch; may remain for advanced/debug or be gated off in UI |
| Downloads | Add enqueue from stream candidate (HLS `AVAssetDownloadTask` / MP4 `URLSession`); **keep** enqueue from torrent/magnet as optional path |
| libtorrent | Retained for **downloadFullFile** / offline torrent jobs only; progressive stream + Range Watch path retired from product Watch |
| HTTPRangeServer | Only for playing **completed local** library files if still needed; not for live torrent progressive Watch |

### Explicitly deferred

- Full native SwiftUI app / new root `Saizen.xcodeproj` product
- AniList Implicit Grant migration
- Throwing away Cap / `packages/shared`
- Removing libtorrent from the binary entirely (downloads still need it)

## 5. Module runtime (same locks as before)

Clean-room contract:

```
searchResults(query) → SearchResult[]
extractEpisodes(showUrl) → Episode[]
extractStreamUrl(episodeUrl) → { streams: [{url, headers?, quality?, title?}], subtitle? }
```

**Resolve session (not per-method):**
- One `JSContext` for the full `searchResults` → `extractEpisodes` → `extractStreamUrl` chain on that module
- Tear down only when that chain completes / fails / cancels
- Parallel fan-out = one session per module; no shared context across modules
- No long-lived global context across unrelated user actions

**Network isolation (mandatory):**
- Each resolve session: dedicated `URLSession` + **private** `HTTPCookieStorage`
- Never `URLSession.shared` / `HTTPCookieStorage.shared` for module `fetch`
- HTTPS-only scripts; bridged `fetch` with host allow/deny

**Catalog:** `https://library.cufiy.net/api/modules.json`; custom HTTPS `scriptUrl` import.

## 6. StreamResolver + player

1. Enabled modules in user priority order  
2. Collect `StreamCandidate`s  
3. Rank: HLS > MP4 → quality → `lastGoodModule` for AniList id  
4. Play top; on **playback** failure advance; surface winning module  
5. Persist `lastGoodModule` + per-module last-success  

**Player:** AVPlayer default + header injection; VLC only after per-candidate probe; lock-screen `MPNowPlayingInfoCenter` when touching player path.

## 7. Downloads (dual path)

| Kind | Mechanism | When |
|---|---|---|
| Stream / CDN | HLS → `AVAssetDownloadTask`; MP4 → background `URLSession` | Default “Save” from stream candidate |
| Torrent | Existing `DownloadCoordinator` + libtorrent `downloadFullFile` | Optional — user picks a torrent/magnet source to download (not Watch) |

UI glue: sources/download pickers expose both where results exist; Watch button never starts libtorrent progressive streaming.

## 8. Bridge contract (minimal)

Extend `packages/shared` + Cap plugins (illustrative — exact names in implementation plan):

- `resolveStreams({ title, anilistId, episode, … })` → ranked candidates (or resolve+play)
- `playStream({ url, headers?, …SpawnPlayerOptions })` → AVPlayer path
- Module CRUD: `listModules` / `installModule` / `setModuleEnabled` / `reorderModules` / `removeModule`
- Downloads: existing enqueue APIs gain `kind: 'http' | 'hls' | 'torrent'` (or equivalent) without breaking current torrent enqueue

Web Watch entrypoints stop calling `playTorrent` for the primary path.

## 9. Day 0 / phased work (Cap tree)

| Phase | Outcome |
|---|---|
| Day 0 | In existing `ios/App/SaizenCore`: one module session → playable URL → bare AVPlayer on device (spike UI optional / debug) |
| 1 | Bridge `playStream` + web Watch uses HTTPS candidate when present |
| 2 | Full ModuleRuntime + StreamResolver + Modules settings glue |
| 3 | Wire detail sources sheet + auto-fallback; retire Watch→torrent |
| 4 | Downloads: HLS/MP4 from candidates; keep torrent download option |
| 5 | Polish: health, `lastGoodModule`, Now Playing; remove dead progressive-torrent Watch code paths from product |

**MVP:** Tap Watch on a real title → module CDN stream plays in AVPlayer with seek; Save can enqueue HLS/MP4; torrent download still available as optional offline path. **No** UI redesign.

## 10. Security

- Module scripts HTTPS-only  
- Session-scoped JSContext + private cookie store  
- `spawnPlayer`: `https` or authorized loopback for local library only  
- No new client secrets  
- Torrent download path keeps existing path-traversal / folder rules  

## 11. Testing

- Day 0 on-device module → AVPlayer  
- Watch never opens libtorrent progressive stream  
- Concurrent module sessions do not share cookies  
- Download: one HLS/MP4 job + one torrent job both still work  
- Existing UI smoke: Home / Search / Schedule / Settings / Incognito / list sync unchanged  

## 12. Approval record

- Keep Cap UI: **yes**  
- Module runtime: **native JSContext (A)**  
- Live torrent Watch: **dropped**  
- Torrent downloads: **kept as option**  
- Full SwiftUI rewrite: **deferred** (spec retained as future option only)
