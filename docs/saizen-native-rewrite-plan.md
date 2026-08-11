# Saizen v2 — Native Swift Rewrite + Multi-Module Streaming

> **Status:** DEFERRED as full-product source of truth (2026-08-11).  
> **Active near-term design:** [`docs/superpowers/specs/2026-08-11-cdn-watch-keep-ui-design.md`](./superpowers/specs/2026-08-11-cdn-watch-keep-ui-design.md) — keep Cap UI; native JSContext modules for Watch; drop live torrent Watch; **keep torrent downloads**.  
> Module-session + private `URLSession`/cookie isolation locks below still apply to that design.  
> **Feature parity checklist:** [`docs/reference/FEATURES_SNAPSHOT_v1.3.3.md`](./reference/FEATURES_SNAPSHOT_v1.3.3.md)

---

## 0. What this document is

A complete architecture reset, replacing every prior Saizen plan (Capacitor+Next.js shell, libtorrent+VLCKit playback). This is not an incremental patch — it's a fresh application built on the lessons from the torrent-reliability failure and the Shirox/Sora module ecosystem.

---

## 1. Locked decisions for this pivot

| Decision | Choice | Reasoning |
|---|---|---|
| UI framework | **Native SwiftUI**, no Capacitor, no WebView | Removes an entire category of fragility (mixed content, bridge serialization, ATS/loopback edge cases) that had nothing to do with the actual streaming problem. You already know SwiftUI from LifeOS |
| Playback transport | **Single path: module-resolved HTTP/HLS → AVPlayer** | Torrent's reliability ceiling was structural (peer churn, piece starvation), not tunable. CDN delivery is fundamentally steadier once connected |
| Torrent engine | **Removed entirely** — not demoted, not kept as advanced option | The evidence (console logs from the Mushoku Tensei S3 E03 session) showed the class of failure isn't fixable by tuning; removing it removes libtorrent, the async continuation registry, dual-player-hint routing, and a large surface of native complexity all at once |
| Reliability mechanism | **Multi-module fan-out with automatic fallback**, not a single hardcoded source | This is the actual thing that makes CDN resolution reliable — not "one simple path," but "many candidate sources, ranked, with automatic retry on failure." Same principle as torrent mirrors, applied to modules |
| Module source | **Community module library** — default browse UI: [`https://library.cufiy.net/library/`](https://library.cufiy.net/library/) (Sora Module Library); machine catalog: `https://library.cufiy.net/api/modules.json`; users can also add custom module URLs | No need to author extraction logic from scratch; module contract is a known, documented format shared across this app family |
| Player | **AVPlayer primary** (HLS preferred over MP4 where available) | CDN sources are pre-transcoded H.264/HLS specifically for broad device compatibility — exactly AVPlayer's target case |
| Player safety net | **MobileVLCKit kept as a per-candidate fallback only** (not a co-primary), invoked only if a specific resolved URL fails an AVFoundation compatibility probe | Keeps the "single transport" philosophy intact — this isn't a second primary path, it's a narrow defensive net for the rare non-standard candidate |
| Persistence | **SwiftData** | Matches your existing LifeOS stack; no reason to introduce a second persistence pattern |
| Auth | AniList **Implicit Grant** (no client secret), MAL **OAuth2 + PKCE** | Implicit Grant is what AniList explicitly recommends for apps that can't securely store a secret — eliminates the embedded-secret risk entirely for AniList; MAL requires PKCE regardless |
| Distribution | Sideload only (AltStore/SideStore or personal signing) | Unchanged from prior plans |
| Licensing posture | Personal, non-commercial, hobby use — module ecosystem license (PolyForm Noncommercial, matching Shirox) explicitly permits this | No fallback-feature anxiety needed on licensing grounds specifically; the fallback requirement below is a reliability decision, not a licensing one |

---

## 2. What carries over vs. what's discarded

| Area | Status |
|---|---|
| AniList GraphQL field mapping, metadata gaps (OP/ED via AnimeThemes, per-episode duration via probe-and-cache) | **Carries over conceptually** — same fields, same gap analysis, ported to Swift `URLSession`/GraphQL query strings instead of a JS client |
| Watch-progress threshold model, sync-on-threshold-crossed logic | **Carries over** — same design, now natively wired (no bridge/event layer needed at all, since the player and the progress store are both native Swift) |
| OAuth flow design | **Carries over, gets simpler** — `ASWebAuthenticationSession` called directly, no Capacitor plugin/bridge layer in between |
| Feature list (homepage, detail page, search, calendar, settings, torrent client page) | **Carries over except the torrent client page**, which is replaced by a **module management page** (see §6) |
| Next.js UI, Tailwind, shadcn components | **Discarded** — replaced by native SwiftUI views and a Saizen-specific design system |
| Capacitor, `packages/shared` TypeScript bridge contract | **Discarded** |
| libtorrent, HTTP range server, async continuation registry, `HTTPRangeServer.swift` | **Discarded** |
| VLCKit as primary player | **Discarded** — retained only as the narrow per-candidate fallback described above |

Full product checklist with Required / Remap / Discard tags: [`docs/reference/FEATURES_SNAPSHOT_v1.3.3.md`](./reference/FEATURES_SNAPSHOT_v1.3.3.md).

---

## 3. Target architecture

```
[SwiftUI Views] → [ViewModels] → [Core Services]
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
[AniList/AnimeThemes/MAL         [ModuleRuntime (JSContext)]    [WatchProgressStore
 clients — URLSession/GraphQL]         │                          (SwiftData)]
                                        ▼
                                [StreamResolver]
                                        │
                          ┌─────────────┴─────────────┐
                          ▼                            ▼
                  query enabled modules,        rank + fallback
                  in priority order              on failure
                          │
                          ▼
                  [StreamCandidate] → [PlayerController]
                                            │
                              ┌─────────────┴─────────────┐
                              ▼                            ▼
                        AVPlayer (default)          MobileVLCKit
                        HLS preferred                (probe-gated,
                                                       per-candidate only)
```

---

## 4. Module system (the core reliability mechanism)

### 4a. Module contract

Reauthor a JS contract compatible with the module ecosystem's conventions (do not copy module source verbatim; the format itself is not proprietary — write your own clean-room interpreter):

```
searchResults(query: string) → SearchResult[]
extractEpisodes(showUrl: string) → Episode[]
extractStreamUrl(episodeUrl: string) → {
  streams: [{ url: string, headers?: Record<string,string>, quality?: string, title?: string }],
  subtitle?: string
}
```

Run each module in an isolated `JSContext` (JavaScriptCore). **“Invocation” = one module resolve session**, not one JS method call: create a context when that module starts a user action, reuse it for the full `searchResults` → `extractEpisodes` → `extractStreamUrl` chain, and tear it down only when that chain completes, fails, or is cancelled. Separate modules never share a context. Do not use a long-lived global context across unrelated actions. **Network isolation:** each resolve session’s bridged `fetch` uses its own `URLSession` with a private, non-shared `HTTPCookieStorage` — never `URLSession.shared` / `HTTPCookieStorage.shared`, so parallel fan-out cannot bleed cookies across modules. No filesystem access. No arbitrary networking — expose a single sandboxed `fetch`-like bridge function that enforces HTTPS-only and checks against a host allow/deny list before any request leaves the module's sandbox.

### 4b. Module sources

- **Library browsing:** build a lightweight client that surfaces the community module library's catalog inside Settings → Modules, so users can discover and add modules without leaving the app
- **Custom add:** allow pasting a raw module URL directly, same trust model as the library-sourced ones
- All module script URLs must be `https://` — no exceptions, enforced at import time, not just at runtime

### 4c. StreamResolver — the actual fallback mechanism

This is the component that replaces "torrent mirrors" conceptually:

1. For a given anime+episode, query all **enabled** modules in the user's configured priority order (default: order added; user can manually reorder in Settings)
2. Each module returns zero or more `StreamCandidate`s
3. Rank candidates: prefer HLS over MP4, prefer higher declared quality, prefer the module that succeeded last time for this specific anime (`lastGoodModule` cache per title)
4. Attempt playback on the top candidate. On player-reported failure (not just HTTP error — actual playback failure), automatically advance to the next candidate and retry, surfacing which module ultimately succeeded
5. Persist `lastGoodModule` per anime so repeat plays skip straight to the module that's already proven reliable for that title, only falling back further if it stops working

This is what makes "single transport, no torrent" actually foolproof in practice — the redundancy lives in the module layer, not in having two competing transports.

### 4d. Module management UI (replaces the old torrent client page)

- List of installed modules: enabled/disabled toggle, reorder by drag, remove
- Per-title override: force a specific module for a specific anime if the user has a known preference
- Health indicator: last successful use timestamp per module, so a user can spot a dead module before it causes a failed fallback chain

---

## 5. Player

- `AVPlayer` / `AVPlayerViewController` as the default for every resolved `StreamCandidate`
- HLS (`.m3u8`) preferred when a module offers it — adaptive bitrate handles network variability far better than a static MP4 URL
- Custom headers (Referer/User-Agent, common CDN auth requirements) passed via `AVURLAssetHTTPHeaderFieldsKey` — no proxy layer needed for the common case
- **Per-candidate probe-and-fallback to VLCKit:** before opening a candidate, lightweight container/extension check; if it's something AVFoundation genuinely can't handle (rare for CDN-scraped sources, but not impossible), reopen the same URL in VLCKit rather than failing outright. This is scoped to a single candidate, not a second app-wide primary path
- Lock-screen controls via `MPNowPlayingInfoCenter`, same as previously planned — this is unaffected by the transport change

---

## 6. Offline downloads — reconsidered for HLS

Worth flagging a genuine simplification here: for HLS specifically, Apple provides **`AVAssetDownloadTask`** (via `AVAssetDownloadURLSession`) as a first-party mechanism for downloading an HLS stream's segments for offline playback, including automatic handling of variant selection and encryption where applicable. This is meaningfully less custom-build work than a DIY HLS segment downloader, and doesn't require touching AVFoundation internals — just the standard download-task API. For plain MP4 candidates, a standard background `URLSession` download suffices. Either way, this phase is considerably lighter than it would have been under the torrent architecture.

---

## 7. Metadata, watch progress, and sync — unchanged in design, ported to native

These carry forward from earlier planning essentially as-is, just implemented in Swift instead of TypeScript:

- AniList `DETAIL_FIELDS` expansion (studios, source, season, trailer, cast, staff, recommendations) — same field list as before
- AnimeThemes.moe for OP/ED, same graceful-empty-state rules
- Episode duration: AniList average shown before play (`~24 min`), real duration probed from the player after first watch and cached (`24 min`, no tilde) — same rule, now trivially easy since the native player already reports real duration with no bridge round-trip
- Watch progress: SwiftData model, user-configurable "mark watched at %" threshold (default 90), fires `SaveMediaListEntry` (AniList) and `PATCH .../my_list_status` (MAL) in parallel, independent failure handling, idempotent via `syncedEpisode`

---

## 8. Security invariants (carried forward, some now moot)

| Invariant | Status under native rewrite |
|---|---|
| No client secrets in the app bundle | **Fully resolved for AniList** via Implicit Grant (no secret exists to embed). MAL PKCE similarly avoids a bundled secret for public client types |
| OAuth tokens in Keychain only | Unchanged |
| Module script URLs HTTPS-only | Unchanged, enforced at import |
| Module sandbox: no filesystem, no arbitrary network | Unchanged — enforced via the `JSContext` bridge design in §4a |
| Mixed-content / WKWebView inspectability concerns | **Eliminated entirely** — there is no WebView anywhere in this architecture anymore |

---

## 9. Repo layout

```
Saizen/
├── Saizen.xcodeproj
├── Saizen/
│   ├── App/                    # App entry point
│   ├── Features/
│   │   ├── Home/
│   │   ├── AnimeDetail/
│   │   ├── Search/
│   │   ├── Schedule/
│   │   ├── Library/
│   │   ├── Settings/
│   │   ├── Modules/            # module management UI
│   │   └── Player/
│   ├── Core/
│   │   ├── AniList/            # GraphQL client + queries + types
│   │   ├── AnimeThemes/
│   │   ├── MAL/
│   │   ├── Modules/            # ModuleRuntime, ModuleManifest, StreamResolver, library client
│   │   ├── Player/              # PlayerController, header injection, VLCKit fallback
│   │   ├── Watch/                # WatchProgressStore, thresholds
│   │   ├── Auth/                 # AniList Implicit Grant, MAL PKCE, Keychain
│   │   └── Persistence/          # SwiftData models
│   ├── DesignSystem/
│   └── Resources/
├── docs/
│   ├── REFERENCE.md              # Hayase + Shirox UX reference notes (behavior only)
│   ├── MODULE_CONTRACT.md        # reauthored module JS contract spec
│   ├── METADATA_SOURCES.md       # AniList field map + known gaps
│   ├── SECURITY.md               # module sandboxing + auth invariants
│   ├── saizen-native-rewrite-plan.md   # this file
│   └── reference/
│       └── FEATURES_SNAPSHOT_v1.3.3.md # v1 product freeze
└── README.md
```

**Migration note (locked — option A):** New `Saizen.xcodeproj` at the repo root. The existing Capacitor tree (`apps/web`, `apps/mobile`, `ios/App/SaizenCore`, `packages/shared`) remains in-tree as a **frozen reference** until the native app reaches MVP, then is archived/removed under a separate cleanup ADR. Do not continue feature work on the Cap path.

---

## 10. Phased build order

### Day 0 — De-risk the new biggest unknown
The module JS runtime replaces libtorrent as the single largest unproven piece. Spike: get `JSContext` running one real module from the community library end-to-end — `searchResults` → `extractEpisodes` → `extractStreamUrl` → a playable URL opened in a bare `AVPlayer`, on a physical device. 1–2 days. If a specific module's extraction breaks, try a second one before concluding anything about the runtime itself.

### Phase 0 — Scaffold
- New Xcode project, SwiftUI app target, SwiftData schema stubbed
- `docs/REFERENCE.md` — screens and UX flows from Hayase and Shirox, behavior notes only

### Phase 1 — Shell (metadata-driven screens, no playback yet)
- Home, detail, search, schedule — built against AniList GraphQL, same field list as before
- Settings shell (module management UI comes in Phase 3)

### Phase 2 — Auth + persistence
- AniList Implicit Grant, MAL PKCE, both via `ASWebAuthenticationSession`, tokens in Keychain
- SwiftData models: library entries, watch progress, module configs

### Phase 3 — Module system
- `JSContext` sandbox + bridge (`MODULE_CONTRACT.md` written before coding starts)
- Module library browser + custom-URL import
- Enable/disable/reorder UI

### Phase 4 — StreamResolver + playback (core)
- Multi-module fan-out, ranking, `lastGoodModule` caching, automatic fallback on failure
- `PlayerController`: AVPlayer default, HLS preferred, header injection, VLCKit per-candidate probe-fallback
- **Milestone:** play a real episode end-to-end via a real module, on-device, 15+ minutes continuous playback with no manual intervention

### Phase 5 — Watch progress + sync
- Threshold-based local tracking, dual sync to AniList + MAL, same rules as prior planning

### Phase 6 — Offline downloads
- `AVAssetDownloadTask` for HLS candidates, standard background `URLSession` download for MP4

### Phase 7 — Saizen identity
- Design system, app icon, no Hayase/Shirox branding
- Calendar/schedule as the primary post-MVP feature, per your original feature notes

---

## 11. Feature list — status check against the pivot

Nearly everything from your original Hayase-walkthrough feature list still applies unchanged, since it was metadata/UX-driven, not transport-driven:

- Homepage, detail page, search, calendar, settings — **unaffected**, same AniList-backed design as before
- "Torrent client page" — **replaced** by the module management page (§4d), same underlying need (visibility into what's powering playback, health/reliability at a glance)
- "Bulk downloads with mirror selection" — **reframed**, not lost: mirrors become modules, and the multi-module fallback in §4c is the direct evolution of that same idea

---

## 12. Key risks

| Risk | Mitigation |
|---|---|
| A given module breaks (site changes layout) | Multi-module fallback + `lastGoodModule` caching + per-module health indicator in Settings |
| CDN requires headers a static field can't satisfy | Fall back to a local proxy only if genuinely needed — don't build it preemptively |
| JSContext module runtime has its own quirks on iOS | De-risked via Day 0 spike, same principle as the old libtorrent spike |
| Full UI rewrite takes longer than expected | Mitigated by your existing SwiftUI familiarity from LifeOS; scope is bounded (few screens, all metadata-driven) |
| Module ecosystem library availability/uptime | Custom module-URL import as a backstop if the library itself is ever unreachable |

---

## 13. MVP definition of done

AniList login (Implicit Grant) → browse/search → module resolves a real HTTP/HLS stream for a test title → plays end-to-end in AVPlayer with working seek and no manual retry → watch progress saved locally and synced to AniList/MAL on threshold crossing.

---

## 14. Suggested agent prompt

```
You are rebuilding Saizen from scratch as a native SwiftUI iOS app,
replacing the previous Capacitor + Next.js + libtorrent + VLCKit
architecture entirely. Read this plan fully:

docs/saizen-native-rewrite-plan.md (this document)

Also read the v1 feature freeze:
docs/reference/FEATURES_SNAPSHOT_v1.3.3.md

Context: the prior architecture's torrent-based streaming (libtorrent →
HTTP range server → VLCKit) proved structurally unreliable (peer churn,
piece starvation, premature "torrent finished" events, subtitle/audio
failures). The new architecture drops torrent entirely in favor of
community-module-resolved HTTP/HLS streams played via AVPlayer, with
multi-module fallback as the core reliability mechanism (replacing what
torrent mirrors used to provide).

Tasks:
1. Scaffold a fresh native SwiftUI Xcode project per §9's repo layout.
2. Before any UI work: run the Day 0 spike (§10) — JSContext running one
   real community module end-to-end to a playable AVPlayer URL, on a
   physical device. Do not proceed to Phase 0 UI work until this passes.
3. Build phases 0-7 in order as specified in §10.
4. Enforce the security invariants in §8 from the start, especially
   module sandboxing (HTTPS-only script URLs, no filesystem access,
   bridged fetch with host allow/deny list) — do not relax these for
   convenience.
5. Port (don't rebuild from scratch) the AniList field mapping, watch-
   progress threshold logic, and OAuth flow design from prior planning
   docs — these are unaffected by the transport change, only their
   implementation language changes.
6. Preserve every feature tagged Required/Remap in FEATURES_SNAPSHOT_v1.3.3.md.
7. Flag back any point where a module's extraction proves unreliable
   across multiple attempts — that's a signal to try a different module
   from the library, not to add complexity to the resolver.
```

---

## 15. Related documents

| Doc | Role |
|---|---|
| `docs/reference/FEATURES_SNAPSHOT_v1.3.3.md` | Frozen v1 product checklist for parity |
| `docs/superpowers/plans/2026-08-11-shirox-style-streaming-architecture.md` | Historical Option A/B/C validation plan (superseded — decision is Option C / full native) |
| `docs/REFERENCE.md` | Hayase UX behavior notes (to be expanded for Shirox) |
| `docs/SECURITY_TEST_PLAN.md` | Prior security matrix — port relevant cases into `docs/SECURITY.md` |
