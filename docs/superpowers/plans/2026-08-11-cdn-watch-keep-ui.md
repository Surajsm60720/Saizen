# CDN Watch Middleware (Keep Cap UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace live torrent Watch with native JSContext module → CDN HLS/MP4 → AVPlayer, while keeping the existing Capacitor/Next.js UI and optional torrent downloads.

**Architecture:** Extend `ios/App/SaizenCore` with a session-scoped `ModuleRuntime` (private `URLSession` + cookie store per module) and `StreamResolver`; expose `playStream` / `resolveStreams` / module CRUD over Cap plugins; change web Watch entrypoints to use streams instead of `playTorrent`. libtorrent remains only for optional download jobs.

**Tech Stack:** Swift (JavaScriptCore, AVFoundation, existing Cap plugins), TypeScript (`packages/shared`, `apps/web`), Capacitor 7, MobileVLCKit (probe fallback only), libtorrent (download-only).

**Spec:** [`docs/superpowers/specs/2026-08-11-cdn-watch-keep-ui-design.md`](../specs/2026-08-11-cdn-watch-keep-ui-design.md)

## Global Constraints

- **No UI redesign** — functional glue only (sources sheet + Modules settings); keep existing chrome/screens.
- **No live torrent Watch** — Watch must not call `LibtorrentEngine.play` / progressive Range streaming.
- **Torrent downloads kept** — `DownloadCoordinator` + libtorrent `downloadFullFile` remain for optional Save.
- **Module session** = full `searchResults` → `extractEpisodes` → `extractStreamUrl` on one `JSContext`; tear down only when that chain ends.
- **Network isolation** — each session: dedicated `URLSession` + private `HTTPCookieStorage`; never `URLSession.shared` / `HTTPCookieStorage.shared` for module fetch.
- **HTTPS-only** module `scriptUrl` at install time.
- **Canonical Swift** lives in `ios/App/`; after Swift edits run `bash scripts/sync-swift-into-cap.sh` (or `pnpm sync:ios` if web also changed).
- **Do not copy** Shirox/Sora module or app source; clean-room interpreter only.
- Catalog API: `https://library.cufiy.net/api/modules.json`.

---

## File map (create / modify)

| Path | Responsibility |
|---|---|
| `ios/App/SaizenCore/Modules/ModuleTypes.swift` | `StreamCandidate`, catalog/manifest DTOs |
| `ios/App/SaizenCore/Modules/ModuleFetchSession.swift` | Private `URLSession` + cookie store + HTTPS/host gate |
| `ios/App/SaizenCore/Modules/ModuleRuntime.swift` | JSContext session; bridge `fetch`; run contract |
| `ios/App/SaizenCore/Modules/ModuleStore.swift` | Installed modules, order, enabled, health, lastGood |
| `ios/App/SaizenCore/Modules/ModuleLibraryClient.swift` | Fetch/parse catalog JSON |
| `ios/App/SaizenCore/Modules/StreamResolver.swift` | Fan-out, rank, fallback |
| `ios/App/SaizenCore/Player/PlayerRouter.swift` | Accept HTTP headers; prefer AVPlayer for CDN |
| `ios/App/Plugins/SaizenPlayer/SaizenPlayerPlugin.swift` | `playStream` + headers; default hint `avplayer` for https |
| `ios/App/Plugins/SaizenTorrent/SaizenTorrentPlugin.swift` or new `SaizenModulesPlugin.swift` | `resolveStreams`, module CRUD; optionally gate `playTorrent` |
| `ios/App/SaizenCore/Downloads/DownloadCoordinator.swift` | HLS/MP4 enqueue kinds |
| `packages/shared/src/stream.ts` | Shared TS stream/module types |
| `packages/shared/src/native.ts` | Bridge methods |
| `packages/shared/src/torrent.ts` | Extend `DownloadKind` with `hls` |
| `apps/web/src/lib/native/bridge.ts` | Wire new methods |
| `apps/web/src/app/app/anime/page.tsx` | Watch via `resolveStreams` / `playStream` |
| `apps/web/src/components/saizen/EpisodeSourcesSheet.tsx` | Show stream candidates; Watch ≠ torrent |
| `apps/web/src/app/app/extensions/page.tsx` or `…/modules/page.tsx` | Minimal Modules management |
| `docs/MODULE_CONTRACT.md` | Clean-room contract + session/cookie rules |

---

### Task 1: ModuleFetchSession + HTTPS/host gate

**Files:**
- Create: `ios/App/SaizenCore/Modules/ModuleFetchSession.swift`
- Create: `ios/App/SaizenCore/Modules/ModuleTypes.swift`
- Test: manual / playground assertions in DEBUG, or XCTest target if already present — verify private cookie storage identity

**Interfaces:**
- Produces:
  - `struct StreamCandidate: Codable, Sendable` with `url: URL`, `headers: [String: String]`, `quality: String?`, `title: String?`, `moduleId: String`, `kind: StreamKind` (`hls` \| `mp4` \| `other`)
  - `final class ModuleFetchSession` with `init(allowedHosts: Set<String>, deniedHosts: Set<String>)`, `func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse)`, `var cookieStorage: HTTPCookieStorage` (private instance)
- Consumes: Foundation `URLSession` only

- [ ] **Step 1: Add `ModuleTypes.swift`**

```swift
import Foundation

public enum StreamKind: String, Codable, Sendable {
  case hls, mp4, other
}

public struct StreamCandidate: Codable, Sendable, Equatable {
  public var url: URL
  public var headers: [String: String]
  public var quality: String?
  public var title: String?
  public var moduleId: String
  public var kind: StreamKind

  public init(
    url: URL,
    headers: [String: String] = [:],
    quality: String? = nil,
    title: String? = nil,
    moduleId: String,
    kind: StreamKind
  ) {
    self.url = url
    self.headers = headers
    self.quality = quality
    self.title = title
    self.moduleId = moduleId
    self.kind = kind
  }

  public static func kind(for url: URL) -> StreamKind {
    let path = url.path.lowercased()
    if path.contains(".m3u8") { return .hls }
    if path.contains(".mp4") { return .mp4 }
    return .other
  }
}

public struct ModuleCatalogEntry: Codable, Sendable {
  public var id: String
  public var sourceName: String
  public var scriptUrl: String
  public var baseUrl: String?
  public var streamType: String?
  public var status: String?
  public var type: String?
  public var quality: String?
}
```

- [ ] **Step 2: Add `ModuleFetchSession` with private cookies**

```swift
import Foundation

public enum ModuleFetchError: Error, LocalizedError {
  case nonHttps
  case hostDenied(String)
  case hostNotAllowed(String)
  case badResponse

  public var errorDescription: String? {
    switch self {
    case .nonHttps: return "Module fetch requires https://"
    case .hostDenied(let h): return "Host denied: \(h)"
    case .hostNotAllowed(let h): return "Host not allowed: \(h)"
    case .badResponse: return "Invalid HTTP response"
    }
  }
}

public final class ModuleFetchSession: @unchecked Sendable {
  public let cookieStorage: HTTPCookieStorage
  private let session: URLSession
  private var allowedHosts: Set<String>
  private let deniedHosts: Set<String>
  private let lock = NSLock()

  public init(seedAllowedHosts: Set<String>, deniedHosts: Set<String> = []) {
    self.cookieStorage = HTTPCookieStorage()
    self.allowedHosts = seedAllowedHosts
    self.deniedHosts = deniedHosts
    let config = URLSessionConfiguration.ephemeral
    config.httpCookieStorage = cookieStorage
    config.httpCookieAcceptPolicy = .always
    config.httpShouldSetCookies = true
    self.session = URLSession(configuration: config)
  }

  public func allowHost(_ host: String) {
    lock.lock(); allowedHosts.insert(host.lowercased()); lock.unlock()
  }

  public func invalidate() {
    session.invalidateAndCancel()
  }

  public func data(for url: URL, method: String = "GET", headers: [String: String] = [:], body: Data? = nil) async throws -> (Data, HTTPURLResponse) {
    guard let scheme = url.scheme?.lowercased(), scheme == "https" else { throw ModuleFetchError.nonHttps }
    guard let host = url.host?.lowercased(), !host.isEmpty else { throw ModuleFetchError.nonHttps }
    if deniedHosts.contains(host) { throw ModuleFetchError.hostDenied(host) }
    lock.lock(); let allowed = allowedHosts.contains(host); lock.unlock()
    if !allowed { throw ModuleFetchError.hostNotAllowed(host) }

    var req = URLRequest(url: url)
    req.httpMethod = method
    headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
    req.httpBody = body
    let (data, resp) = try await session.data(for: req)
    guard let http = resp as? HTTPURLResponse else { throw ModuleFetchError.badResponse }
    if let final = http.url, let h = final.host?.lowercased() { allowHost(h) }
    return (data, http)
  }
}
```

- [ ] **Step 3: Sanity-check isolation**

In a DEBUG helper or unit test, create two `ModuleFetchSession` instances and assert `sessionA.cookieStorage !== HTTPCookieStorage.shared` and `sessionA.cookieStorage !== sessionB.cookieStorage`.

- [ ] **Step 4: Sync Swift into Cap**

```bash
bash scripts/sync-swift-into-cap.sh
```

Ensure new files are added to the Xcode App target (File System synchronized group or explicit membership).

- [ ] **Step 5: Commit** (when user asks to commit)

```bash
git add ios/App/SaizenCore/Modules/ModuleTypes.swift ios/App/SaizenCore/Modules/ModuleFetchSession.swift
git commit -m "feat(modules): private URLSession fetch session for module runtime"
```

---

### Task 2: ModuleRuntime (session-scoped JSContext)

**Files:**
- Create: `ios/App/SaizenCore/Modules/ModuleRuntime.swift`
- Create: `docs/MODULE_CONTRACT.md`
- Modify: Xcode target membership as needed

**Interfaces:**
- Consumes: `ModuleFetchSession`, script `Data`/`String`, `moduleId`, seed host from `baseUrl`
- Produces:
  - `final class ModuleResolveSession`
  - `func searchResults(_ query: String) async throws -> [[String: Any]]`
  - `func extractEpisodes(_ showUrl: String) async throws -> [[String: Any]]`
  - `func extractStreamUrl(_ episodeUrl: String) async throws -> [StreamCandidate]`
  - `func teardown()`

- [ ] **Step 1: Write `docs/MODULE_CONTRACT.md`** documenting the three functions, return shapes, resolve-session lifetime, and private cookie/`URLSession` rule (copy locks from the active design §5).

- [ ] **Step 2: Implement `ModuleResolveSession`**

Skeleton (implementer fills JS evaluation details; must keep one context for all three calls):

```swift
import Foundation
import JavaScriptCore

public final class ModuleResolveSession {
  public let moduleId: String
  private let context: JSContext
  private let fetchSession: ModuleFetchSession

  public init(moduleId: String, scriptSource: String, baseURL: URL?) throws {
    self.moduleId = moduleId
    self.context = JSContext()!
    var seeds = Set<String>()
    if let host = baseURL?.host?.lowercased() { seeds.insert(host) }
    self.fetchSession = ModuleFetchSession(seedAllowedHosts: seeds)
    context.exceptionHandler = { _, exc in
      NSLog("[Saizen] Module JS exception: %@", exc?.toString() ?? "?")
    }
    installFetchBridge()
    context.evaluateScript(scriptSource)
    if let exc = context.exception { throw ModuleRuntimeError.scriptError(exc.toString() ?? "unknown") }
  }

  private func installFetchBridge() {
    // Expose global fetch(url, options?) -> Promise-like via JSValue callbacks
    // Implementation must call fetchSession.data(...), never URLSession.shared
    // On success, allowHost for response URL host
  }

  public func searchResults(_ query: String) async throws -> [[String: Any]] { /* call JS */ }
  public func extractEpisodes(_ showUrl: String) async throws -> [[String: Any]] { /* call JS */ }
  public func extractStreamUrl(_ episodeUrl: String) async throws -> [StreamCandidate] {
    // Parse { streams: [{url, headers, quality, title}], subtitle? }
    // Map to StreamCandidate(moduleId: moduleId, kind: StreamCandidate.kind(for:))
  }

  public func teardown() {
    fetchSession.invalidate()
  }

  deinit { teardown() }
}

public enum ModuleRuntimeError: Error {
  case scriptError(String)
  case missingFunction(String)
  case invalidReturn
}
```

- [ ] **Step 3: Verify session reuse**

Add a DEBUG-only counter or log: `searchResults` / `extractEpisodes` / `extractStreamUrl` must log the same `ObjectIdentifier(context)` for one session.

- [ ] **Step 4: Sync Swift**

```bash
bash scripts/sync-swift-into-cap.sh
```

- [ ] **Step 5: Commit** (when asked)

```bash
git add ios/App/SaizenCore/Modules/ModuleRuntime.swift docs/MODULE_CONTRACT.md
git commit -m "feat(modules): session-scoped JSContext ModuleRuntime"
```

---

### Task 3: Day 0 spike — catalog → AVPlayer on device

**Files:**
- Create: `ios/App/SaizenCore/Modules/ModuleLibraryClient.swift`
- Create: `ios/App/SaizenCore/Modules/ModuleDay0Spike.swift` (DEBUG-only entry, or temporary Settings debug button)
- Modify: minimal DEBUG trigger (prefer Settings → About long-press or `#if DEBUG` button) — **no product UI redesign**

**Interfaces:**
- Consumes: `ModuleLibraryClient.fetchCatalog()`, `ModuleResolveSession`, `PlayerRouter.present`
- Produces: On-device proof that one active HLS module yields a playable URL

- [ ] **Step 1: Catalog client**

```swift
public enum ModuleLibraryClient {
  public static let catalogURL = URL(string: "https://library.cufiy.net/api/modules.json")!

  public static func fetchCatalog() async throws -> [ModuleCatalogEntry] {
    let (data, resp) = try await URLSession.shared.data(from: catalogURL)
    // Catalog listing may use URLSession.shared — this is NOT module extract traffic.
    guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      throw ModuleFetchError.badResponse
    }
    return try JSONDecoder().decode([ModuleCatalogEntry].self, from: data)
  }

  public static func pickDay0Candidates(_ entries: [ModuleCatalogEntry]) -> [ModuleCatalogEntry] {
    entries.filter {
      ($0.status ?? "").lowercased() == "active"
        && ($0.type ?? "").lowercased() == "anime"
        && ($0.streamType ?? "").uppercased().contains("HLS")
        && $0.scriptUrl.lowercased().hasPrefix("https://")
    }
  }
}
```

- [ ] **Step 2: Spike flow** (try up to 3 modules)

1. `fetchCatalog()` → `pickDay0Candidates` → take first 3  
2. For each: download `scriptUrl` via a **one-off** HTTPS `URLSession` with ephemeral config (install fetch), create `ModuleResolveSession`  
3. `searchResults("Naruto")` (or another common title) → first result URL → `extractEpisodes` → first ep → `extractStreamUrl`  
4. Present first candidate with `PlayerRouter.present(..., hint: .avplayer)`  
5. On failure, `teardown()` and try next module  

- [ ] **Step 3: On-device verification**

Run on physical iPhone. Pass criteria: video starts, seek works. Log which `moduleId` succeeded.

- [ ] **Step 4: Sync + commit** (when asked)

```bash
bash scripts/sync-swift-into-cap.sh
git add ios/App/SaizenCore/Modules/
git commit -m "feat(modules): Day 0 catalog-to-AVPlayer spike"
```

**Stop gate:** Do not start Watch UI rewiring until Day 0 passes on device.

---

### Task 4: Shared TS types + `playStream` bridge

**Files:**
- Create: `packages/shared/src/stream.ts`
- Modify: `packages/shared/src/native.ts`
- Modify: `packages/shared/src/index.ts` (export stream types)
- Modify: `ios/App/Plugins/SaizenPlayer/SaizenPlayerPlugin.swift`
- Modify: `ios/App/SaizenCore/Player/PlayerRouter.swift` — accept headers via `AVURLAssetHTTPHeaderFieldsKey`
- Modify: `apps/web/src/lib/native/bridge.ts`
- Modify: `apps/web/src/lib/native/index.ts` (web stubs)

**Interfaces:**
- Produces (TS):

```ts
export type StreamKind = 'hls' | 'mp4' | 'other'

export interface StreamCandidate {
  url: string
  headers?: Record<string, string>
  quality?: string
  title?: string
  moduleId: string
  kind: StreamKind
}

export interface PlayStreamOptions extends SpawnPlayerOptions {
  /** Required https URL */
  url: string
  headers?: Record<string, string>
  playerHint?: PlayerHint // default 'avplayer' for CDN
}

export interface ResolveStreamsOptions {
  title: string
  anilistId: number
  episode: number
  idMal?: number | null
  query?: string
}
```

- Produces (Swift): `PlayerRouter.present(..., headers: [String: String])` applied as:

```swift
let opts = [ "AVURLAssetHTTPHeaderFieldsKey": headers ]
let asset = AVURLAsset(url: url, options: opts)
```

- [ ] **Step 1: Add `packages/shared/src/stream.ts` and export from package index**

- [ ] **Step 2: Extend `SaizenNative` with `playStream(options: PlayStreamOptions): Promise<void>`**

- [ ] **Step 3: Implement Swift `playStream` on `SaizenPlayerPlugin`**
  - Allow only `https` URLs (same as spawnPlayer https branch)
  - Default `playerHint` to `avplayer` when omitted
  - Pass headers into `PlayerRouter`

- [ ] **Step 4: Wire `bridge.ts` → Cap plugin**

- [ ] **Step 5: Manual test** — from a temporary DEBUG call or Safari remote, `playStream` a known public HLS/MP4 URL with headers `{}` opens AVPlayer

- [ ] **Step 6: `pnpm sync:ios` if web/shared changed; commit when asked**

```bash
pnpm sync:ios
git add packages/shared ios/App apps/web/src/lib/native
git commit -m "feat(player): playStream bridge with CDN header support"
```

---

### Task 5: ModuleStore + library install

**Files:**
- Create: `ios/App/SaizenCore/Modules/ModuleStore.swift`
- Modify: Cap plugin (new `SaizenModulesPlugin` **or** methods on `SaizenTorrentPlugin` — prefer **new** `SaizenModulesPlugin` to avoid conflating torrents)
- Modify: `scripts/register-local-ios-plugins.mjs` if new plugin
- Modify: `packages/shared/src/native.ts` + `bridge.ts`

**Interfaces:**
- Produces Swift:

```swift
public struct InstalledModule: Codable, Equatable {
  public var id: String
  public var name: String
  public var scriptUrl: String
  public var baseUrl: String?
  public var enabled: Bool
  public var order: Int
  public var lastSuccessAt: Date?
  public var scriptPath: String // local cache under Application Support/Saizen/Modules/
}

public final class ModuleStore {
  public static let shared = ModuleStore()
  public func list() -> [InstalledModule]
  public func install(from entry: ModuleCatalogEntry) async throws
  public func install(customScriptURL: URL, name: String) async throws
  public func setEnabled(id: String, enabled: Bool) throws
  public func reorder(ids: [String]) throws
  public func remove(id: String) throws
  public func recordSuccess(id: String) throws
  public func lastGoodModule(anilistId: Int) -> String?
  public func setLastGoodModule(anilistId: Int, moduleId: String) throws
}
```

- Bridge methods: `listModules`, `browseModuleCatalog`, `installModule`, `installModuleFromUrl`, `setModuleEnabled`, `reorderModules`, `removeModule`

- [ ] **Step 1: Persist `InstalledModule[]` as JSON in Application Support; cache script bytes on install; reject non-https `scriptUrl`**

- [ ] **Step 2: Cap plugin + register + shared types**

- [ ] **Step 3: Minimal web Modules page** — reuse Extensions page layout patterns: list installed, enable toggle, add from catalog (fetch via bridge), paste URL. Link from Settings “More” next to Extensions (or rename nav label to Modules). **No redesign** — match existing list/row styles.

- [ ] **Step 4: Sync + verify install one catalog module end-to-end from Settings**

- [ ] **Step 5: Commit when asked**

---

### Task 6: StreamResolver + `resolveStreams`

**Files:**
- Create: `ios/App/SaizenCore/Modules/StreamResolver.swift`
- Modify: `SaizenModulesPlugin` (or player plugin) — `resolveStreams`, `resolveAndPlay`
- Modify: `packages/shared` + `bridge.ts`

**Interfaces:**
- Produces:

```swift
public final class StreamResolver {
  public static let shared = StreamResolver()

  public func resolve(
    title: String,
    anilistId: Int,
    episode: Int,
    query: String?
  ) async throws -> [StreamCandidate]

  public func playBest(
    title: String,
    anilistId: Int,
    episode: Int,
    query: String?,
    presenter: UIViewController,
    spawn: SpawnContext
  ) async throws -> StreamCandidate
}
```

Ranking (stable):
1. `kind == .hls` before `.mp4` before `.other`
2. Higher parsed quality (`2160` > `1080` > `720` > `480`)
3. Boost candidates whose `moduleId == lastGoodModule(anilistId)`
4. Preserve module priority order as tie-breaker

Fan-out: for each enabled module in order, open `ModuleResolveSession`, run chain, append candidates, `teardown()`. Continue on module errors. Parallelize with `withTaskGroup` **only if** each task owns its own session (no shared cookies).

`playBest`: try candidates in rank order; on AVPlayer item failed / immediate error, try next; on success `ModuleStore.recordSuccess` + `setLastGoodModule`.

- [ ] **Step 1: Implement ranking as a pure function `rankCandidates(_:lastGood:)` with table-driven checks**

Example checks:

```swift
// lastGood "modA", candidates: mp4@modB 1080, hls@modA 720, hls@modB 1080
// expected order: hls@modA 720, hls@modB 1080, mp4@modB 1080
```

- [ ] **Step 2: Implement `resolve` + bridge `resolveStreams`**

- [ ] **Step 3: Implement `resolveAndPlay` (native fallback loop) OR web-driven loop calling `playStream` per candidate — prefer **native `resolveAndPlay`** so fallback works if web is backgrounded**

- [ ] **Step 4: Device test with ≥1 installed module**

- [ ] **Step 5: Commit when asked**

---

### Task 7: Wire anime Watch path (drop live torrent Watch)

**Files:**
- Modify: `apps/web/src/app/app/anime/page.tsx` — `playResult` / Watch CTA
- Modify: `apps/web/src/components/saizen/EpisodeSourcesSheet.tsx`
- Modify: optionally `apps/web/src/lib/downloads/resolve.ts` for split stream vs torrent results

**Interfaces:**
- Consumes: `native.resolveStreams` / `native.resolveAndPlay` / `native.playStream`
- Must not call `native.playTorrent` from primary Watch

- [ ] **Step 1: Primary Watch button** calls `resolveAndPlay({ title, anilistId, episode, idMal, query: romaji|english })` when `native.isApp`

- [ ] **Step 2: Sources sheet** shows stream candidates from `resolveStreams` first; Play → `playStream`. Torrent/extension results (existing Hayase search) appear under a secondary “Download via torrent” grouping — **Play** hidden or disabled for magnets; **Save** still enqueues torrent

- [ ] **Step 3: Remove or guard the `playTorrent` path in `playResult`** so magnets cannot start progressive Watch

- [ ] **Step 4: Manual QA** — Watch a title with modules installed; confirm logs show no `LibtorrentEngine.play` / Range server for Watch

- [ ] **Step 5: `pnpm sync:ios` + commit when asked**

---

### Task 8: Downloads — HLS/MP4 + keep torrent

**Files:**
- Modify: `packages/shared/src/torrent.ts` — `DownloadKind = 'torrent' | 'http' | 'hls'`
- Modify: `EnqueueDownloadOptions` — optional `headers?: Record<string, string>`, `kind?: DownloadKind`
- Modify: `ios/App/SaizenCore/Downloads/DownloadCoordinator.swift`
- Modify: `apps/web` Save handlers to pass `kind: 'hls' | 'http'` for stream candidates; keep torrent enqueue unchanged for magnet/torrentUrl

**Interfaces:**
- HLS: `AVAssetDownloadURLSession` / `AVAssetDownloadTask` with same headers when supported
- MP4/`http`: existing background `URLSession` path
- Torrent: existing `downloadFullFile` path unchanged

- [ ] **Step 1: Extend kinds in shared + Swift models**

- [ ] **Step 2: Implement HLS download branch in `DownloadCoordinator`** (asset download task; persist bookmark/path like completed HTTP jobs)

- [ ] **Step 3: Sources sheet Save on stream candidate → `enqueueDownload({ source: url, kind: 'hls'|'http', headers, … })`**

- [ ] **Step 4: Verify dual path** — one stream Save completes; one torrent Save still works; Watch still CDN-only

- [ ] **Step 5: Commit when asked**

---

### Task 9: Player defaults + Now Playing polish

**Files:**
- Modify: `ios/App/Plugins/SaizenPlayer/SaizenPlayerPlugin.swift` — default hint for https CDN → `avplayer` (today defaults to `vlc`)
- Modify: `ios/App/SaizenCore/Player/PlayerRouter.swift` — probe: if URL/path looks non-AVF (e.g. `.mkv`) use VLC; else AVPlayer
- Modify: implement `MPNowPlayingInfoCenter` updates in AVPlayer present path (title/episode)

- [ ] **Step 1: Change default `playerHint` for `playStream` / https spawn to `avplayer`**

- [ ] **Step 2: Add lightweight `func preferredHint(for url: URL) -> PlayerHint`**

- [ ] **Step 3: Set now-playing info when AVPlayer starts; clear on dismiss**

- [ ] **Step 4: Device check lock-screen controls**

- [ ] **Step 5: Commit when asked**

---

### Task 10: Docs + product cleanup

**Files:**
- Modify: `README.md` — playback path diagram (CDN Watch; torrent download optional)
- Modify: `docs/REFERENCE.md` — point at active CDN-Watch design
- Modify: `docs/EXTENSIONS.md` — note Watch vs Download roles
- Modify: `apps/web/src/lib/version.ts` — changelog entry for the middleware pivot

- [ ] **Step 1: Update README playback section**

```
Module (JSContext) → StreamCandidate (HLS/MP4) → AVPlayer
Optional: torrent/magnet → DownloadCoordinator (offline only)
```

- [ ] **Step 2: Changelog blurb** (functional, not marketing fluff)

- [ ] **Step 3: Grep for Watch→`playTorrent` and ensure none remain on primary path**

```bash
rg "playTorrent" apps/web/src -n
```

- [ ] **Step 4: Final QA checklist**
  - [ ] Home / Search / Schedule / Settings smoke (unchanged UI)
  - [ ] Watch via module ≥15 minutes continuous once
  - [ ] Seek works
  - [ ] Stream Save + torrent Save
  - [ ] Incognito still skips list sync
  - [ ] Concurrent module resolves do not share cookies (two modules; log cookie storage identity)

- [ ] **Step 5: Commit when asked**

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| Keep Cap UI | 7, 5 (glue only) |
| Native JSContext modules | 2, 3 |
| Session-scoped context | 2 |
| Private URLSession/cookies | 1, 2 |
| Catalog `library.cufiy.net` | 3, 5 |
| StreamResolver rank + fallback | 6 |
| `lastGoodModule` + health | 5, 6 |
| Drop live torrent Watch | 7 |
| Keep torrent downloads | 8 |
| HLS/MP4 downloads | 8 |
| AVPlayer + header injection | 4, 9 |
| VLC probe-only | 9 |
| Now Playing | 9 |
| Day 0 gate | 3 |
| MODULE_CONTRACT.md | 2 |
| Security HTTPS modules | 1, 5 |

## Placeholder / consistency check

- Bridge names used consistently: `playStream`, `resolveStreams`, `resolveAndPlay`, `listModules`, `installModule`, `installModuleFromUrl`, `setModuleEnabled`, `reorderModules`, `removeModule`, `browseModuleCatalog`.
- `DownloadKind` extended with `hls` in Task 8; torrent/http retained.
- Canonical Swift path `ios/App/` + sync script called after native edits.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-11-cdn-watch-keep-ui.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
