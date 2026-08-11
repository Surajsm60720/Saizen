# Saizen Feature Snapshot — v1.3.3 (Capacitor era)

> **Purpose:** Freeze what shipped in the Capacitor + Next.js + libtorrent app.  
> **Use:** Acceptance checklist — product features stay; Watch transport changes under the active design.  
> **Active architecture:** [`docs/superpowers/specs/2026-08-11-cdn-watch-keep-ui-design.md`](../superpowers/specs/2026-08-11-cdn-watch-keep-ui-design.md) (keep Cap UI; CDN Watch; torrent download optional).  
> **Deferred:** full SwiftUI rewrite (`docs/saizen-native-rewrite-plan.md`).  
> **Captured:** 2026-08-11 · App version **1.3.3**

---

## How to read this document

| Tag | Meaning |
|---|---|
| **Required** | Must exist in native v2 (same UX intent; implementation may change) |
| **Remap** | Required, but transport/UI renamed (e.g. torrent client → modules) |
| **Discard** | Explicitly dropped by rewrite plan (do not reintroduce without a new decision) |
| **Partial / Planned** | Incomplete in v1 — carry intent if cheap; otherwise defer |

---

## 1. Screens / routes

| Screen | v1 route | Status for v2 | Notes |
|---|---|---|---|
| Home | `/` | **Required** | Hero carousel, Continue Watching, seasonal/trending/all-time/genre/relation rails |
| Search | `/app/search` | **Required** | Title + filters (genre, year, season, format, status, sort, in-my-list); session kept across navigation |
| Schedule | `/app/schedule` | **Required** | My list vs Season; 7-day local airing calendar |
| Anime detail | `/app/anime` | **Required** | Overview + Relations; episode list; play/download; list edit |
| Character | `/app/character` | **Required** | Bio + appears-in rail |
| Staff | `/app/staff` | **Required** | Bio + voice roles / staff credits |
| Settings | `/app/settings` | **Required** | Hub for accounts, playback, privacy, about |
| Appearance | `/app/appearance` | **Required** | Accent color wheel / presets / live preview |
| Downloads | `/app/downloads` | **Required** (remap offline path) | Queue + offline library; HLS via `AVAssetDownloadTask`, MP4 via `URLSession` |
| Extensions | `/app/extensions` | **Remap** → Modules (+ keep torrent download sources) | Stream modules for Watch; Hayase/torrent catalogs may remain for **Download** only |
| Changelog | `/app/changelog` | **Required** | In-app version history |
| Torrent client | `/app/client` | **Remap** → Modules health | Vestigial in v1 (hardcoded `—`); v2 module management + health replaces this need |
| Web player | `/app/player` | **Discard** | Capacitor web `<video>` fallback — native AVPlayer/VLC only |
| Glass tab bar | `AppShell` | **Required** (native chrome) | Home / Search / Schedule / More; icon-only; keep-alive / scroll memory intent |

---

## 2. Auth & accounts

| Feature | Status for v2 | Notes |
|---|---|---|
| AniList sign-in | **Required** (flow changes) | v1: Authorization Code + native secret exchange. v2 plan: **Implicit Grant** (no client secret). Tokens still Keychain-only |
| MAL sign-in | **Required** | OAuth2 + PKCE; `ASWebAuthenticationSession`; no bundled secret |
| Keychain token storage | **Required** | Never `localStorage` / `sessionStorage` for tokens |
| Sign out per provider | **Required** | |
| Refresh list sync | **Required** | Force refetch + flush pending completions |
| Dual-provider list sync | **Required** | AniList `SaveMediaListEntry` + MAL `PATCH my_list_status`, parallel, independent failures |
| Delete list entry | **Required** | Both providers; clear local continue/progress caches |
| Pending sync flush | **Required** | Replay unsynced completed episodes on reconnect / open |

---

## 3. Metadata sources

| Source | Status for v2 | Used for |
|---|---|---|
| AniList GraphQL | **Required** | Browse, detail (`DETAIL_FIELDS` expansion), list, schedule, search, mutations |
| AnimeThemes.moe | **Required** | OP/ED titles/artists; graceful empty state |
| Jikan (MAL unofficial) | **Required** | OP/ED + episode enrichment fallback |
| Official MAL API (themes) | **Required** | Second themes fallback (client-id header only) |
| AniSkip | **Required** | OP/ED skip timestamps in player |
| AniZip | **Required** | Episode titles / synopsis / thumbs / runtime |
| ARM id mapping | **Required** | AniList ↔ AniDB/MAL/TVDB/TMDB for module queries |
| Hayase torrent catalogs (`exten.pages.dev`) | **Discard** (as Watch transport) | Replaced by community stream-module library |
| Built-in torrent scrapers (SubsPlease/Nyaa/Erai) | **Discard** | |
| Test Sample progressive MP4 | **Partial** | Keep a tiny offline AVPlayer smoke fixture if useful for Day 0 / CI |

**AniList detail fields to port (conceptual parity):**  
`id`, `idMal`, `episodes`, `duration`, `status`, `format`, `averageScore`, `meanScore`, `description`, titles, cover/banner, season/year, source, genres, synonyms, `isAdult`, dates, trailer, studios, characters (+ Japanese VAs), staff, recommendations, relations, `nextAiringEpisode`, `streamingEpisodes`, list entry.

---

## 4. Library / watch progress

| Feature | Status for v2 |
|---|---|
| Continue Watching rail | **Required** |
| Toggle Continue Watching | **Required** |
| Per-episode progress map | **Required** (SwiftData) |
| Mark-watched threshold (70–100%, default 90%) | **Required** |
| Sync on threshold cross | **Required** |
| Episode duration: `~24 min` until probed, then cached real duration | **Required** |
| Incognito session-only progress | **Required** |
| Merge local + AniList CURRENT/REPEATING for continue | **Required** |

---

## 5. Search / Home / Schedule (concrete)

### Home
- Hero carousel (trending + seasonal; continue-watching priority)
- Rails: Popular this season, Trending now, Prequels & sequels (list-backed), For your genres, Popular of all time
- “View more” → Search with preset filters
- Session / snapshot cache for instant return

### Search
- Free-text multi-language titles
- Filters: genre (multi), season, year, format, status, sort, list-membership
- Adult-title handling (gated; v1 tied to Hentai extension — remapped to module/adult policy)
- Persist search session across detail navigation

### Schedule
- My list vs current season toggle
- 7-day device-local airing strip
- Haptics on day selection (nice-to-have parity)

---

## 6. Anime detail

| Feature | Status for v2 |
|---|---|
| Banner/cover, score, format, eps, duration, genres, status, season, source, studio | **Required** |
| Trailer open (YouTube/Dailymotion) | **Required** |
| List-status badge + Edit list sheet | **Required** |
| Continue watching EP N CTA | **Required** |
| Overview + Relations (franchise BFS watch order) | **Required** |
| Episode list (AniList + AniZip + Jikan merge) | **Required** |
| Watched / downloaded / unreleased states | **Required** |
| Tap episode → source resolution → Play | **Required** (modules, not torrent indexes) |
| Download picker (all / range / selected) | **Required** (HTTP/HLS offline) |
| OP/ED theme tracks, tap-to-copy | **Required** |
| Characters / VA / Staff rails → detail pages | **Required** |
| Source material rail | **Required** |
| Recommendations rail | **Required** |
| Multi-select episodes for bulk download | **Required** |

---

## 7. Playback (product features — transport remapped)

| Feature | v1 | Status for v2 |
|---|---|---|
| Native fullscreen player | VLC primary / AVPlayer MP4 | **Required** — AVPlayer primary; VLC **per-candidate probe fallback only** |
| ± seek / scrubber | Yes | **Required** |
| Double / triple tap seek (configurable) | Yes | **Required** |
| Playback speed | Yes (VLC) | **Required** |
| Audio / subtitle track pickers | Yes (VLC) | **Required** where AVPlayer/VLC expose tracks |
| AniSkip OP/ED skip + optional auto-skip | Yes | **Required** |
| Autoplay next | Yes (opens next sources) | **Required** (next episode via StreamResolver) |
| Default quality preference | Yes | **Required** (candidate ranking input) |
| Gesture seek toggle | Yes | **Required** |
| Live torrent stats HUD | Yes | **Discard** |
| Lock-screen / Now Playing | Planned-only in v1 | **Required** in v2 (`MPNowPlayingInfoCenter`) |
| Custom HTTP headers for CDN | Partial | **Required** (`AVURLAssetHTTPHeaderFieldsKey`) |

---

## 8. Source discovery → Modules (remap)

| v1 | v2 | Status |
|---|---|---|
| Hayase-compatible torrent extensions | Community stream modules (Sora/Shirox-compatible contract) | **Remap** |
| Settings → Extensions | Settings → Modules | **Remap** |
| Enable / disable / catalog install | Enable / disable / reorder / remove + library browse + custom HTTPS URL | **Required** |
| HTTPS-only script URLs | Same | **Required** |
| Rank by seeders / HTTP-first | Rank by HLS>MP4, quality, `lastGoodModule` | **Remap** |
| Nyaa/Sukebei TLS mirror failover | N/A for torrent; module fan-out is the reliability mechanism | **Remap** |
| Sources sheet (Play / Save) | Candidate sheet (module + quality + Play / Download) | **Required** |
| Per-title module override | New | **Required** (plan §4d) |
| Module health (last success) | New | **Required** (plan §4d) |

**Module JS contract (clean-room):**
```
searchResults(query) → SearchResult[]
extractEpisodes(showUrl) → Episode[]
extractStreamUrl(episodeUrl) → { streams: [{url, headers?, quality?, title?}], subtitle? }
```

---

## 9. Offline / downloads

| Feature | Status for v2 |
|---|---|
| Download folder pick / reset (security-scoped; block iCloud Drive) | **Required** |
| Queue: pause / resume / cancel | **Required** |
| Parallel downloads (1–3) | **Required** |
| Wi-Fi only | **Required** |
| Preferred quality | **Required** |
| Storage usage + clear cache | **Required** |
| Library grouped by show → season; play / delete | **Required** |
| Incognito-tagged downloads hidden when Incognito off | **Required** |
| Completion / progress notifications | **Required** |
| Files visible in Files app | **Required** (keep sharing flags) |
| Torrent full-file download via libtorrent | **Required** (optional Download path — not Watch) |
| HLS offline via `AVAssetDownloadTask` | **Required** (primary Save from stream candidates) |
| MP4 offline via background `URLSession` | **Required** |

---

## 10. Settings matrix (parity checklist)

| Group | Setting | v2 |
|---|---|---|
| Privacy | Incognito Mode (confirm-to-exit) | **Required** |
| Appearance | Color customization | **Required** |
| Playback | Auto-skip OP/ED | **Required** |
| Playback | Gesture seek | **Required** |
| Playback | Double-tap seek seconds | **Required** |
| Playback | Triple-tap seek seconds | **Required** |
| Playback | Autoplay next | **Required** |
| Playback | Default quality | **Required** |
| Watch | Continue watching toggle | **Required** |
| Watch | Mark watched at % | **Required** |
| Transfers | Download Mbps cap / max peers | **Required** while torrent downloads remain (applies to torrent jobs) |
| Accounts | AniList / MAL sign in-out | **Required** |
| Accounts | Refresh list sync | **Required** |
| More | Downloads | **Required** |
| More | Extensions → **Modules** | **Remap** |
| About | Version + Changelog | **Required** |

---

## 11. Privacy & security (non-negotiable)

| Invariant | v2 |
|---|---|
| No client secrets in app bundle | **Required** (AniList Implicit Grant eliminates secret entirely) |
| OAuth tokens in Keychain only | **Required** |
| Module script URLs HTTPS-only | **Required** |
| Module sandbox: no filesystem; bridged fetch with host allow/deny | **Required** |
| OAuth host allowlist | **Required** |
| No WKWebView app shell / inspectability debt | **Eliminated** (native SwiftUI) |
| Loopback Range token / wildcard CORS | **Moot** (torrent Range server discarded) |
| Release secret scanning / preflight | **Required** (adapt scripts to native target) |

---

## 12. UX chrome & polish (parity)

| Feature | v2 |
|---|---|
| Puritan + Quando (or Saizen design-system fonts) | **Required** (Phase 7 identity — may interim with system until then) |
| Immersive Home chrome | **Required** |
| Keep-alive tabs + scroll memory | **Required** (intent) |
| Per-pane error isolation | **Required** (intent) |
| Toasts / lightweight feedback | **Required** |
| Sources / sheets swipe-to-dismiss | **Required** |
| Landscape safe-area handling | **Required** |
| Haptics on key interactions | Partial → keep where natural |

---

## 13. Explicitly discarded for **Watch** (active CDN-Watch design)

- Live torrent progressive Watch (magnet → libtorrent → Range → VLC as default play)
- MobileVLCKit as co-primary / default player (probe fallback only)
- Live torrent stats HUD on the default Watch path

**Not discarded (kept):** Capacitor/Next.js UI, `packages/shared`, libtorrent for **downloads**, transfer Mbps/peers for torrent jobs, Hayase-style torrent sources as optional Download, current AniList Authorization Code auth.  
**Deferred:** full SwiftUI rewrite / dropping Cap entirely.

---

## 14. Evidence map (v1 code)

| Area | Paths |
|---|---|
| Web routes | `apps/web/src/app/**` |
| Auth / sync | `apps/web/src/lib/auth/*`, `ios/App/SaizenCore/Auth/*`, `ios/App/Plugins/SaizenAuth` |
| Watch progress | `apps/web/src/lib/watch/*` |
| Incognito | `apps/web/src/lib/privacy/incognito.ts` |
| Extensions | `apps/web/src/lib/extensions/*` |
| Metadata | `apps/web/src/lib/anilist/*`, `animethemes/`, `aniskip/`, `anizip/`, `jikan/`, `mappings/` |
| Native torrent/player | `ios/App/SaizenCore/**` |
| Bridge contract | `packages/shared/src/*` |
| Version / changelog | `apps/web/src/lib/version.ts` |

---

## 15. MVP vs full parity

**MVP (rewrite plan §13)** — subset that must work first:  
AniList login → browse/search → module resolves HTTP/HLS → AVPlayer seekable continuous play → local progress + AniList/MAL sync on threshold.

**Full parity** — everything tagged **Required** / **Remap** in this snapshot. Track gaps against this file during Phases 0–7; do not mark v2 “feature-complete” until this checklist is green (Discard items excepted).
