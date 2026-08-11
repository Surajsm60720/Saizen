# Saizen v2 — Native SwiftUI Rewrite Design

**Status:** DEFERRED (2026-08-11) — full SwiftUI rewrite on hold to preserve Cap UI  
**Active design instead:** [`2026-08-11-cdn-watch-keep-ui-design.md`](./2026-08-11-cdn-watch-keep-ui-design.md)  
**Date:** 2026-08-11  
**Note:** Module-session / private-cookie locks in §6 remain valid and were carried into the active CDN-Watch design.  
**Companion docs:**
- Architecture plan: [`docs/saizen-native-rewrite-plan.md`](../../saizen-native-rewrite-plan.md) (historical / deferred)
- v1 feature freeze: [`docs/reference/FEATURES_SNAPSHOT_v1.3.3.md`](../../reference/FEATURES_SNAPSHOT_v1.3.3.md)

---

## 1. Problem

v1 Watch (magnet → libtorrent → HTTP Range → VLC) fails structurally under peer churn / piece starvation (evidence: Mushoku Tensei S3 E03 session). Tuning cannot raise the reliability ceiling. Capacitor + WebView adds unrelated fragility (bridge, ATS/loopback, mixed content).

## 2. Decision summary (locked)

| Topic | Choice |
|---|---|
| UI | Native SwiftUI — no Capacitor, no app WebView |
| Watch transport | Module-resolved HTTP/HLS only |
| Torrent | Removed entirely |
| Reliability | Multi-module fan-out + automatic playback fallback |
| Module catalog | Sora Module Library — UI `https://library.cufiy.net/library/`, API `https://library.cufiy.net/api/modules.json`; custom HTTPS URL add supported |
| Player | AVPlayer primary (HLS preferred); MobileVLCKit per-candidate probe fallback only |
| Persistence | SwiftData |
| Auth | AniList Implicit Grant; MAL OAuth2 + PKCE; Keychain tokens |
| Repo coexistence | **Option A** — new `Saizen.xcodeproj` at repo root; Cap tree frozen until MVP |
| Execution | **Approach 1** — spike-first in the real project, then grow into § layout |

## 3. Architecture

```
SwiftUI Views → ViewModels → Core Services
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
  AniList / AnimeThemes /   ModuleRuntime (JSContext)   WatchProgressStore
  MAL (URLSession)                   │                  (SwiftData)
                                     ▼
                              StreamResolver
                                     │
                              StreamCandidate
                                     ▼
                              PlayerController
                          ┌──────────┴──────────┐
                          ▼                     ▼
                     AVPlayer              MobileVLCKit
                   (default/HLS)         (probe-gated only)
```

### Core components

| Component | Responsibility |
|---|---|
| `ModuleRuntime` | Isolated `JSContext` **per module resolve session** (see §6); sandboxed `fetch` with session cookie jar; clean-room module contract |
| `ModuleLibraryClient` | Fetch/parse `api/modules.json`; install from catalog or custom HTTPS URL |
| `StreamResolver` | Fan-out enabled modules → rank candidates → fallback on playback failure → `lastGoodModule` |
| `PlayerController` | AVPlayer + headers; VLC only after per-candidate incompatibility probe |
| `WatchProgressStore` | Threshold progress, duration cache, dual-provider sync triggers |
| Auth services | Implicit Grant / PKCE via `ASWebAuthenticationSession`; Keychain |

## 4. Repo layout & migration

```
Saizen/                          # Cap era — FROZEN reference until MVP
Saizen.xcodeproj                 # NEW
Saizen/
  App/
  Features/{Home,AnimeDetail,Search,Schedule,Library,Settings,Modules,Player}/
  Core/{AniList,AnimeThemes,MAL,Modules,Player,Watch,Auth,Persistence}/
  DesignSystem/
  Resources/
docs/…                           # plan, feature freeze, this spec
```

- No new feature work on Cap path.
- After native MVP: separate ADR to archive/remove Cap tree.
- Day 0 code lives in `Core/Modules` (+ minimal `App` player surface) and expands in place.

## 5. Day 0 spike (gate before UI)

1. Create root Xcode SwiftUI app target.
2. Fetch `https://library.cufiy.net/api/modules.json`.
3. Select one **active** anime module with HLS `streamType` and HTTPS `scriptUrl`.
4. Download script HTTPS-only → one fresh `JSContext` for the whole spike chain (same session through all three calls).
5. Bridged `fetch`: HTTPS-only; host allow/deny (allow seeded from module `baseUrl` host); dedicated `URLSession` + private `HTTPCookieStorage` for the session (not shared).
6. On that same context: `searchResults` → `extractEpisodes` → `extractStreamUrl`.
7. Open top stream in bare `AVPlayer` on a **physical device**.
8. Pass criteria: playable URL, seek works. If module fails, try a second before blaming runtime.
9. **Do not** build Home/Search/Schedule until Day 0 passes.

## 6. Module system

### Contract (clean-room; do not copy module source)

```
searchResults(query: string) → SearchResult[]
extractEpisodes(showUrl: string) → Episode[]
extractStreamUrl(episodeUrl: string) → {
  streams: [{ url, headers?, quality?, title? }],
  subtitle?: string
}
```

### Sandbox invariants

- **Resolve-session `JSContext` (explicit):** “Invocation” means one **module resolve session**, not one JS method call.
  - Create one `JSContext` when a given installed module begins work for a user action (e.g. search, or resolve stream for title+episode).
  - Reuse that **same** context for the full chain on that module: `searchResults` → `extractEpisodes` → `extractStreamUrl` (and any intermediate helper calls the module makes).
  - The sandboxed `fetch` bridge for that session shares one cookie jar so challenge cookies and tokens set during search remain available for extract.
  - Tear down the context (and its network session / cookie store) only when that module’s chain for the action completes, fails fatally, or is cancelled — **not** between `searchResults` and `extractEpisodes`, and **not** between `extractEpisodes` and `extractStreamUrl`.
  - Separate modules never share a context or cookie jar. Parallel fan-out = one session per module.
  - Do **not** keep a long-lived global context across unrelated user actions (limits cross-title state bleed and memory growth).
- **Network-layer isolation (mandatory):** Each module resolve session owns its own `URLSession` configured with a **private, non-shared** `HTTPCookieStorage` (e.g. `HTTPCookieStorage()` assigned on `URLSessionConfiguration`, never `HTTPCookieStorage.shared`). Do **not** route bridged `fetch` through `URLSession.shared` or any process-wide cookie store — concurrent fan-out must not bleed cookies across modules even if JS contexts are already separate. Isolation must hold at the network layer, not only the JS layer. Tear down / invalidate that `URLSession` with the resolve session.
- No filesystem APIs
- Only networking path: bridged `fetch` (HTTPS + host allow/deny; deny wins)
- Install-time enforcement: `scriptUrl` / pasted URL must be `https://`

### StreamResolver algorithm

1. Query enabled modules in user priority order (default = install order; drag-reorder).
2. Collect `StreamCandidate` (`url`, `headers?`, `quality?`, `kind` hls|mp4, `moduleId`, `title?`).
3. Rank: HLS > MP4 → higher quality → prefer `lastGoodModule` for that AniList id.
4. Play top; on **playback** failure advance automatically; surface winning module.
5. Persist `lastGoodModule` + per-module last-success timestamp.
6. Support per-title module force-override.

### Modules UI

Installed list (enable/disable, reorder, remove), library browser, custom URL add, health timestamps, per-title override. Replaces v1 Extensions + vestigial torrent client page.

## 7. Player & offline

**Player**
- Default `AVPlayer` / `AVPlayerViewController`
- Prefer HLS; headers via `AVURLAssetHTTPHeaderFieldsKey`
- Probe-gated MobileVLCKit for non-AVFoundation containers only (same candidate URL)
- Product parity: ±seek, double/triple-tap seek, speed, A/V tracks when available, AniSkip + optional auto-skip, autoplay-next, quality preference as ranking input
- `MPNowPlayingInfoCenter` required (was unfinished in v1)
- No local HLS proxy unless proven necessary later

**Offline (Phase 6)**
- HLS: `AVAssetDownloadTask` / `AVAssetDownloadURLSession`
- MP4: background `URLSession`
- Parity: folder pick (block iCloud Drive), queue controls, parallel 1–3, Wi‑Fi only, preferred quality, storage/clear cache, library by show→season, Incognito-tagged visibility, notifications

## 8. Auth, persistence, metadata

**Auth:** AniList Implicit Grant; MAL PKCE; Keychain only; host allowlist (`anilist.co`, `myanimelist.net`).

**SwiftData models (minimum):** library entries, watch progress (`position`, `duration`, `completed`, `syncedEpisode`), module configs (enabled, order, health), `lastGoodModule` per title, episode duration cache, app settings (Incognito, playback prefs, threshold default 90%).

**Watch sync:** On threshold cross → AniList `SaveMediaListEntry` + MAL `PATCH my_list_status` in parallel; independent failures; flush pending on reconnect; skipped in Incognito.

**Metadata clients (URLSession):** AniList GraphQL (`DETAIL_FIELDS` parity), AnimeThemes → Jikan → MAL themes, AniSkip, AniZip, ARM id mapping.

## 9. Screens & feature parity

**Required screens:** Home, Search, Schedule, Anime detail, Character, Staff, Settings, Appearance, Downloads, Modules, Changelog.  
**Tabs:** Home / Search / Schedule / More.

Acceptance checklist: every **Required** / **Remap** row in `FEATURES_SNAPSHOT_v1.3.3.md`.  
**Discarded:** Capacitor/Next/shared bridge, libtorrent, HTTP Range server, Hayase torrent Watch path, VLC as co-primary, torrent transfer settings/HUD, AniList Authorization Code + bundled/local client secret.

## 10. Security invariants

| Invariant | Rule |
|---|---|
| Secrets | No client secrets in bundle (AniList Implicit Grant) |
| Tokens | Keychain only |
| Module scripts | HTTPS-only at import |
| Module network | Bridged fetch + host allow/deny; no FS |
| OAuth URLs | Host allowlist |
| WebView shell | None — inspectability debt eliminated |
| Release | Adapt secret-scanning / preflight to native target |

## 11. Phased delivery

| Phase | Outcome |
|---|---|
| Day 0 | Module → playable AVPlayer URL on device |
| 0 | Scaffold + SwiftData stubs + docs |
| 1 | Home / detail / search / schedule (metadata only) |
| 2 | Auth + SwiftData models wired |
| 3 | Module runtime + library UI + enable/reorder |
| 4 | StreamResolver + PlayerController; 15+ min continuous play milestone |
| 5 | Watch progress + AniList/MAL sync |
| 6 | Offline HLS/MP4 downloads |
| 7 | Design system / identity polish |

**MVP done when:** AniList login → browse/search → module resolves HTTP/HLS → AVPlayer seekable continuous play → local progress + dual sync on threshold.

## 12. Error handling

| Failure | Behavior |
|---|---|
| Module script fetch / parse | Mark unhealthy; try next module |
| `extract*` returns empty | Try next module |
| Candidate HTTP OK but playback fails | Advance candidate / module automatically |
| All candidates fail | Clear error naming last modules tried; offer module picker |
| Auth / sync failure | Local progress kept; retry / flush later; per-provider independence |
| Incognito | No list sync; session-only continue/progress |

## 13. Testing

- Day 0: on-device manual — two modules if first fails
- Phase 4 milestone: 15+ minutes continuous play, seek works, no manual retry
- Auth: Keychain persistence across relaunch; no tokens in UserDefaults
- Sync: threshold cross updates AniList and/or MAL; Incognito skips
- Security: non-HTTPS module URL rejected; bridged fetch blocked for deny-listed hosts; concurrent module sessions must not share cookies (private `HTTPCookieStorage` per session)
- Parity: walk `FEATURES_SNAPSHOT_v1.3.3.md` Required/Remap checklist before calling feature-complete

## 14. Non-goals (this design)

- Keeping Cap Watch path alive in parallel
- Demoting torrent instead of removing it
- Building HLS proxy preemptively
- Copying Shirox/Sora module or app source (architecture/UX reference only; PolyForm Noncommercial)
- App Store distribution

## 15. Open items deferred to implementation plan

Resolved here so implementers do not guess:

| Item | Decision |
|---|---|
| Day 0 seed module | At spike time, pick first catalog entry with `status == active`, `type == anime`, `streamType` containing HLS, HTTPS `scriptUrl`; on failure try next matching entry (max 3) |
| Host allow-list growth | Seed with module `baseUrl` host. During a single resolve session, allow additional HTTPS hosts only when they appear as redirect targets or absolute URLs returned by that module’s own prior `fetch` in the same session; never persist cross-module allow expansion without user install of that module |
| Cookie / URLSession isolation | Locked in §6: per resolve session → dedicated `URLSession` + private `HTTPCookieStorage`; never `URLSession.shared` / `HTTPCookieStorage.shared` for module `fetch` |
| Appearance / fonts | System fonts acceptable through Phase 6; Saizen type + icon in Phase 7 |
| Cap tree removal | Out of scope until native MVP; separate ADR |

---

## Approval record

- Coexistence: **A** (Cap frozen alongside new Xcode project)
- Module library: `https://library.cufiy.net/library/` + `api/modules.json`
- Execution: **Approach 1** (spike-first, grow in place)
- Design sections 1–4: approved 2026-08-11
