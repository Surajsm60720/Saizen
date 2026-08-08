import Foundation

public struct SaizenTorrentFileInfo: Codable {
  public let id: Int
  public let name: String
  public let hash: String
  public let size: Int64
  public let url: String
  public let playerHint: String
}

public protocol TorrentEngine: AnyObject {
  func play(
    source: String,
    mediaId: Int,
    episode: Int
  ) async throws -> [SaizenTorrentFileInfo]

  func torrentInfo(hash: String) async -> [String: Any]
  func stopAll()
}

/// Disk layout under Documents/Saizen — pieces, torrents meta, progressive cache, library.
public enum SaizenStorage {
  public static var root: URL {
    let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
    return docs.appendingPathComponent("Saizen", isDirectory: true)
  }

  public static var piecesDir: URL { root.appendingPathComponent("pieces", isDirectory: true) }
  public static var torrentsDir: URL { root.appendingPathComponent("torrents", isDirectory: true) }
  public static var cacheDir: URL { root.appendingPathComponent("cache", isDirectory: true) }
  public static var libraryDir: URL { root.appendingPathComponent("library", isDirectory: true) }
  public static var downloadsWorkDir: URL { root.appendingPathComponent("downloads-work", isDirectory: true) }
  public static var defaultDownloadsDir: URL {
    root.appendingPathComponent("Downloads", isDirectory: true)
  }
  public static var manifestURL: URL { libraryDir.appendingPathComponent("manifest.json") }

  /// Create Saizen dirs and keep media/work off iCloud / iTunes backups.
  public static func ensureDirectories() {
    let fm = FileManager.default
    let dirs = [root, piecesDir, torrentsDir, cacheDir, libraryDir, downloadsWorkDir, defaultDownloadsDir]
    for dir in dirs {
      try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
      var mutable = dir
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try? mutable.setResourceValues(values)
    }
  }

  /// Delete leftover playback files only — never touch library / in-progress downloads.
  public static func purgePlaybackData() {
    let fm = FileManager.default
    for dir in [piecesDir, torrentsDir, cacheDir] {
      guard fm.fileExists(atPath: dir.path) else { continue }
      do {
        let items = try fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
        for item in items {
          try? fm.removeItem(at: item)
        }
        NSLog("[Saizen] purged %d item(s) in %@", items.count, dir.lastPathComponent)
      } catch {
        NSLog("[Saizen] purge failed for %@: %@", dir.path, error.localizedDescription)
      }
    }
  }

  public static func directorySize(_ dir: URL) -> Int64 {
    let fm = FileManager.default
    guard let enumerator = fm.enumerator(
      at: dir,
      includingPropertiesForKeys: [.fileSizeKey, .isDirectoryKey],
      options: [.skipsHiddenFiles]
    ) else { return 0 }
    var total: Int64 = 0
    for case let url as URL in enumerator {
      let values = try? url.resourceValues(forKeys: [.isDirectoryKey, .fileSizeKey])
      if values?.isDirectory == true { continue }
      total += Int64(values?.fileSize ?? 0)
    }
    return total
  }
}

/// Shared playback session so player dismiss can stop torrents + free disk.
public enum SaizenPlayback {
  public static let engine = HybridTorrentEngine()

  private static let lock = NSLock()
  private static var sessionID = UUID()
  private static var active = false

  /// Call when a new playTorrent session begins (invalidates stale dismiss callbacks).
  @discardableResult
  public static func beginSession() -> UUID {
    lock.lock()
    sessionID = UUID()
    active = true
    let id = sessionID
    lock.unlock()
    NSLog("[Saizen] playback session begin %@", id.uuidString)
    return id
  }

  public static var currentSessionID: UUID {
    lock.lock()
    defer { lock.unlock() }
    return sessionID
  }

  public static var isActive: Bool {
    lock.lock()
    defer { lock.unlock() }
    return active
  }

  /// Stop engine + wipe Documents/Saizen. Ignores stale dismiss from an older session.
  public static func stopAndPurge(expecting expected: UUID? = nil) {
    lock.lock()
    if let expected, expected != sessionID {
      lock.unlock()
      NSLog(
        "[Saizen] stopAndPurge ignored — stale session (got %@ want %@)",
        expected.uuidString,
        sessionID.uuidString
      )
      return
    }
    active = false
    lock.unlock()

    NSLog("[Saizen] stopAndPurge — stopping engine + clearing Documents/Saizen storage")
    engine.stopAll()
    SaizenStorage.purgePlaybackData()
  }

  /// Launch-time cleanup only — never wipe files while a stream is live.
  public static func purgeIfIdle() {
    guard !isActive else {
      NSLog("[Saizen] purgeIfIdle skipped — playback active")
      return
    }
    SaizenStorage.purgePlaybackData()
  }
}

/**
 Progressive HTTP / bundled sample playback.

 Priority:
 1. `bundle:filename` → file shipped in the app (always works offline)
 2. http(s) → stream into PieceStore + loopback Range server (open ASAP, like torrents)
 */
public final class ProgressiveHTTPEngine: TorrentEngine {
  private var currentHash = "progressive"
  private var lastSize: Int64 = 0
  private var fileName = "stream"
  private var store: PieceStore?
  private var server: HTTPRangeServer?
  private var downloadTask: Task<Void, Never>?
  private var fillTasks: [Task<Void, Never>] = []
  private var startedAt = Date()
  private var bytesAtSample: Int64 = 0
  private var sampleAt = Date()
  private var lastDownRate: Int64 = 0
  private let stateLock = NSLock()

  private let session: URLSession = {
    let cfg = URLSessionConfiguration.default
    cfg.requestCachePolicy = .reloadIgnoringLocalCacheData
    cfg.timeoutIntervalForRequest = 60
    cfg.timeoutIntervalForResource = 600
    cfg.httpAdditionalHeaders = [
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "Accept": "*/*"
    ]
    return URLSession(configuration: cfg)
  }()

  private static let browserUA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"

  public init() {}

  public func play(source: String, mediaId _: Int, episode _: Int) async throws -> [SaizenTorrentFileInfo] {
    stopAll()

    if source.hasPrefix("bundle:") {
      return try playBundled(name: String(source.dropFirst("bundle:".count)))
    }

    guard let remote = URL(string: source),
          let scheme = remote.scheme?.lowercased(),
          scheme == "http" || scheme == "https"
    else {
      throw NSError(
        domain: "SaizenTorrent",
        code: 1,
        userInfo: [
          NSLocalizedDescriptionKey:
            "ProgressiveHTTPEngine accepts http(s) or bundle:name sources"
        ]
      )
    }

    NSLog("[Saizen] ProgressiveHTTP stream-open → %@", remote.absoluteString)
    let meta = try await probeRemote(remote)
    if meta.looksLikeTorrent {
      throw NSError(
        domain: "SaizenTorrent",
        code: 17,
        userInfo: [
          NSLocalizedDescriptionKey:
            "URL returned a .torrent file, not video. This should go through libtorrent — check isTorrentFileURL routing."
        ]
      )
    }
    guard meta.size > 0 else {
      throw NSError(
        domain: "SaizenTorrent",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Remote media has unknown/zero Content-Length"]
      )
    }

    let cacheDir = try Self.cacheDirectory()
    let name = Self.safeFileName(from: remote, contentType: meta.contentType)
    let dest = cacheDir.appendingPathComponent("\(UUID().uuidString).part")
    let pieceStore = try PieceStore(fileSize: meta.size, pieceLength: 256 * 1024, fileURL: dest)
    let rangeServer = HTTPRangeServer()
    try rangeServer.start(store: pieceStore, contentType: meta.contentType)
    rangeServer.onNeedRange = { [weak self] range in
      self?.requestFill(remote: remote, range: range)
    }
    guard let stream = rangeServer.streamURL() else {
      rangeServer.stop()
      pieceStore.removeBackingFile()
      throw NSError(domain: "SaizenTorrent", code: 2, userInfo: [NSLocalizedDescriptionKey: "No stream URL"])
    }

    stateLock.lock()
    store = pieceStore
    server = rangeServer
    lastSize = meta.size
    fileName = name
    currentHash = String(remote.absoluteString.hashValue)
    startedAt = Date()
    bytesAtSample = 0
    sampleAt = Date()
    lastDownRate = 0
    stateLock.unlock()

    // Sequential fill from byte 0; seeking uses Range GETs via onNeedRange.
    downloadTask = Task { [weak self] in
      await self?.fillSequential(remote: remote, size: meta.size)
    }

    NSLog(
      "[Saizen] ProgressiveHTTP kickstart open-now size=%lld type=%@ url=%@",
      meta.size,
      meta.contentType,
      HTTPRangeServer.redactedURLString(stream)
    )

    // VLC handles incomplete Range streams more reliably than AVPlayer.
    return [
      SaizenTorrentFileInfo(
        id: 0,
        name: name,
        hash: currentHash,
        size: meta.size,
        url: stream.absoluteString,
        playerHint: "vlc"
      )
    ]
  }

  private struct RemoteMeta {
    let size: Int64
    let contentType: String
    let looksLikeTorrent: Bool
  }

  private func probeRemote(_ remote: URL) async throws -> RemoteMeta {
    // Prefer HEAD; fall back to a tiny Range GET if HEAD is blocked.
    var head = URLRequest(url: remote)
    head.httpMethod = "HEAD"
    head.setValue(Self.browserUA, forHTTPHeaderField: "User-Agent")
    if let (data, response) = try? await session.data(for: head),
       let http = response as? HTTPURLResponse,
       (200 ... 299).contains(http.statusCode)
    {
      let length = http.expectedContentLength
      let type = http.value(forHTTPHeaderField: "Content-Type") ?? "video/mp4"
      let sniff = Self.looksLikeTorrentBytes(data) || type.lowercased().contains("bittorrent")
      if length > 0 {
        return RemoteMeta(size: length, contentType: type, looksLikeTorrent: sniff)
      }
    }

    var get = URLRequest(url: remote)
    get.setValue(Self.browserUA, forHTTPHeaderField: "User-Agent")
    get.setValue("bytes=0-65535", forHTTPHeaderField: "Range")
    let (data, response) = try await session.data(for: get)
    guard let http = response as? HTTPURLResponse else {
      throw NSError(domain: "SaizenTorrent", code: 3, userInfo: [NSLocalizedDescriptionKey: "No HTTP response"])
    }
    if !(200 ... 299).contains(http.statusCode) && http.statusCode != 206 {
      throw NSError(
        domain: "SaizenTorrent",
        code: http.statusCode,
        userInfo: [NSLocalizedDescriptionKey: "Probe failed HTTP \(http.statusCode)"]
      )
    }
    let type = http.value(forHTTPHeaderField: "Content-Type") ?? "video/mp4"
    let sniff = Self.looksLikeTorrentBytes(data) || type.lowercased().contains("bittorrent")
    var size: Int64 = http.expectedContentLength
    if size <= 0, let cr = http.value(forHTTPHeaderField: "Content-Range"),
       let total = cr.split(separator: "/").last, let n = Int64(total)
    {
      size = n
    }
    if size <= 0 {
      // Last resort: start full GET and wait for headers only via bytes stream.
      size = try await resolveSizeViaBytes(remote)
    }
    return RemoteMeta(size: size, contentType: type, looksLikeTorrent: sniff)
  }

  private func resolveSizeViaBytes(_ remote: URL) async throws -> Int64 {
    var req = URLRequest(url: remote)
    req.setValue(Self.browserUA, forHTTPHeaderField: "User-Agent")
    let (_, response) = try await session.bytes(for: req)
    guard let http = response as? HTTPURLResponse else { return 0 }
    return http.expectedContentLength
  }

  private func fillSequential(remote: URL, size: Int64) async {
    do {
      var req = URLRequest(url: remote)
      req.setValue(Self.browserUA, forHTTPHeaderField: "User-Agent")
      let (bytes, response) = try await session.bytes(for: req)
      if let http = response as? HTTPURLResponse, !(200 ... 299).contains(http.statusCode) {
        NSLog("[Saizen] ProgressiveHTTP sequential HTTP %d", http.statusCode)
        return
      }
      var offset: Int64 = 0
      var buffer = Data()
      buffer.reserveCapacity(256 * 1024)
      for try await b in bytes {
        if Task.isCancelled { return }
        buffer.append(b)
        if buffer.count >= 256 * 1024 {
          guard let store else { return }
          store.write(offset: offset, bytes: buffer)
          offset += Int64(buffer.count)
          noteBytes(offset)
          buffer.removeAll(keepingCapacity: true)
        }
      }
      if !buffer.isEmpty, let store {
        store.write(offset: offset, bytes: buffer)
        noteBytes(offset + Int64(buffer.count))
      }
      NSLog("[Saizen] ProgressiveHTTP sequential complete @%lld/%lld", offset + Int64(buffer.count), size)
    } catch {
      if !Task.isCancelled {
        NSLog("[Saizen] ProgressiveHTTP sequential error: %@", "\(error)")
      }
    }
  }

  private func requestFill(remote: URL, range: Range<Int64>) {
    guard let store, range.lowerBound < range.upperBound else { return }
    if store.isAvailable(range: range) { return }
    // Cap opportunistic fills so we don't stampede the CDN on every VLC readahead.
    let end = min(range.upperBound, range.lowerBound + 8 * 1024 * 1024)
    let slice = range.lowerBound ..< end
    if store.isAvailable(range: slice) { return }

    let task = Task<Void, Never> { [weak self] in
      await self?.fillRange(remote: remote, range: slice)
    }
    stateLock.lock()
    fillTasks.append(task)
    stateLock.unlock()
  }

  private func fillRange(remote: URL, range: Range<Int64>) async {
    guard let store else { return }
    if store.isAvailable(range: range) { return }
    var req = URLRequest(url: remote)
    req.setValue(Self.browserUA, forHTTPHeaderField: "User-Agent")
    let last = range.upperBound - 1
    req.setValue("bytes=\(range.lowerBound)-\(last)", forHTTPHeaderField: "Range")
    do {
      let (data, response) = try await session.data(for: req)
      if Task.isCancelled { return }
      guard let http = response as? HTTPURLResponse else { return }
      guard http.statusCode == 206 || (200 ... 299).contains(http.statusCode) else {
        NSLog("[Saizen] ProgressiveHTTP range HTTP %d @%lld", http.statusCode, range.lowerBound)
        return
      }
      var writeOffset = range.lowerBound
      if http.statusCode == 206,
         let cr = http.value(forHTTPHeaderField: "Content-Range"),
         let startStr = cr.split(separator: " ").last?.split(separator: "-").first,
         let start = Int64(startStr)
      {
        writeOffset = start
      }
      store.write(offset: writeOffset, bytes: data)
      noteBytes(store.downloadedBytes)
    } catch {
      if !Task.isCancelled {
        NSLog("[Saizen] ProgressiveHTTP range error @%lld: %@", range.lowerBound, "\(error)")
      }
    }
  }

  private func noteBytes(_ downloaded: Int64) {
    stateLock.lock()
    defer { stateLock.unlock() }
    let now = Date()
    let dt = now.timeIntervalSince(sampleAt)
    if dt >= 0.5 {
      let delta = max(0, downloaded - bytesAtSample)
      lastDownRate = Int64(Double(delta) / max(dt, 0.001))
      bytesAtSample = downloaded
      sampleAt = now
    }
  }

  private func playBundled(name: String) throws -> [SaizenTorrentFileInfo] {
    let trimmed = name.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    let base = (trimmed as NSString).deletingPathExtension
    let ext = (trimmed as NSString).pathExtension
    let resource = ext.isEmpty ? base : base
    let fileExt = ext.isEmpty ? "mp4" : ext

    guard let bundled = Bundle.main.url(forResource: resource, withExtension: fileExt)
            ?? Bundle.main.url(forResource: trimmed, withExtension: nil)
    else {
      throw NSError(
        domain: "SaizenTorrent",
        code: 404,
        userInfo: [
          NSLocalizedDescriptionKey:
            "Bundled sample '\(trimmed)' not found in app Resources"
        ]
      )
    }

    let cacheDir = try Self.cacheDirectory()
    let dest = cacheDir.appendingPathComponent(trimmed.contains(".") ? trimmed : "\(trimmed).mp4")
    if !FileManager.default.fileExists(atPath: dest.path) {
      try FileManager.default.copyItem(at: bundled, to: dest)
    }
    NSLog("[Saizen] ProgressiveHTTP bundled → %@", dest.path)
    return try finishLocalFile(dest, hashSeed: "bundle:\(trimmed)")
  }

  private func finishLocalFile(_ dest: URL, hashSeed: String) throws -> [SaizenTorrentFileInfo] {
    let values = try dest.resourceValues(forKeys: [.fileSizeKey])
    let size = Int64(values.fileSize ?? 0)
    guard size > 0 else {
      try? FileManager.default.removeItem(at: dest)
      throw NSError(
        domain: "SaizenTorrent",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Local media file is empty"]
      )
    }

    let name = dest.lastPathComponent
    let hint = Self.probeHint(name: name, contentType: "video/mp4")
    currentHash = String(hashSeed.hashValue)
    lastSize = size
    fileName = name

    NSLog("[Saizen] ProgressiveHTTP play file → %@ (size=%lld)", dest.absoluteString, size)

    return [
      SaizenTorrentFileInfo(
        id: 0,
        name: name,
        hash: currentHash,
        size: size,
        url: dest.absoluteString,
        playerHint: hint
      )
    ]
  }

  public func torrentInfo(hash _: String) async -> [String: Any] {
    stateLock.lock()
    let store = self.store
    let size = lastSize
    let name = fileName
    let hash = currentHash
    let rate = lastDownRate
    let elapsed = Int(Date().timeIntervalSince(startedAt))
    stateLock.unlock()

    let downloaded = store?.downloadedBytes ?? (size > 0 ? size : 0)
    let progress = store?.progress ?? (size > 0 ? 1.0 : 0.0)
    return [
      "name": name,
      "hash": hash,
      "progress": progress,
      "size": ["total": size, "downloaded": downloaded, "uploaded": 0],
      "speed": ["down": rate, "up": 0],
      "time": ["remaining": 0, "elapsed": elapsed],
      "peers": ["seeders": store != nil ? 1 : 0, "leechers": 0, "wires": store != nil ? 1 : 0],
      "pieces": ["total": 0, "size": 256 * 1024]
    ]
  }

  public func stopAll() {
    downloadTask?.cancel()
    downloadTask = nil
    stateLock.lock()
    let fills = fillTasks
    fillTasks.removeAll()
    stateLock.unlock()
    for t in fills { t.cancel() }

    server?.stop()
    server = nil
    store?.cancelAll()
    store?.removeBackingFile()
    store = nil

    let fm = FileManager.default
    let dir = SaizenStorage.cacheDir
    if fm.fileExists(atPath: dir.path),
       let items = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
    {
      for item in items {
        try? fm.removeItem(at: item)
      }
      if !items.isEmpty {
        NSLog("[Saizen] ProgressiveHTTP cleared %d cache file(s)", items.count)
      }
    }
  }

  public static func probeHint(name: String, contentType: String) -> String {
    let n = name.lowercased()
    let c = contentType.lowercased()
    if n.hasSuffix(".mp4") || n.hasSuffix(".m4v") || c.contains("mp4") || c.contains("quicktime") {
      return "avplayer"
    }
    return "vlc"
  }

  private static func looksLikeTorrentBytes(_ data: Data) -> Bool {
    guard data.count > 8 else { return false }
    if data.starts(with: Data("d8:announce".utf8)) { return true }
    if data.first == UInt8(ascii: "d"),
       data.range(of: Data("4:info".utf8)) != nil || data.range(of: Data("8:announce".utf8)) != nil
    {
      return true
    }
    return false
  }

  private static func cacheDirectory() throws -> URL {
    let dir = SaizenStorage.cacheDir
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  private static func safeFileName(from url: URL, contentType: String = "video/mp4") -> String {
    let base = url.lastPathComponent
    var cleaned = base.isEmpty || base == "/"
      ? "stream"
      : base.replacingOccurrences(of: "[^A-Za-z0-9._-]", with: "_", options: .regularExpression)
    let lower = cleaned.lowercased()
    if lower.hasSuffix(".mp4") || lower.hasSuffix(".mkv") || lower.hasSuffix(".webm") || lower.hasSuffix(".m4v") {
      return cleaned
    }
    if contentType.lowercased().contains("matroska") || contentType.lowercased().contains("mkv") {
      return cleaned + ".mkv"
    }
    return cleaned + ".mp4"
  }
}

public final class HybridTorrentEngine: TorrentEngine {
  private let progressive = ProgressiveHTTPEngine()
  private let libtorrent = LibtorrentEngine()
  private var active: TorrentEngine?

  public init() {}

  public func play(source: String, mediaId: Int, episode: Int) async throws -> [SaizenTorrentFileInfo] {
    stopAll()
    // Magnets and .torrent file URLs go through libtorrent.
    // Plain media http(s) / bundle: stay on ProgressiveHTTP.
    if source.hasPrefix("magnet:") || LibtorrentEngine.isTorrentFileURL(source) {
      active = libtorrent
      return try await libtorrent.play(source: source, mediaId: mediaId, episode: episode)
    }
    if source.hasPrefix("bundle:")
      || source.hasPrefix("http://")
      || source.hasPrefix("https://")
    {
      active = progressive
      return try await progressive.play(source: source, mediaId: mediaId, episode: episode)
    }
    active = libtorrent
    return try await libtorrent.play(source: source, mediaId: mediaId, episode: episode)
  }

  public func torrentInfo(hash: String) async -> [String: Any] {
    await active?.torrentInfo(hash: hash) ?? [:]
  }

  public func stopAll() {
    progressive.stopAll()
    libtorrent.stopAll()
    active = nil
  }

  public func applyTransferLimits() {
    libtorrent.applyStoredTransferLimits()
  }
}
