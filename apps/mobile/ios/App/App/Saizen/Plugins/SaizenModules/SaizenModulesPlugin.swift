import Capacitor
import Foundation
import UIKit

/// Capacitor plugin: CDN stream module library (install / enable / order) + resolve/play.
@objc(SaizenModulesPlugin)
public class SaizenModulesPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "SaizenModulesPlugin"
  public let jsName = "SaizenModules"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "listModules", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "browseModuleCatalog", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "listExtraModuleCatalogs", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "addExtraModuleCatalog", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "removeExtraModuleCatalog", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "installModule", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "installModuleFromUrl", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "testModule", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "setModuleEnabled", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "reorderModules", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "removeModule", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "resolveStreams", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "resolveStreamsBatch", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "resolveAndPlay", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "recordModuleSuccess", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "browseAdultHome", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "searchAdult", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "adultExtractEpisodes", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "adultExtractStreams", returnType: CAPPluginReturnPromise)
  ]

  /// Capacitor bridge calls must complete on the main queue — resolving from a
  /// detached `Task` has blanked the Modules WebView after install/reinstall.
  private func resolve(_ call: CAPPluginCall, _ data: PluginCallResultData = [:]) {
    DispatchQueue.main.async { call.resolve(data) }
  }

  private func reject(_ call: CAPPluginCall, _ message: String) {
    DispatchQueue.main.async { call.reject(message) }
  }

  @objc func listModules(_ call: CAPPluginCall) {
    let modules = ModuleStore.shared.list().map { Self.encodeModule($0) }
    resolve(call, ["modules": modules])
  }

  @objc func browseModuleCatalog(_ call: CAPPluginCall) {
    Task {
      do {
        let entries = try await ModuleLibraryClient.fetchCatalog()
        self.resolve(call, ["entries": entries.map { Self.encodeCatalogEntry($0) }])
      } catch {
        self.reject(call, error.localizedDescription)
      }
    }
  }

  @objc func listExtraModuleCatalogs(_ call: CAPPluginCall) {
    let catalogs = ModuleLibraryClient.extraCatalogURLs().map {
      ["url": $0.absoluteString] as [String: Any]
    }
    resolve(call, ["catalogs": catalogs])
  }

  @objc func addExtraModuleCatalog(_ call: CAPPluginCall) {
    guard let urlString = call.getString("url")?.trimmingCharacters(in: .whitespacesAndNewlines),
          let url = URL(string: urlString)
    else {
      reject(call, "Missing or invalid url")
      return
    }
    do {
      let urls = try ModuleLibraryClient.addExtraCatalogURL(url)
      resolve(call, [
        "catalogs": urls.map { ["url": $0.absoluteString] as [String: Any] }
      ])
    } catch {
      reject(call, error.localizedDescription)
    }
  }

  @objc func removeExtraModuleCatalog(_ call: CAPPluginCall) {
    guard let urlString = call.getString("url")?.trimmingCharacters(in: .whitespacesAndNewlines),
          let url = URL(string: urlString)
    else {
      reject(call, "Missing or invalid url")
      return
    }
    let urls = ModuleLibraryClient.removeExtraCatalogURL(url)
    resolve(call, [
      "catalogs": urls.map { ["url": $0.absoluteString] as [String: Any] }
    ])
  }

  @objc func installModule(_ call: CAPPluginCall) {
    guard let id = call.getString("id")?.trimmingCharacters(in: .whitespacesAndNewlines), !id.isEmpty else {
      reject(call, "Missing id")
      return
    }
    let scriptUrl = call.getString("scriptUrl")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let sourceName =
      call.getString("sourceName")?.trimmingCharacters(in: .whitespacesAndNewlines)
      ?? call.getString("name")?.trimmingCharacters(in: .whitespacesAndNewlines)
      ?? id
    let nsfw = call.getBool("nsfw")

    Task {
      do {
        let entry: ModuleCatalogEntry
        if !scriptUrl.isEmpty {
          entry = ModuleCatalogEntry(
            id: id,
            sourceName: sourceName.isEmpty ? id : sourceName,
            scriptUrl: scriptUrl,
            baseUrl: call.getString("baseUrl"),
            streamType: call.getString("streamType"),
            status: call.getString("status"),
            type: call.getString("type"),
            quality: call.getString("quality"),
            nsfw: nsfw
          )
        } else {
          let catalog = try await ModuleLibraryClient.fetchCatalog()
          guard let found = catalog.first(where: { $0.id == id }) else {
            self.reject(call, "Catalog entry not found: \(id)")
            return
          }
          entry = found
        }
        try await ModuleStore.shared.install(from: entry)
        let modules = ModuleStore.shared.list().map { Self.encodeModule($0) }
        self.resolve(call, ["modules": modules])
      } catch {
        self.reject(call, error.localizedDescription)
      }
    }
  }

  @objc func installModuleFromUrl(_ call: CAPPluginCall) {
    guard let urlString = call.getString("url")?.trimmingCharacters(in: .whitespacesAndNewlines),
          let url = URL(string: urlString)
    else {
      reject(call, "Missing or invalid url")
      return
    }
    let name =
      call.getString("name")?.trimmingCharacters(in: .whitespacesAndNewlines)
      ?? url.lastPathComponent
    let nsfw = call.getBool("nsfw") ?? false
    Task {
      do {
        try await ModuleStore.shared.install(
          customScriptURL: url,
          name: name.isEmpty ? "Custom module" : name,
          nsfw: nsfw
        )
        let modules = ModuleStore.shared.list().map { Self.encodeModule($0) }
        self.resolve(call, ["modules": modules])
      } catch {
        self.reject(call, error.localizedDescription)
      }
    }
  }

  @objc func testModule(_ call: CAPPluginCall) {
    guard let id = call.getString("id")?.trimmingCharacters(in: .whitespacesAndNewlines), !id.isEmpty else {
      reject(call, "Missing id")
      return
    }
    let query = call.getString("query")?.trimmingCharacters(in: .whitespacesAndNewlines)

    Task {
      do {
        let result = try await Self.runModuleTest(id: id, query: query)
        self.resolve(call, result)
      } catch {
        self.reject(call, error.localizedDescription)
      }
    }
  }

  @objc func browseAdultHome(_ call: CAPPluginCall) {
    guard call.getBool("allowNsfw") == true else {
      reject(call, "Adult browse requires Adult Mode")
      return
    }
    guard let moduleId = call.getString("moduleId")?.trimmingCharacters(in: .whitespacesAndNewlines),
          !moduleId.isEmpty
    else {
      reject(call, "Missing moduleId")
      return
    }
    let railQueries = (call.getArray("railQueries", String.self) ?? [])
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
    let railTitles = (call.getArray("railTitles", String.self) ?? [])
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }

    Task {
      do {
        let session = try await Self.openNsfwSession(moduleId: moduleId)
        defer { session.teardown() }

        // Skip getHomeSections when the web already sends catalog rails — that was
        // an extra serialized round-trip before the slow sequential loop.
        var sections: [[String: Any]] = []
        let genres: [[String: Any]]
        if railQueries.isEmpty {
          async let home = session.getHomeSections()
          async let gens = session.getGenres()
          sections = try await home
          genres = try await gens
        } else {
          // Haho rate-limits under Promise.all rail storms — sequential exception.
          let serializeRails = moduleId.lowercased().contains("haho")
          #if DEBUG
          if serializeRails {
            NSLog("[Saizen] browseAdultHome serial rails module=%@", moduleId)
          }
          #endif
          let batches: [[[String: Any]]]
          if serializeRails {
            var rows: [[[String: Any]]] = []
            for query in railQueries {
              do {
                rows.append(try await session.searchResults(query))
              } catch {
                #if DEBUG
                NSLog(
                  "[Saizen] browseAdultHome rail %@: %@",
                  query,
                  error.localizedDescription
                )
                #endif
                rows.append([])
              }
            }
            batches = rows
          } else {
            batches = try await session.searchResultsBatch(railQueries)
          }
          genres = try await session.getGenres()
          var rails: [[String: Any]] = []
          for (idx, results) in batches.enumerated() {
            #if DEBUG
            let q = idx < railQueries.count ? railQueries[idx] : "?"
            NSLog("[Saizen] browseAdultHome rail %@ -> %d hits", q, results.count)
            #endif
            guard !results.isEmpty else { continue }
            let query = idx < railQueries.count ? railQueries[idx] : "rail-\(idx)"
            let title: String = {
              if idx < railTitles.count, !railTitles[idx].isEmpty { return railTitles[idx] }
              if query.lowercased().hasPrefix("order:") {
                return query
                  .dropFirst("order:".count)
                  .replacingOccurrences(of: "-", with: " ")
                  .capitalized
              }
              return query
            }()
            rails.append([
              "id": query.lowercased(),
              "title": title,
              "items": results
            ])
          }
          sections = rails
        }

        self.resolve(call, ["sections": sections, "genres": genres])
      } catch {
        self.reject(call, error.localizedDescription)
      }
    }
  }

  @objc func searchAdult(_ call: CAPPluginCall) {
    guard call.getBool("allowNsfw") == true else {
      reject(call, "Adult search requires Adult Mode")
      return
    }
    guard let moduleId = call.getString("moduleId")?.trimmingCharacters(in: .whitespacesAndNewlines),
          !moduleId.isEmpty
    else {
      reject(call, "Missing moduleId")
      return
    }
    let query = call.getString("query")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !query.isEmpty else {
      reject(call, "Missing query")
      return
    }

    Task {
      do {
        let session = try await Self.openNsfwSession(moduleId: moduleId)
        defer { session.teardown() }
        let results = try await session.searchResults(query)
        self.resolve(call, ["results": results])
      } catch {
        self.reject(call, error.localizedDescription)
      }
    }
  }

  @objc func adultExtractEpisodes(_ call: CAPPluginCall) {
    guard call.getBool("allowNsfw") == true else {
      reject(call, "Adult extract requires Adult Mode")
      return
    }
    guard let moduleId = call.getString("moduleId")?.trimmingCharacters(in: .whitespacesAndNewlines),
          !moduleId.isEmpty
    else {
      reject(call, "Missing moduleId")
      return
    }
    guard let showUrl = call.getString("showUrl")?.trimmingCharacters(in: .whitespacesAndNewlines),
          !showUrl.isEmpty
    else {
      reject(call, "Missing showUrl")
      return
    }

    Task {
      do {
        let session = try await Self.openNsfwSession(moduleId: moduleId)
        defer { session.teardown() }
        let episodes = try await session.extractEpisodes(showUrl)
        self.resolve(call, ["episodes": episodes])
      } catch {
        self.reject(call, error.localizedDescription)
      }
    }
  }

  @objc func adultExtractStreams(_ call: CAPPluginCall) {
    guard call.getBool("allowNsfw") == true else {
      reject(call, "Adult extract requires Adult Mode")
      return
    }
    guard let moduleId = call.getString("moduleId")?.trimmingCharacters(in: .whitespacesAndNewlines),
          !moduleId.isEmpty
    else {
      reject(call, "Missing moduleId")
      return
    }
    guard let episodeUrl = call.getString("episodeUrl")?.trimmingCharacters(in: .whitespacesAndNewlines),
          !episodeUrl.isEmpty
    else {
      reject(call, "Missing episodeUrl")
      return
    }

    Task {
      do {
        let session = try await Self.openNsfwSession(moduleId: moduleId)
        defer { session.teardown() }
        let streams = try await session.extractStreamUrl(episodeUrl)
        self.resolve(call, ["candidates": streams.map { Self.encodeCandidate($0) }])
      } catch {
        self.reject(call, error.localizedDescription)
      }
    }
  }

  @objc func setModuleEnabled(_ call: CAPPluginCall) {
    guard let id = call.getString("id")?.trimmingCharacters(in: .whitespacesAndNewlines), !id.isEmpty else {
      reject(call, "Missing id")
      return
    }
    guard let enabled = call.getBool("enabled") else {
      reject(call, "Missing enabled")
      return
    }
    do {
      try ModuleStore.shared.setEnabled(id: id, enabled: enabled)
      resolve(call, ["ok": true])
    } catch {
      reject(call, error.localizedDescription)
    }
  }

  @objc func reorderModules(_ call: CAPPluginCall) {
    guard let ids = call.getArray("ids", String.self) else {
      reject(call, "Missing ids")
      return
    }
    do {
      try ModuleStore.shared.reorder(ids: ids)
      let modules = ModuleStore.shared.list().map { Self.encodeModule($0) }
      resolve(call, ["modules": modules])
    } catch {
      reject(call, error.localizedDescription)
    }
  }

  @objc func removeModule(_ call: CAPPluginCall) {
    guard let id = call.getString("id")?.trimmingCharacters(in: .whitespacesAndNewlines), !id.isEmpty else {
      reject(call, "Missing id")
      return
    }
    do {
      try ModuleStore.shared.remove(id: id)
      let modules = ModuleStore.shared.list().map { Self.encodeModule($0) }
      resolve(call, ["modules": modules])
    } catch {
      reject(call, error.localizedDescription)
    }
  }

  @objc func resolveStreams(_ call: CAPPluginCall) {
    guard let title = call.getString("title")?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty else {
      reject(call, "Missing title")
      return
    }
    let anilistId = call.getInt("anilistId") ?? call.getInt("mediaId") ?? 0
    let episode = call.getInt("episode") ?? 0
    guard anilistId > 0, episode > 0 else {
      reject(call, "Missing anilistId or episode")
      return
    }
    let query = call.getString("query")
    let fast = call.getBool("fast") ?? false
    let allowNsfw = call.getBool("allowNsfw") ?? false

    Task {
      do {
        let candidates: [StreamCandidate]
        if fast {
          candidates = try await StreamResolver.shared.resolveForDownload(
            title: title,
            anilistId: anilistId,
            episode: episode,
            query: query,
            allowNsfw: allowNsfw
          )
        } else {
          candidates = try await StreamResolver.shared.resolve(
            title: title,
            anilistId: anilistId,
            episode: episode,
            query: query,
            allowNsfw: allowNsfw
          )
        }
        self.resolve(call, ["candidates": candidates.map { Self.encodeCandidate($0) }])
      } catch {
        self.reject(call, error.localizedDescription)
      }
    }
  }

  @objc func resolveStreamsBatch(_ call: CAPPluginCall) {
    guard let title = call.getString("title")?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty else {
      reject(call, "Missing title")
      return
    }
    let anilistId = call.getInt("anilistId") ?? call.getInt("mediaId") ?? 0
    guard anilistId > 0 else {
      reject(call, "Missing anilistId")
      return
    }
    let episodes = call.getArray("episodes", Int.self) ?? []
    guard !episodes.isEmpty else {
      reject(call, "Missing episodes")
      return
    }
    let query = call.getString("query")
    let allowNsfw = call.getBool("allowNsfw") ?? false

    Task {
      do {
        let results = try await StreamResolver.shared.resolveBatchForDownload(
          title: title,
          anilistId: anilistId,
          episodes: episodes,
          query: query,
          allowNsfw: allowNsfw
        )
        self.resolve(call, ["results": results])
      } catch {
        self.reject(call, error.localizedDescription)
      }
    }
  }

  @objc func resolveAndPlay(_ call: CAPPluginCall) {
    guard let title = call.getString("title")?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty else {
      reject(call, "Missing title")
      return
    }
    let anilistId = call.getInt("anilistId") ?? call.getInt("mediaId") ?? 0
    let episode = call.getInt("episode") ?? 0
    guard anilistId > 0, episode > 0 else {
      reject(call, "Missing anilistId or episode")
      return
    }
    let query = call.getString("query")
    let idMal = call.getInt("idMal")
    let allowNsfw = call.getBool("allowNsfw") ?? false
    let spawn = Self.parseSpawnContext(call, fallbackTitle: title, idMal: idMal)

    DispatchQueue.main.async {
      guard let root = self.bridge?.viewController else {
        self.reject(call, "No view controller")
        return
      }
      Task {
        do {
          let winner = try await StreamResolver.shared.playBest(
            title: title,
            anilistId: anilistId,
            episode: episode,
            query: query,
            presenter: root,
            spawn: spawn,
            allowNsfw: allowNsfw
          )
          self.resolve(call, ["candidate": Self.encodeCandidate(winner)])
        } catch {
          self.reject(call, error.localizedDescription)
        }
      }
    }
  }

  /// Bookkeeping for product Watch after successful CDN `playStream`.
  @objc func recordModuleSuccess(_ call: CAPPluginCall) {
    guard let moduleId = call.getString("moduleId")?.trimmingCharacters(in: .whitespacesAndNewlines),
          !moduleId.isEmpty
    else {
      reject(call, "Missing moduleId")
      return
    }
    let anilistId = call.getInt("anilistId") ?? call.getInt("mediaId") ?? 0
    guard anilistId > 0 else {
      reject(call, "Missing anilistId")
      return
    }
    do {
      try ModuleStore.shared.recordSuccess(id: moduleId)
      try ModuleStore.shared.setLastGoodModule(anilistId: anilistId, moduleId: moduleId)
      resolve(call, ["ok": true])
    } catch {
      reject(call, error.localizedDescription)
    }
  }

  // MARK: - Encoding

  private static let isoFormatter: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
  }()

  private static func encodeModule(_ m: InstalledModule) -> [String: Any] {
    var dict: [String: Any] = [
      "id": m.id,
      "name": m.name,
      "scriptUrl": m.scriptUrl,
      "enabled": m.enabled,
      "order": m.order,
      "scriptPath": m.scriptPath,
      "nsfw": m.nsfw
    ]
    if let baseUrl = m.baseUrl { dict["baseUrl"] = baseUrl }
    if let at = m.lastSuccessAt {
      dict["lastSuccessAt"] = isoFormatter.string(from: at)
    }
    return dict
  }

  private static func encodeCatalogEntry(_ e: ModuleCatalogEntry) -> [String: Any] {
    var dict: [String: Any] = [
      "id": e.id,
      "sourceName": e.sourceName,
      "scriptUrl": e.scriptUrl,
      "nsfw": e.isNsfw
    ]
    if let baseUrl = e.baseUrl { dict["baseUrl"] = baseUrl }
    if let streamType = e.streamType { dict["streamType"] = streamType }
    if let status = e.status { dict["status"] = status }
    if let type = e.type { dict["type"] = type }
    if let quality = e.quality { dict["quality"] = quality }
    return dict
  }

  private static func encodeCandidate(_ c: StreamCandidate) -> [String: Any] {
    var dict: [String: Any] = [
      "url": c.url.absoluteString,
      "headers": c.headers,
      "moduleId": c.moduleId,
      "kind": c.kind.rawValue
    ]
    if let quality = c.quality { dict["quality"] = quality }
    if let title = c.title { dict["title"] = title }
    if let subtitle = c.subtitle { dict["subtitle"] = subtitle.absoluteString }
    return dict
  }

  private static func openNsfwSession(moduleId: String) async throws -> ModuleResolveSession {
    guard let module = ModuleStore.shared.list().first(where: { $0.id == moduleId }) else {
      throw ModuleStoreError.notFound(moduleId)
    }
    guard module.nsfw else {
      throw ModuleRuntimeError.scriptError("Module is not marked NSFW")
    }
    guard module.enabled else {
      throw ModuleRuntimeError.scriptError("Module is disabled")
    }
    let scriptSource = try await ModuleStore.shared.loadScriptSource(for: moduleId)
    let baseURL = module.baseUrl.flatMap(URL.init(string:))
    return try ModuleResolveSession(
      moduleId: module.id,
      scriptSource: scriptSource,
      baseURL: baseURL
    )
  }

  private static func runModuleTest(id: String, query: String?) async throws -> [String: Any] {
    guard let module = ModuleStore.shared.list().first(where: { $0.id == id }) else {
      throw ModuleStoreError.notFound(id)
    }

    let scriptSource = try await ModuleStore.shared.loadScriptSource(for: id)
    let baseURL = module.baseUrl.flatMap(URL.init(string:))
    let session = try ModuleResolveSession(
      moduleId: module.id,
      scriptSource: scriptSource,
      baseURL: baseURL
    )
    defer { session.teardown() }

    let trimmedRaw = query?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    // NSFW modules don't index SFW shows — Modules UI used to default Test to "Naruto".
    let trimmed: String = {
      if module.nsfw {
        let lower = trimmedRaw.lowercased()
        if lower.isEmpty || lower == "naruto" { return "Overflow" }
      }
      return trimmedRaw
    }()
    if trimmed.isEmpty {
      return [
        "ok": true,
        "message": "Module script loaded successfully"
      ]
    }

    let results = try await session.searchResults(trimmed)
    let count = results.count
    NSLog(
      "[Saizen] testModule id=%@ nsfw=%@ query=%@ results=%d",
      id,
      module.nsfw ? "1" : "0",
      trimmed,
      count
    )
    if count > 0 {
      return [
        "ok": true,
        "message": "Search OK (\(count) result\(count == 1 ? "" : "s")) for \"\(trimmed)\"",
        "searchResults": count
      ]
    }

    let hint =
      module.nsfw
      ? " — try an adult title like Overflow (Filters → Test title)"
      : ""
    return [
      "ok": false,
      "message": "No search results for \"\(trimmed)\"\(hint)",
      "searchResults": 0
    ]
  }

  private static func parseSpawnContext(_ call: CAPPluginCall, fallbackTitle: String, idMal: Int?) -> SpawnContext {
    let hintRaw = call.getString("playerHint") ?? "avplayer"
    let hint = PlayerHint(rawValue: hintRaw) ?? .avplayer
    let skip = call.getObject("skipTimes")
    let op = parseSkipInterval(skip?["op"])
    let ed = parseSkipInterval(skip?["ed"])
    let total = call.getInt("totalEpisodes")
    let episode = call.getInt("episode") ?? 0
    let hasNext =
      call.getBool("hasNextEpisode")
      ?? (total.map { t in episode > 0 && episode < t } ?? false)

    let options = PlayerSessionOptions(
      resolution: call.getString("resolution"),
      sourceLabel: call.getString("sourceLabel"),
      totalEpisodes: total,
      hasNextEpisode: hasNext,
      autoSkipOpEd: call.getBool("autoSkipOpEd") ?? false,
      gestureSeekEnabled: call.getBool("gestureSeekEnabled") ?? true,
      doubleTapSeekSec: call.getInt("doubleTapSeekSec") ?? 10,
      tripleTapSeekSec: call.getInt("tripleTapSeekSec") ?? 30,
      autoplayNext: call.getBool("autoplayNext") ?? false,
      op: op,
      ed: ed
    )

    return SpawnContext(
      title: call.getString("title") ?? fallbackTitle,
      idMal: idMal,
      playerHint: hint,
      options: options
    )
  }

  private static func parseSkipInterval(_ raw: Any?) -> SkipInterval? {
    guard let dict = raw as? [String: Any] else { return nil }
    let start = (dict["start"] as? Double) ?? (dict["start"] as? Int).map(Double.init)
    let end = (dict["end"] as? Double) ?? (dict["end"] as? Int).map(Double.init)
    guard let start, let end else { return nil }
    return SkipInterval(start: start, end: end)
  }
}
