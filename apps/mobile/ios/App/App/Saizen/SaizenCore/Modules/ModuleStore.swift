import Foundation

public struct InstalledModule: Codable, Equatable, Sendable {
  public var id: String
  public var name: String
  public var scriptUrl: String
  public var baseUrl: String?
  public var enabled: Bool
  public var order: Int
  public var lastSuccessAt: Date?
  /// Cached script file name under Application Support/Saizen/Modules/ (e.g. `jLCx0.js`).
  /// Legacy rows may still store an absolute path — resolve via `ModuleStore.resolvedScriptURL`.
  public var scriptPath: String
  public var nsfw: Bool

  public init(
    id: String,
    name: String,
    scriptUrl: String,
    baseUrl: String? = nil,
    enabled: Bool = true,
    order: Int,
    lastSuccessAt: Date? = nil,
    scriptPath: String,
    nsfw: Bool = false
  ) {
    self.id = id
    self.name = name
    self.scriptUrl = scriptUrl
    self.baseUrl = baseUrl
    self.enabled = enabled
    self.order = order
    self.lastSuccessAt = lastSuccessAt
    self.scriptPath = scriptPath
    self.nsfw = nsfw
  }

  private enum CodingKeys: String, CodingKey {
    case id, name, scriptUrl, baseUrl, enabled, order, lastSuccessAt, scriptPath, nsfw
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(String.self, forKey: .id)
    name = try c.decode(String.self, forKey: .name)
    scriptUrl = try c.decode(String.self, forKey: .scriptUrl)
    baseUrl = try c.decodeIfPresent(String.self, forKey: .baseUrl)
    enabled = try c.decodeIfPresent(Bool.self, forKey: .enabled) ?? true
    order = try c.decodeIfPresent(Int.self, forKey: .order) ?? 0
    lastSuccessAt = try c.decodeIfPresent(Date.self, forKey: .lastSuccessAt)
    scriptPath = try c.decodeIfPresent(String.self, forKey: .scriptPath) ?? ""
    nsfw = try c.decodeIfPresent(Bool.self, forKey: .nsfw) ?? false
  }
}

public enum ModuleStoreError: Error, LocalizedError {
  case nonHttps(String)
  case invalidURL(String)
  case downloadFailed(Int)
  case notFound(String)
  case emptyName
  case persistFailed
  case catalogUrlNotScript

  public var errorDescription: String? {
    switch self {
    case .nonHttps(let value):
      return "Module scriptUrl must be https:// (got: \(value))"
    case .invalidURL(let value):
      return "Invalid module script URL: \(value)"
    case .downloadFailed(let status):
      return "Module script download failed with HTTP \(status)"
    case .notFound(let id):
      return "Module not found: \(id)"
    case .emptyName:
      return "Module name is required"
    case .persistFailed:
      return "Failed to persist module library"
    case .catalogUrlNotScript:
      return "That URL is a module catalog (index.json), not a script. Add it under Extra catalog URL, turn on Show NSFW, then Install Hstream from Browse."
    }
  }
}

/// Installed CDN stream modules — metadata JSON + cached scripts in Application Support.
public final class ModuleStore: @unchecked Sendable {
  public static let shared = ModuleStore()

  private let lock = NSLock()
  private var modules: [InstalledModule] = []
  private var lastGoodByAniList: [String: String] = [:]

  private init() {
    ensureLayout()
    load()
  }

  // MARK: - Paths

  public static var supportRoot: URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
    return base.appendingPathComponent("Saizen", isDirectory: true)
  }

  public static var modulesDir: URL {
    supportRoot.appendingPathComponent("Modules", isDirectory: true)
  }

  public static var libraryURL: URL {
    supportRoot.appendingPathComponent("modules.json", isDirectory: false)
  }

  public static var lastGoodURL: URL {
    supportRoot.appendingPathComponent("module-last-good.json", isDirectory: false)
  }

  // MARK: - Public API

  public func list() -> [InstalledModule] {
    lock.lock()
    defer { lock.unlock() }
    return modules.sorted { $0.order < $1.order }
  }

  /// Resolves on-disk script URL for a module (handles relative + legacy absolute paths).
  public static func resolvedScriptURL(for module: InstalledModule) -> URL {
    let stored = module.scriptPath
    if stored.hasPrefix("/") {
      return URL(fileURLWithPath: stored)
    }
    if stored.isEmpty {
      return modulesDir.appendingPathComponent(safeFileName(module.id) + ".js")
    }
    return modulesDir.appendingPathComponent(stored)
  }

  /// Returns UTF-8 script source, re-downloading from `scriptUrl` if the cache
  /// file is missing or a stale NSFW script lacks Adult catalog helpers.
  public func loadScriptSource(for moduleId: String) async throws -> String {
    let module: InstalledModule = try {
      lock.lock()
      defer { lock.unlock() }
      guard let m = modules.first(where: { $0.id == moduleId }) else {
        throw ModuleStoreError.notFound(moduleId)
      }
      return m
    }()

    let fileURL = Self.resolvedScriptURL(for: module)
    if let data = try? Data(contentsOf: fileURL),
       let source = String(data: data, encoding: .utf8),
       !source.isEmpty {
      let looksCurrent =
        source.contains("function searchResults")
        && (
          !module.nsfw
            || source.contains("saizen-adult-catalog-v6")
        )
      if looksCurrent {
        return source
      }
      NSLog(
        "[Saizen] ModuleStore stale NSFW script module=%@ — refreshing from %@",
        module.id,
        module.scriptUrl
      )
    } else {
      NSLog(
        "[Saizen] ModuleStore cache miss module=%@ path=%@ — re-downloading",
        module.id,
        fileURL.path
      )
    }

    try await installScript(
      id: module.id,
      name: module.name,
      scriptUrlString: module.scriptUrl,
      baseUrl: module.baseUrl,
      nsfw: module.nsfw
    )

    let refreshed: InstalledModule = try {
      lock.lock()
      defer { lock.unlock() }
      guard let m = modules.first(where: { $0.id == moduleId }) else {
        throw ModuleStoreError.notFound(moduleId)
      }
      return m
    }()
    let url = Self.resolvedScriptURL(for: refreshed)
    let data = try Data(contentsOf: url)
    guard let source = String(data: data, encoding: .utf8), !source.isEmpty else {
      throw ModuleStoreError.downloadFailed(0)
    }
    return source
  }

  public func install(from entry: ModuleCatalogEntry) async throws {
    let name = entry.sourceName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty else { throw ModuleStoreError.emptyName }
    try await installScript(
      id: entry.id,
      name: name,
      scriptUrlString: entry.scriptUrl,
      baseUrl: entry.baseUrl,
      nsfw: entry.isNsfw
    )
  }

  public func install(customScriptURL: URL, name: String, nsfw: Bool = false) async throws {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { throw ModuleStoreError.emptyName }
    let id = "custom-\(stableId(for: customScriptURL))"
    try await installScript(
      id: id,
      name: trimmed,
      scriptUrlString: customScriptURL.absoluteString,
      baseUrl: nil,
      nsfw: nsfw
    )
  }

  public func setEnabled(id: String, enabled: Bool) throws {
    lock.lock()
    defer { lock.unlock() }
    guard let idx = modules.firstIndex(where: { $0.id == id }) else {
      throw ModuleStoreError.notFound(id)
    }
    modules[idx].enabled = enabled
    try persistLocked()
  }

  public func reorder(ids: [String]) throws {
    lock.lock()
    defer { lock.unlock() }
    var byId = Dictionary(uniqueKeysWithValues: modules.map { ($0.id, $0) })
    var next: [InstalledModule] = []
    var order = 0
    for id in ids {
      guard var mod = byId.removeValue(forKey: id) else { continue }
      mod.order = order
      order += 1
      next.append(mod)
    }
    // Append any modules omitted from `ids`, preserving relative order.
    for mod in modules where byId[mod.id] != nil {
      var m = mod
      m.order = order
      order += 1
      next.append(m)
      byId.removeValue(forKey: mod.id)
    }
    modules = next
    try persistLocked()
  }

  public func remove(id: String) throws {
    lock.lock()
    defer { lock.unlock() }
    guard let idx = modules.firstIndex(where: { $0.id == id }) else {
      throw ModuleStoreError.notFound(id)
    }
    let fileURL = Self.resolvedScriptURL(for: modules[idx])
    modules.remove(at: idx)
    for i in modules.indices {
      modules[i].order = i
    }
    let staleKeys = lastGoodByAniList.filter { $0.value == id }.map(\.key)
    for key in staleKeys {
      lastGoodByAniList.removeValue(forKey: key)
    }
    try persistLocked()
    try persistLastGoodLocked()
    try? FileManager.default.removeItem(at: fileURL)
  }

  public func recordSuccess(id: String) throws {
    lock.lock()
    defer { lock.unlock() }
    guard let idx = modules.firstIndex(where: { $0.id == id }) else {
      throw ModuleStoreError.notFound(id)
    }
    modules[idx].lastSuccessAt = Date()
    try persistLocked()
  }

  public func lastGoodModule(anilistId: Int) -> String? {
    lock.lock()
    defer { lock.unlock() }
    return lastGoodByAniList[String(anilistId)]
  }

  public func setLastGoodModule(anilistId: Int, moduleId: String) throws {
    lock.lock()
    defer { lock.unlock() }
    lastGoodByAniList[String(anilistId)] = moduleId
    try persistLastGoodLocked()
  }

  // MARK: - Install helpers

  private func installScript(
    id: String,
    name: String,
    scriptUrlString: String,
    baseUrl: String?,
    nsfw: Bool = false
  ) async throws {
    let url = try Self.requireHttpsURL(scriptUrlString)
    let data = try await Self.downloadScript(from: url)

    ensureLayout()
    let fileName = Self.safeFileName(id) + ".js"
    let fileURL = Self.modulesDir.appendingPathComponent(fileName)
    try data.write(to: fileURL, options: .atomic)
    NSLog(
      "[Saizen] ModuleStore installed module=%@ bytes=%d path=%@ nsfw=%@",
      id,
      data.count,
      fileURL.path,
      nsfw ? "1" : "0"
    )

    lock.lock()
    defer { lock.unlock() }

    if let idx = modules.firstIndex(where: { $0.id == id }) {
      modules[idx].name = name
      modules[idx].scriptUrl = url.absoluteString
      modules[idx].baseUrl = baseUrl
      modules[idx].scriptPath = fileName
      modules[idx].enabled = true
      modules[idx].nsfw = nsfw
    } else {
      let order = modules.map(\.order).max().map { $0 + 1 } ?? 0
      modules.append(
        InstalledModule(
          id: id,
          name: name,
          scriptUrl: url.absoluteString,
          baseUrl: baseUrl,
          enabled: true,
          order: order,
          lastSuccessAt: nil,
          scriptPath: fileName,
          nsfw: nsfw
        )
      )
    }
    try persistLocked()
  }

  private static func requireHttpsURL(_ value: String) throws -> URL {
    guard let url = URL(string: value),
          url.scheme?.lowercased() == "https",
          let host = url.host, !host.isEmpty
    else {
      if let url = URL(string: value), url.scheme?.lowercased() != "https" {
        throw ModuleStoreError.nonHttps(value)
      }
      throw ModuleStoreError.invalidURL(value)
    }
    return url
  }

  private static func downloadScript(from url: URL) async throws -> Data {
    let path = url.path.lowercased()
    if path.hasSuffix(".json") || path.hasSuffix("/index.json") {
      throw ModuleStoreError.catalogUrlNotScript
    }
    let config = URLSessionConfiguration.ephemeral
    let session = URLSession(configuration: config)
    defer { session.invalidateAndCancel() }
    let (data, resp) = try await session.data(from: url)
    guard let http = resp as? HTTPURLResponse else { throw ModuleFetchError.badResponse }
    guard (200..<300).contains(http.statusCode) else {
      throw ModuleStoreError.downloadFailed(http.statusCode)
    }
    if let text = String(data: data.prefix(256), encoding: .utf8)?
      .trimmingCharacters(in: .whitespacesAndNewlines),
      (text.hasPrefix("[") || text.hasPrefix("{")),
      text.contains("\"scriptUrl\"")
    {
      throw ModuleStoreError.catalogUrlNotScript
    }
    return data
  }

  private static func safeFileName(_ id: String) -> String {
    let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_."))
    let scalars = id.unicodeScalars.map { allowed.contains($0) ? Character($0) : "_" }
    let name = String(scalars)
    return name.isEmpty ? "module" : name
  }

  private func stableId(for url: URL) -> String {
    let raw = url.absoluteString.data(using: .utf8) ?? Data()
    // Short stable fingerprint — not cryptographic.
    var hash: UInt64 = 5381
    for byte in raw {
      hash = ((hash << 5) &+ hash) &+ UInt64(byte)
    }
    return String(hash, radix: 16)
  }

  // MARK: - Persistence

  private func ensureLayout() {
    let fm = FileManager.default
    for dir in [Self.supportRoot, Self.modulesDir] {
      try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
      var mutable = dir
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try? mutable.setResourceValues(values)
    }
  }

  private func load() {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    if let data = try? Data(contentsOf: Self.libraryURL),
       let decoded = try? decoder.decode([InstalledModule].self, from: data) {
      modules = decoded.map { Self.normalizeScriptPath($0) }
      // Persist relative paths if we migrated any absolute ones.
      if modules != decoded {
        try? persistLocked()
      }
    } else {
      modules = []
    }
    if let data = try? Data(contentsOf: Self.lastGoodURL),
       let decoded = try? JSONDecoder().decode([String: String].self, from: data) {
      lastGoodByAniList = decoded
    } else {
      lastGoodByAniList = [:]
    }
  }

  /// Prefer storing `id.js` relative to Modules dir (survives container path changes).
  private static func normalizeScriptPath(_ module: InstalledModule) -> InstalledModule {
    var m = module
    let stored = m.scriptPath
    if stored.hasPrefix("/") {
      m.scriptPath = (stored as NSString).lastPathComponent
      if m.scriptPath.isEmpty || m.scriptPath == "/" {
        m.scriptPath = safeFileName(m.id) + ".js"
      }
    } else if stored.isEmpty {
      m.scriptPath = safeFileName(m.id) + ".js"
    }
    return m
  }

  private func persistLocked() throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    encoder.dateEncodingStrategy = .iso8601
    let data = try encoder.encode(modules)
    ensureLayout()
    try data.write(to: Self.libraryURL, options: .atomic)
  }

  private func persistLastGoodLocked() throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    let data = try encoder.encode(lastGoodByAniList)
    ensureLayout()
    try data.write(to: Self.lastGoodURL, options: .atomic)
  }
}
