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
    CAPPluginMethod(name: "installModule", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "installModuleFromUrl", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "setModuleEnabled", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "reorderModules", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "removeModule", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "resolveStreams", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "resolveAndPlay", returnType: CAPPluginReturnPromise)
  ]

  @objc func listModules(_ call: CAPPluginCall) {
    let modules = ModuleStore.shared.list().map { Self.encodeModule($0) }
    call.resolve(["modules": modules])
  }

  @objc func browseModuleCatalog(_ call: CAPPluginCall) {
    Task {
      do {
        let entries = try await ModuleLibraryClient.fetchCatalog()
        call.resolve(["entries": entries.map { Self.encodeCatalogEntry($0) }])
      } catch {
        call.reject(error.localizedDescription)
      }
    }
  }

  @objc func installModule(_ call: CAPPluginCall) {
    guard let id = call.getString("id")?.trimmingCharacters(in: .whitespacesAndNewlines), !id.isEmpty else {
      call.reject("Missing id")
      return
    }
    let scriptUrl = call.getString("scriptUrl")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let sourceName =
      call.getString("sourceName")?.trimmingCharacters(in: .whitespacesAndNewlines)
      ?? call.getString("name")?.trimmingCharacters(in: .whitespacesAndNewlines)
      ?? id

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
            quality: call.getString("quality")
          )
        } else {
          let catalog = try await ModuleLibraryClient.fetchCatalog()
          guard let found = catalog.first(where: { $0.id == id }) else {
            call.reject("Catalog entry not found: \(id)")
            return
          }
          entry = found
        }
        try await ModuleStore.shared.install(from: entry)
        let modules = ModuleStore.shared.list().map { Self.encodeModule($0) }
        call.resolve(["modules": modules])
      } catch {
        call.reject(error.localizedDescription)
      }
    }
  }

  @objc func installModuleFromUrl(_ call: CAPPluginCall) {
    guard let urlString = call.getString("url")?.trimmingCharacters(in: .whitespacesAndNewlines),
          let url = URL(string: urlString)
    else {
      call.reject("Missing or invalid url")
      return
    }
    let name =
      call.getString("name")?.trimmingCharacters(in: .whitespacesAndNewlines)
      ?? url.lastPathComponent
    Task {
      do {
        try await ModuleStore.shared.install(customScriptURL: url, name: name.isEmpty ? "Custom module" : name)
        let modules = ModuleStore.shared.list().map { Self.encodeModule($0) }
        call.resolve(["modules": modules])
      } catch {
        call.reject(error.localizedDescription)
      }
    }
  }

  @objc func setModuleEnabled(_ call: CAPPluginCall) {
    guard let id = call.getString("id")?.trimmingCharacters(in: .whitespacesAndNewlines), !id.isEmpty else {
      call.reject("Missing id")
      return
    }
    guard let enabled = call.getBool("enabled") else {
      call.reject("Missing enabled")
      return
    }
    do {
      try ModuleStore.shared.setEnabled(id: id, enabled: enabled)
      call.resolve(["ok": true])
    } catch {
      call.reject(error.localizedDescription)
    }
  }

  @objc func reorderModules(_ call: CAPPluginCall) {
    guard let ids = call.getArray("ids", String.self) else {
      call.reject("Missing ids")
      return
    }
    do {
      try ModuleStore.shared.reorder(ids: ids)
      let modules = ModuleStore.shared.list().map { Self.encodeModule($0) }
      call.resolve(["modules": modules])
    } catch {
      call.reject(error.localizedDescription)
    }
  }

  @objc func removeModule(_ call: CAPPluginCall) {
    guard let id = call.getString("id")?.trimmingCharacters(in: .whitespacesAndNewlines), !id.isEmpty else {
      call.reject("Missing id")
      return
    }
    do {
      try ModuleStore.shared.remove(id: id)
      let modules = ModuleStore.shared.list().map { Self.encodeModule($0) }
      call.resolve(["modules": modules])
    } catch {
      call.reject(error.localizedDescription)
    }
  }

  @objc func resolveStreams(_ call: CAPPluginCall) {
    guard let title = call.getString("title")?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty else {
      call.reject("Missing title")
      return
    }
    let anilistId = call.getInt("anilistId") ?? call.getInt("mediaId") ?? 0
    let episode = call.getInt("episode") ?? 0
    guard anilistId > 0, episode > 0 else {
      call.reject("Missing anilistId or episode")
      return
    }
    let query = call.getString("query")

    Task {
      do {
        let candidates = try await StreamResolver.shared.resolve(
          title: title,
          anilistId: anilistId,
          episode: episode,
          query: query
        )
        call.resolve(["candidates": candidates.map { Self.encodeCandidate($0) }])
      } catch {
        call.reject(error.localizedDescription)
      }
    }
  }

  @objc func resolveAndPlay(_ call: CAPPluginCall) {
    guard let title = call.getString("title")?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty else {
      call.reject("Missing title")
      return
    }
    let anilistId = call.getInt("anilistId") ?? call.getInt("mediaId") ?? 0
    let episode = call.getInt("episode") ?? 0
    guard anilistId > 0, episode > 0 else {
      call.reject("Missing anilistId or episode")
      return
    }
    let query = call.getString("query")
    let idMal = call.getInt("idMal")
    let spawn = Self.parseSpawnContext(call, fallbackTitle: title, idMal: idMal)

    DispatchQueue.main.async {
      guard let root = self.bridge?.viewController else {
        call.reject("No view controller")
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
            spawn: spawn
          )
          call.resolve(["candidate": Self.encodeCandidate(winner)])
        } catch {
          call.reject(error.localizedDescription)
        }
      }
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
      "scriptPath": m.scriptPath
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
      "scriptUrl": e.scriptUrl
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
    return dict
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
