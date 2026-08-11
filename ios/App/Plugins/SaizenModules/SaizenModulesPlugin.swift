import Capacitor
import Foundation

/// Capacitor plugin: CDN stream module library (install / enable / order).
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
    CAPPluginMethod(name: "removeModule", returnType: CAPPluginReturnPromise)
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
}
