import AVFoundation
import Foundation
import UIKit

public enum StreamResolverError: Error, LocalizedError {
  case noEnabledModules
  case noCandidates
  case allPlaybackFailed([String])

  public var errorDescription: String? {
    switch self {
    case .noEnabledModules:
      return "No enabled stream modules. Install one in Settings → Modules."
    case .noCandidates:
      return "No stream candidates from enabled modules"
    case .allPlaybackFailed(let failures):
      return "All stream candidates failed playback: \(failures.joined(separator: " | "))"
    }
  }
}

/// Playback spawn options for `playBest` / `resolveAndPlay` (mirrors Cap `SpawnPlayerOptions` minus URL).
public struct SpawnContext: Sendable {
  public var title: String?
  public var idMal: Int?
  public var playerHint: PlayerHint
  public var options: PlayerSessionOptions

  public init(
    title: String? = nil,
    idMal: Int? = nil,
    playerHint: PlayerHint = .avplayer,
    options: PlayerSessionOptions = .empty
  ) {
    self.title = title
    self.idMal = idMal
    self.playerHint = playerHint
    self.options = options
  }
}

/// Caches per-module show search + episode lists for batch offline queue (avoids 9× search per ep).
private final class ShowResolveCache: @unchecked Sendable {
  static let shared = ShowResolveCache()

  private struct Entry<T> {
    var value: T
    var at: Date
  }

  private let lock = NSLock()
  private var showURLs: [String: Entry<String>] = [:]
  private var episodeLists: [String: Entry<[[String: Any]]>] = [:]
  private let ttl: TimeInterval = 600

  private func showKey(moduleId: String, query: String) -> String {
    "\(moduleId)|\(query.lowercased())"
  }

  private func episodeKey(moduleId: String, showURL: String) -> String {
    "\(moduleId)|\(showURL)"
  }

  func cachedShowURL(moduleId: String, query: String) -> String? {
    lock.lock(); defer { lock.unlock() }
    let key = showKey(moduleId: moduleId, query: query)
    guard let entry = showURLs[key], Date().timeIntervalSince(entry.at) < ttl else { return nil }
    return entry.value
  }

  func storeShowURL(moduleId: String, query: String, url: String) {
    lock.lock()
    showURLs[showKey(moduleId: moduleId, query: query)] = Entry(value: url, at: Date())
    lock.unlock()
  }

  func cachedEpisodes(moduleId: String, showURL: String) -> [[String: Any]]? {
    lock.lock(); defer { lock.unlock() }
    let key = episodeKey(moduleId: moduleId, showURL: showURL)
    guard let entry = episodeLists[key], Date().timeIntervalSince(entry.at) < ttl else { return nil }
    return entry.value
  }

  func storeEpisodes(moduleId: String, showURL: String, episodes: [[String: Any]]) {
    lock.lock()
    episodeLists[episodeKey(moduleId: moduleId, showURL: showURL)] = Entry(value: episodes, at: Date())
    lock.unlock()
  }
}

/// Fan-out enabled modules → rank `StreamCandidate`s → play with AVPlayer fallback.
public final class StreamResolver: @unchecked Sendable {
  public static let shared = StreamResolver()

  private init() {
    #if DEBUG
    Self.runRankingSelfChecks()
    #endif
  }

  // MARK: - Ranking (pure)

  /// Stable ranking:
  /// 1. kind: hls → mp4 → other
  /// 2. boost `moduleId == lastGood`
  /// 3. higher parsed quality
  /// 4. preserve input order (module priority from fan-out)
  public static func rankCandidates(_ candidates: [StreamCandidate], lastGood: String?) -> [StreamCandidate] {
    candidates.enumerated().sorted { lhs, rhs in
      let (li, a) = lhs
      let (ri, b) = rhs

      let kindA = kindRank(a.kind)
      let kindB = kindRank(b.kind)
      if kindA != kindB { return kindA < kindB }

      let goodA = lastGood.map { a.moduleId == $0 } ?? false
      let goodB = lastGood.map { b.moduleId == $0 } ?? false
      if goodA != goodB { return goodA && !goodB }

      let qA = parseQuality(a.quality)
      let qB = parseQuality(b.quality)
      if qA != qB { return qA > qB }

      return li < ri
    }.map(\.element)
  }

  public static func parseQuality(_ raw: String?) -> Int {
    guard let raw, !raw.isEmpty else { return 0 }
    let digits = raw.filter(\.isNumber)
    if let n = Int(digits), n > 0 { return n }
    let lower = raw.lowercased()
    if lower.contains("4k") || lower.contains("2160") { return 2160 }
    if lower.contains("1080") || lower.contains("fhd") { return 1080 }
    if lower.contains("720") || lower.contains("hd") { return 720 }
    if lower.contains("480") || lower.contains("sd") { return 480 }
    return 0
  }

  private static func kindRank(_ kind: StreamKind) -> Int {
    switch kind {
    case .hls: return 0
    case .mp4: return 1
    case .other: return 2
    }
  }

  // MARK: - Resolve

  private static func enabledModules(allowNsfw: Bool) -> [InstalledModule] {
    ModuleStore.shared.list().filter { module in
      guard module.enabled else { return false }
      if module.nsfw && !allowNsfw { return false }
      return true
    }
  }

  public func resolve(
    title: String,
    anilistId: Int,
    episode: Int,
    query: String?,
    allowNsfw: Bool = false
  ) async throws -> [StreamCandidate] {
    let modules = Self.enabledModules(allowNsfw: allowNsfw)
    guard !modules.isEmpty else { throw StreamResolverError.noEnabledModules }

    let searchQuery = (query?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : $0 }
      ?? title.trimmingCharacters(in: .whitespacesAndNewlines)

    var buckets = Array(repeating: [StreamCandidate](), count: modules.count)

    await withTaskGroup(of: (Int, [StreamCandidate]).self) { group in
      for (index, module) in modules.enumerated() {
        group.addTask {
          let found = await Self.resolveModule(
            module: module,
            query: searchQuery,
            episode: episode
          )
          return (index, found)
        }
      }
      for await (index, found) in group {
        buckets[index] = found
      }
    }

    let collected = buckets.flatMap { $0 }
    let lastGood = ModuleStore.shared.lastGoodModule(anilistId: anilistId)
    let ranked = Self.rankCandidates(collected, lastGood: lastGood)
    NSLog(
      "[Saizen] StreamResolver resolve anilistId=%d ep=%d modules=%d candidates=%d ranked=%d lastGood=%@",
      anilistId,
      episode,
      modules.count,
      collected.count,
      ranked.count,
      lastGood ?? "-"
    )
    return ranked
  }

  /// Download path: try lastGood module first, then others sequentially — stop at first module with streams.
  public func resolveForDownload(
    title: String,
    anilistId: Int,
    episode: Int,
    query: String?,
    allowNsfw: Bool = false
  ) async throws -> [StreamCandidate] {
    let modules = Self.enabledModules(allowNsfw: allowNsfw)
    guard !modules.isEmpty else { throw StreamResolverError.noEnabledModules }

    let searchQuery = (query?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : $0 }
      ?? title.trimmingCharacters(in: .whitespacesAndNewlines)
    let lastGood = ModuleStore.shared.lastGoodModule(anilistId: anilistId)
    let ordered = Self.orderModulesForDownload(modules, lastGood: lastGood)

    var collected: [StreamCandidate] = []
    for module in ordered {
      let found = await Self.resolveModuleCached(
        module: module,
        query: searchQuery,
        episode: episode
      )
      if !found.isEmpty {
        collected = found
        break
      }
    }

    let ranked = Self.rankCandidates(collected, lastGood: lastGood)
    NSLog(
      "[Saizen] StreamResolver resolveForDownload anilistId=%d ep=%d tried=%d candidates=%d lastGood=%@",
      anilistId,
      episode,
      ordered.count,
      ranked.count,
      lastGood ?? "-"
    )
    return ranked
  }

  /// Batch offline queue: one show lookup per module, then only `extractStreamUrl` per episode.
  public func resolveBatchForDownload(
    title: String,
    anilistId: Int,
    episodes: [Int],
    query: String?,
    allowNsfw: Bool = false
  ) async throws -> [[String: Any]] {
    let modules = Self.enabledModules(allowNsfw: allowNsfw)
    guard !modules.isEmpty else { throw StreamResolverError.noEnabledModules }
    let wanted = episodes.filter { $0 > 0 }
    guard !wanted.isEmpty else { throw StreamResolverError.noCandidates }

    let searchQuery = (query?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : $0 }
      ?? title.trimmingCharacters(in: .whitespacesAndNewlines)
    let lastGood = ModuleStore.shared.lastGoodModule(anilistId: anilistId)
    let ordered = Self.orderModulesForDownload(modules, lastGood: lastGood)

    for module in ordered {
      guard let batch = await Self.resolveBatchOnModule(
        module: module,
        query: searchQuery,
        episodes: wanted,
        lastGood: lastGood
      ), !batch.isEmpty else { continue }

      NSLog(
        "[Saizen] StreamResolver resolveBatchForDownload anilistId=%d module=%@ eps=%d/%d lastGood=%@",
        anilistId,
        module.id,
        batch.count,
        wanted.count,
        lastGood ?? "-"
      )
      return batch
    }

    throw StreamResolverError.noCandidates
  }

  private static func orderModulesForDownload(
    _ modules: [InstalledModule],
    lastGood: String?
  ) -> [InstalledModule] {
    guard let lastGood, !lastGood.isEmpty else { return modules }
    var out: [InstalledModule] = []
    if let first = modules.first(where: { $0.id == lastGood }) {
      out.append(first)
    }
    for module in modules where module.id != lastGood {
      out.append(module)
    }
    return out
  }

  private static func resolveBatchOnModule(
    module: InstalledModule,
    query: String,
    episodes: [Int],
    lastGood: String?
  ) async -> [[String: Any]]? {
    let scriptSource: String
    do {
      scriptSource = try await ModuleStore.shared.loadScriptSource(for: module.id)
    } catch {
      return nil
    }

    let baseURL = module.baseUrl.flatMap(URL.init(string:))
    let session: ModuleResolveSession
    do {
      session = try ModuleResolveSession(
        moduleId: module.id,
        scriptSource: scriptSource,
        baseURL: baseURL
      )
    } catch {
      return nil
    }

    defer { session.teardown() }

    do {
      let cache = ShowResolveCache.shared
      let showURL: String
      if let cached = cache.cachedShowURL(moduleId: module.id, query: query) {
        showURL = cached
      } else {
        let results = try await session.searchResults(query)
        guard let found = firstURLString(in: results) else { return nil }
        showURL = found
        cache.storeShowURL(moduleId: module.id, query: query, url: found)
      }

      let episodeRows: [[String: Any]]
      if let cached = cache.cachedEpisodes(moduleId: module.id, showURL: showURL) {
        episodeRows = cached
      } else {
        episodeRows = try await session.extractEpisodes(showURL)
        cache.storeEpisodes(moduleId: module.id, showURL: showURL, episodes: episodeRows)
      }

      var payload: [[String: Any]] = []
      for ep in episodes {
        guard let episodeURL = pickEpisodeURL(from: episodeRows, episode: ep) else { continue }
        let streams = try await session.extractStreamUrl(episodeURL)
        guard !streams.isEmpty else { continue }
        let ranked = rankCandidates(streams, lastGood: lastGood)
        payload.append([
          "episode": ep,
          "candidates": ranked.map { encodeCandidateDict($0) }
        ])
      }
      return payload.isEmpty ? nil : payload
    } catch {
      NSLog(
        "[Saizen] StreamResolver batch module=%@ error=%@",
        module.id,
        errorMessage(error)
      )
      return nil
    }
  }

  private static func resolveModuleCached(
    module: InstalledModule,
    query: String,
    episode: Int
  ) async -> [StreamCandidate] {
    let scriptSource: String
    do {
      scriptSource = try await ModuleStore.shared.loadScriptSource(for: module.id)
    } catch {
      return []
    }

    let baseURL = module.baseUrl.flatMap(URL.init(string:))
    let session: ModuleResolveSession
    do {
      session = try ModuleResolveSession(
        moduleId: module.id,
        scriptSource: scriptSource,
        baseURL: baseURL
      )
    } catch {
      return []
    }

    defer { session.teardown() }

    do {
      let cache = ShowResolveCache.shared
      let showURL: String
      if let cached = cache.cachedShowURL(moduleId: module.id, query: query) {
        showURL = cached
      } else {
        let results = try await session.searchResults(query)
        guard let found = firstURLString(in: results) else { return [] }
        showURL = found
        cache.storeShowURL(moduleId: module.id, query: query, url: found)
      }

      let episodeRows: [[String: Any]]
      if let cached = cache.cachedEpisodes(moduleId: module.id, showURL: showURL) {
        episodeRows = cached
      } else {
        episodeRows = try await session.extractEpisodes(showURL)
        cache.storeEpisodes(moduleId: module.id, showURL: showURL, episodes: episodeRows)
      }

      guard let episodeURL = pickEpisodeURL(from: episodeRows, episode: episode) else { return [] }
      return try await session.extractStreamUrl(episodeURL)
    } catch {
      NSLog(
        "[Saizen] StreamResolver module=%@ chain error=%@",
        module.id,
        errorMessage(error)
      )
      return []
    }
  }

  private static func encodeCandidateDict(_ candidate: StreamCandidate) -> [String: Any] {
    var d: [String: Any] = [
      "url": candidate.url.absoluteString,
      "moduleId": candidate.moduleId,
      "kind": candidate.kind.rawValue
    ]
    if let quality = candidate.quality { d["quality"] = quality }
    if let title = candidate.title { d["title"] = title }
    if !candidate.headers.isEmpty { d["headers"] = candidate.headers }
    if let subtitle = candidate.subtitle { d["subtitle"] = subtitle.absoluteString }
    return d
  }

  public func playBest(
    title: String,
    anilistId: Int,
    episode: Int,
    query: String?,
    presenter: UIViewController,
    spawn: SpawnContext,
    allowNsfw: Bool = false
  ) async throws -> StreamCandidate {
    let candidates = try await resolve(
      title: title,
      anilistId: anilistId,
      episode: episode,
      query: query,
      allowNsfw: allowNsfw
    )
    guard !candidates.isEmpty else { throw StreamResolverError.noCandidates }

    var failures: [String] = []
    for candidate in candidates {
      let ok = await Self.probePlayback(url: candidate.url, headers: candidate.headers)
      if !ok {
        let msg = "\(candidate.moduleId) \(candidate.kind.rawValue) \(candidate.url.host ?? "?")"
        failures.append(msg)
        NSLog("[Saizen] StreamResolver probe failed %@", msg)
        continue
      }

      let displayTitle = spawn.title
        ?? candidate.title
        ?? title
      let context = PlaybackContext(
        anilistId: anilistId,
        episode: episode,
        idMal: spawn.idMal,
        options: spawn.options
      )

      await MainActor.run {
        let top = Self.topPresenter(from: presenter)
        PlayerRouter.present(
          from: top,
          url: candidate.url,
          hint: spawn.playerHint,
          title: displayTitle,
          context: context,
          headers: candidate.headers,
          subtitleURL: candidate.subtitle
        )
      }

      do {
        try ModuleStore.shared.recordSuccess(id: candidate.moduleId)
        try ModuleStore.shared.setLastGoodModule(anilistId: anilistId, moduleId: candidate.moduleId)
      } catch {
        NSLog(
          "[Saizen] StreamResolver success bookkeeping failed: %@",
          error.localizedDescription
        )
      }

      NSLog(
        "[Saizen] StreamResolver playBest ok module=%@ kind=%@ url=%@",
        candidate.moduleId,
        candidate.kind.rawValue,
        candidate.url.absoluteString
      )
      return candidate
    }

    throw StreamResolverError.allPlaybackFailed(failures)
  }

  // MARK: - Per-module chain

  private static func resolveModule(
    module: InstalledModule,
    query: String,
    episode: Int
  ) async -> [StreamCandidate] {
    let scriptSource: String
    do {
      scriptSource = try await ModuleStore.shared.loadScriptSource(for: module.id)
    } catch {
      NSLog(
        "[Saizen] StreamResolver missing script module=%@ error=%@",
        module.id,
        errorMessage(error)
      )
      return []
    }

    let baseURL = module.baseUrl.flatMap(URL.init(string:))
    let session: ModuleResolveSession
    do {
      session = try ModuleResolveSession(
        moduleId: module.id,
        scriptSource: scriptSource,
        baseURL: baseURL
      )
    } catch {
      NSLog(
        "[Saizen] StreamResolver session init failed module=%@ error=%@",
        module.id,
        errorMessage(error)
      )
      return []
    }

    defer { session.teardown() }

    do {
      let results = try await session.searchResults(query)
      guard let showURL = firstURLString(in: results) else {
        NSLog("[Saizen] StreamResolver no search url module=%@", module.id)
        // AnimePahe (jLCx0) routes every request through tmdbproxy22…/solver.
        // When that worker returns Cloudflare 525, search JSON has no `data` and
        // the module returns empty hrefs — install Animex/Aniwave instead.
        if module.id == "jLCx0" || module.name.lowercased().contains("animepahe") {
          NSLog(
            "[Saizen] StreamResolver hint: AnimePahe bypass worker likely down — try Animex (jjqos) or Aniwave (zc8g) in Settings → Modules"
          )
        }
        return []
      }
      let episodes = try await session.extractEpisodes(showURL)
      guard let episodeURL = pickEpisodeURL(from: episodes, episode: episode) else {
        NSLog("[Saizen] StreamResolver no episode url module=%@ ep=%d", module.id, episode)
        return []
      }
      let streams = try await session.extractStreamUrl(episodeURL)
      NSLog(
        "[Saizen] StreamResolver module=%@ streams=%d",
        module.id,
        streams.count
      )
      return streams
    } catch {
      NSLog(
        "[Saizen] StreamResolver module=%@ chain error=%@",
        module.id,
        errorMessage(error)
      )
      return []
    }
  }

  private static func firstURLString(in items: [[String: Any]]) -> String? {
    items.compactMap { $0["url"] as? String }.first(where: { !$0.isEmpty })
  }

  private static func pickEpisodeURL(from episodes: [[String: Any]], episode: Int) -> String? {
    for item in episodes {
      if let n = intValue(item["number"]) ?? intValue(item["episode"]) ?? intValue(item["ep"]),
         n == episode,
         let url = (item["url"] as? String) ?? (item["href"] as? String),
         !url.isEmpty {
        return url
      }
    }
    // Index fallback only when the module omitted episode numbers entirely.
    // Never fall back to episodes[0] for a different requested episode — that
    // silently plays E01 when extractEpisodes returned a partial list.
    let anyNumbered = episodes.contains {
      intValue($0["number"]) != nil || intValue($0["episode"]) != nil || intValue($0["ep"]) != nil
    }
    if !anyNumbered, episode >= 1, episode <= episodes.count {
      if let url = (episodes[episode - 1]["url"] as? String) ?? (episodes[episode - 1]["href"] as? String),
         !url.isEmpty {
        return url
      }
    }
    return nil
  }

  private static func intValue(_ raw: Any?) -> Int? {
    if let i = raw as? Int { return i }
    if let n = raw as? NSNumber { return n.intValue }
    if let d = raw as? Double { return Int(d) }
    if let s = raw as? String {
      let digits = s.filter(\.isNumber)
      if let n = Int(digits), !digits.isEmpty { return n }
    }
    return nil
  }

  // MARK: - Playback probe

  /// Wait for AVPlayerItem readyToPlay / failed (immediate-ish). Timeout → treat as failure.
  private static func probePlayback(url: URL, headers: [String: String], timeout: TimeInterval = 15) async -> Bool {
    await withCheckedContinuation { continuation in
      let resume = ResumeOnceBox()
      DispatchQueue.main.async {
        let opts: [String: Any] = ["AVURLAssetHTTPHeaderFieldsKey": headers]
        let asset = AVURLAsset(url: url, options: opts)
        let item = AVPlayerItem(asset: asset)
        let player = AVPlayer(playerItem: item)

        var observer: NSKeyValueObservation?
        let finish: (Bool) -> Void = { ok in
          resume.resume {
            observer?.invalidate()
            player.replaceCurrentItem(with: nil)
            continuation.resume(returning: ok)
          }
        }

        let timeoutWork = DispatchWorkItem {
          finish(false)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + timeout, execute: timeoutWork)

        observer = item.observe(\.status, options: [.initial, .new]) { item, _ in
          switch item.status {
          case .readyToPlay:
            timeoutWork.cancel()
            finish(true)
          case .failed:
            timeoutWork.cancel()
            finish(false)
          case .unknown:
            break
          @unknown default:
            break
          }
        }
      }
    }
  }

  @MainActor
  private static func topPresenter(from root: UIViewController) -> UIViewController {
    var presenter = root
    while let presented = presenter.presentedViewController {
      presenter = presented
    }
    return presenter
  }

  private static func errorMessage(_ error: Error) -> String {
    if let localized = error as? LocalizedError, let description = localized.errorDescription {
      return description
    }
    return error.localizedDescription
  }

  #if DEBUG
  /// Table-driven ranking checks (brief example + a few extras).
  public static func runRankingSelfChecks() {
    func cand(moduleId: String, kind: StreamKind, quality: String?, orderHint: String) -> StreamCandidate {
      StreamCandidate(
        url: URL(string: "https://example.com/\(orderHint).m3u8")!,
        headers: [:],
        quality: quality,
        title: orderHint,
        moduleId: moduleId,
        kind: kind
      )
    }

    // Brief example: lastGood "modA", candidates: mp4@modB 1080, hls@modA 720, hls@modB 1080
    // expected: hls@modA 720, hls@modB 1080, mp4@modB 1080
    let input = [
      cand(moduleId: "modB", kind: .mp4, quality: "1080", orderHint: "mp4-b"),
      cand(moduleId: "modA", kind: .hls, quality: "720", orderHint: "hls-a"),
      cand(moduleId: "modB", kind: .hls, quality: "1080", orderHint: "hls-b")
    ]
    let ranked = rankCandidates(input, lastGood: "modA")
    let ids = ranked.map { "\($0.kind.rawValue)@\($0.moduleId) \($0.quality ?? "?")" }
    let expected = ["hls@modA 720", "hls@modB 1080", "mp4@modB 1080"]
    assert(ids == expected, "rankCandidates brief example failed: \(ids)")

    // Quality ordering when lastGood absent
    let qIn = [
      cand(moduleId: "m", kind: .hls, quality: "720", orderHint: "720"),
      cand(moduleId: "m", kind: .hls, quality: "1080", orderHint: "1080"),
      cand(moduleId: "m", kind: .hls, quality: "480", orderHint: "480")
    ]
    let qOut = rankCandidates(qIn, lastGood: nil).compactMap(\.quality)
    assert(qOut == ["1080", "720", "480"], "quality order failed: \(qOut)")

    // Stable module priority when kind+quality+lastGood tie
    let pIn = [
      cand(moduleId: "first", kind: .hls, quality: "1080", orderHint: "a"),
      cand(moduleId: "second", kind: .hls, quality: "1080", orderHint: "b")
    ]
    let pOut = rankCandidates(pIn, lastGood: nil).map(\.moduleId)
    assert(pOut == ["first", "second"], "stable order failed: \(pOut)")

    NSLog("[Saizen] StreamResolver ranking self-checks passed")
  }
  #endif
}

private final class ResumeOnceBox: @unchecked Sendable {
  private let lock = NSLock()
  private var didResume = false

  func resume(_ block: () -> Void) {
    lock.lock()
    guard !didResume else {
      lock.unlock()
      return
    }
    didResume = true
    lock.unlock()
    block()
  }
}
