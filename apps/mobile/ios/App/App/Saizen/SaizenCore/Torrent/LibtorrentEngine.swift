//
//  LibtorrentEngine.swift
//  Magnet / .torrent → libtorrent C bridge → PieceStore → HTTPRangeServer → stream URL
//

import Foundation

private func saizenLtLog(_ message: UnsafePointer<CChar>?, _ ctx: UnsafeMutableRawPointer?) {
  guard let message else { return }
  NSLog("[Saizen][lt] %s", message)
  _ = ctx
}

private func saizenLtMetadata(
  _ name: UnsafePointer<CChar>?,
  _ fileSize: Int64,
  _ pieceLength: Int32,
  _: Int32,
  _ ctx: UnsafeMutableRawPointer?
) {
  guard let ctx else { return }
  let eng = Unmanaged<LibtorrentEngine>.fromOpaque(ctx).takeUnretainedValue()
  eng.handleMetadata(
    name: name.map { String(cString: $0) } ?? "stream",
    fileSize: fileSize,
    pieceLength: Int(pieceLength)
  )
}

private func saizenLtBytes(
  _ offset: Int64,
  _ data: UnsafePointer<UInt8>?,
  _ length: Int32,
  _ ctx: UnsafeMutableRawPointer?
) {
  guard let ctx, let data, length > 0 else { return }
  let eng = Unmanaged<LibtorrentEngine>.fromOpaque(ctx).takeUnretainedValue()
  let bytes = Data(bytes: data, count: Int(length))
  eng.store?.write(offset: offset, bytes: bytes)
}

/// Fills PieceStore from libtorrent piece callbacks and serves via loopback HTTP.
public final class LibtorrentEngine: TorrentEngine, @unchecked Sendable {
  fileprivate var store: PieceStore?
  private let server = HTTPRangeServer()
  private var session: OpaquePointer?
  private var tickTimer: DispatchSourceTimer?
  private var currentHash = ""
  private var fileName = "stream"
  private var preferredStoreURL: URL?
  private var metaContinuation: CheckedContinuation<Void, Error>?
  private let stateLock = NSLock()

  public init() {}

  public func applyStoredTransferLimits() {
    let settings = DownloadCoordinator.shared.currentSettings()
    applyTransferLimits(downloadMbps: settings.torrentSpeed, maxConns: settings.maxConns)
  }

  public func applyTransferLimits(downloadMbps: Int, maxConns: Int) {
    guard let session else { return }
    let mbps = min(100, max(0, downloadMbps))
    let conns = min(300, max(20, maxConns))
    let down = mbps > 0 ? Int64(mbps) * 1_000_000 / 8 : 0
    saizen_lt_set_rate_limits(session, down, 0)
    saizen_lt_set_max_connections(session, Int32(conns))
  }

  deinit {
    shutdownSession()
  }

  public func play(source: String, mediaId: Int, episode: Int) async throws -> [SaizenTorrentFileInfo] {
    stopAll()

    if !source.hasPrefix("magnet:"), !Self.isTorrentFileURL(source) {
      return try await ProgressiveHTTPEngine().play(source: source, mediaId: mediaId, episode: episode)
    }

    let saveDir = SaizenStorage.torrentsDir
    try FileManager.default.createDirectory(at: saveDir, withIntermediateDirectories: true)

    let callbacks = SaizenLTCallbacks(
      on_log: saizenLtLog,
      on_metadata: saizenLtMetadata,
      on_bytes: saizenLtBytes,
      ctx: Unmanaged.passUnretained(self).toOpaque()
    )

    guard let created = saizen_lt_create(saveDir.path, callbacks) else {
      throw NSError(
        domain: "SaizenTorrent",
        code: 10,
        userInfo: [
          NSLocalizedDescriptionKey:
            "Libtorrent not linked. Run scripts/build-libtorrent-ios.sh then enable SAIZEN_HAS_LIBTORRENT in Xcode."
        ]
      )
    }
    session = created
    applyStoredTransferLimits()
    startTicker()

    if Self.isTorrentFileURL(source) {
      NSLog("[Saizen][lt] source=torrent-file url=%@", source)
      let local = try await Self.downloadTorrentFile(from: source, into: saveDir)
      try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
        stateLock.lock()
        metaContinuation = cont
        stateLock.unlock()
        let add = saizen_lt_add_torrent_file(created, local.path)
        if add != 0 {
          stateLock.lock()
          metaContinuation = nil
          stateLock.unlock()
          cont.resume(throwing: NSError(
            domain: "SaizenTorrent",
            code: Int(add),
            userInfo: [NSLocalizedDescriptionKey: "Failed to add torrent file (code \(add))"]
          ))
        }
        // On success, handle_metadata resumes cont (often synchronously).
      }
    } else {
      NSLog("[Saizen][lt] source=magnet")
      try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
        stateLock.lock()
        metaContinuation = cont
        stateLock.unlock()

        let add = saizen_lt_add_magnet(created, source)
        if add != 0 {
          stateLock.lock()
          metaContinuation = nil
          stateLock.unlock()
          cont.resume(throwing: NSError(
            domain: "SaizenTorrent",
            code: Int(add),
            userInfo: [NSLocalizedDescriptionKey: "Failed to add magnet (code \(add))"]
          ))
          return
        }

        DispatchQueue.global().asyncAfter(deadline: .now() + 180) { [weak self] in
          guard let self else { return }
          self.stateLock.lock()
          if let c = self.metaContinuation {
            self.metaContinuation = nil
            let peers = self.session.map { Int(saizen_lt_num_peers($0)) } ?? 0
            self.stateLock.unlock()
            c.resume(throwing: NSError(
              domain: "SaizenTorrent",
              code: 11,
              userInfo: [
                NSLocalizedDescriptionKey:
                  "Timed out waiting for torrent metadata (peers=\(peers)). Prefer a .torrent link, Wi‑Fi, or another release."
              ]
            ))
          } else {
            self.stateLock.unlock()
          }
        }
      }
    }

    guard let store else {
      throw NSError(
        domain: "SaizenTorrent",
        code: 12,
        userInfo: [NSLocalizedDescriptionKey: "No PieceStore after metadata"]
      )
    }

    let contentType = Self.contentType(for: fileName)
    try server.start(store: store, contentType: contentType)
    server.onNeedRange = { [weak self] range in
      guard let self, let session = self.session else { return }
      saizen_lt_prioritize_bytes(session, range.lowerBound, range.upperBound)
    }
    guard let stream = server.streamURL() else {
      throw NSError(domain: "SaizenTorrent", code: 2, userInfo: [NSLocalizedDescriptionKey: "No stream URL"])
    }

    // Hayase-style: open the player as soon as the loopback URL exists.
    // Head-first piece priorities keep bandwidth on the start; VLC HUD shows peers/speed.
    kickstartStreaming(session: created, store: store, fileName: fileName)

    let hint = ProgressiveHTTPEngine.probeHint(name: fileName, contentType: contentType)
    currentHash = String(source.hashValue)

    return [
      SaizenTorrentFileInfo(
        id: 0,
        name: fileName,
        hash: currentHash,
        size: store.fileSize,
        url: stream.absoluteString,
        playerHint: hint
      )
    ]
  }

  /// Do not block on head/tail bytes — that waited while the rest of the file downloaded.
  /// Focus libtorrent on the head, open immediately; defer MKV cue/tail priority.
  private func kickstartStreaming(session: OpaquePointer, store: PieceStore, fileName: String) {
    let isMkv = fileName.lowercased().hasSuffix(".mkv")
    let headWindow = min(Int64(4 * 1024 * 1024), store.fileSize)
    let tail: Int64 = isMkv ? min(Int64(768 * 1024), store.fileSize) : 0

    saizen_lt_focus_head(session, headWindow)
    NSLog(
      "[Saizen][lt] kickstart open-now headFocus=%lld tailDefer=%lld size=%lld",
      headWindow,
      tail,
      store.fileSize
    )

    if tail > 0, store.fileSize > headWindow {
      let start = store.fileSize - tail
      Task { [weak self] in
        // Let head win for a few seconds, then pull cues for seeking.
        try? await Task.sleep(nanoseconds: 4_000_000_000)
        guard let self, let live = self.session, live == session else { return }
        saizen_lt_prioritize_bytes(live, start, store.fileSize)
        NSLog("[Saizen][lt] deferred tail prioritize @%lld", start)
      }
    }
  }

  fileprivate func handleMetadata(name: String, fileSize: Int64, pieceLength: Int) {
    fileName = (name as NSString).lastPathComponent
    do {
      let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
      guard let pieceURL =
        preferredStoreURL
        ?? docs?
          .appendingPathComponent("Saizen/pieces", isDirectory: true)
          .appendingPathComponent("\(UUID().uuidString).part")
      else {
        store = nil
        stateLock.lock()
        let cont = metaContinuation
        metaContinuation = nil
        stateLock.unlock()
        cont?.resume(throwing: NSError(
          domain: "SaizenTorrent",
          code: 15,
          userInfo: [NSLocalizedDescriptionKey: "No writable documents directory"]
        ))
        return
      }
      store = try PieceStore(
        fileSize: fileSize,
        pieceLength: max(pieceLength, 16 * 1024),
        fileURL: pieceURL
      )
      NSLog(
        "[Saizen][lt] PieceStore disk-backed size=%lld path=%@",
        fileSize,
        pieceURL.lastPathComponent
      )
    } catch {
      NSLog("[Saizen][lt] PieceStore create failed: %@", "\(error)")
      store = nil
    }
    stateLock.lock()
    let cont = metaContinuation
    metaContinuation = nil
    stateLock.unlock()
    if store == nil {
      cont?.resume(throwing: NSError(
        domain: "SaizenTorrent",
        code: 14,
        userInfo: [NSLocalizedDescriptionKey: "Failed to create disk PieceStore"]
      ))
    } else {
      cont?.resume()
    }
  }

  private func startTicker() {
    let timer = DispatchSource.makeTimerSource(queue: DispatchQueue.global(qos: .userInitiated))
    timer.schedule(deadline: .now(), repeating: .milliseconds(200))
    timer.setEventHandler { [weak self] in
      guard let self, let session = self.session else { return }
      saizen_lt_tick(session)
    }
    timer.resume()
    tickTimer = timer
  }

  /// Full-file download (no Range server, no head-focus). Caller owns `partialURL`.
  public func downloadFullFile(
    source: String,
    workDir: URL,
    partialURL: URL,
    shouldCancel: @escaping () -> Bool,
    isPaused: @escaping () -> Bool,
    onProgress: @escaping (_ progress: Double, _ downloaded: Int64, _ total: Int64, _ speed: Int64) -> Void
  ) async throws -> (fileName: String, fileSize: Int64, hash: String) {
    shutdownSession()
    preferredStoreURL = partialURL
    defer { shutdownSession() }

    if !source.hasPrefix("magnet:"), !Self.isTorrentFileURL(source) {
      throw NSError(
        domain: "SaizenTorrent",
        code: 20,
        userInfo: [NSLocalizedDescriptionKey: "Not a torrent source"]
      )
    }

    try FileManager.default.createDirectory(at: workDir, withIntermediateDirectories: true)

    let callbacks = SaizenLTCallbacks(
      on_log: saizenLtLog,
      on_metadata: saizenLtMetadata,
      on_bytes: saizenLtBytes,
      ctx: Unmanaged.passUnretained(self).toOpaque()
    )

    guard let created = saizen_lt_create(workDir.path, callbacks) else {
      throw NSError(
        domain: "SaizenTorrent",
        code: 10,
        userInfo: [
          NSLocalizedDescriptionKey:
            "Libtorrent not linked. Run scripts/build-libtorrent-ios.sh then enable SAIZEN_HAS_LIBTORRENT in Xcode."
        ]
      )
    }
    session = created
    saizen_lt_set_full_file_mode(created, true)
    applyStoredTransferLimits()
    startTicker()

    if Self.isTorrentFileURL(source) {
      let local = try await Self.downloadTorrentFile(from: source, into: workDir)
      try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
        stateLock.lock()
        metaContinuation = cont
        stateLock.unlock()
        let add = saizen_lt_add_torrent_file(created, local.path)
        if add != 0 {
          stateLock.lock()
          metaContinuation = nil
          stateLock.unlock()
          cont.resume(throwing: NSError(
            domain: "SaizenTorrent",
            code: Int(add),
            userInfo: [NSLocalizedDescriptionKey: "Failed to add torrent file (code \(add))"]
          ))
        }
      }
    } else {
      try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
        stateLock.lock()
        metaContinuation = cont
        stateLock.unlock()
        let add = saizen_lt_add_magnet(created, source)
        if add != 0 {
          stateLock.lock()
          metaContinuation = nil
          stateLock.unlock()
          cont.resume(throwing: NSError(
            domain: "SaizenTorrent",
            code: Int(add),
            userInfo: [NSLocalizedDescriptionKey: "Failed to add magnet (code \(add))"]
          ))
          return
        }
        DispatchQueue.global().asyncAfter(deadline: .now() + 180) { [weak self] in
          guard let self else { return }
          self.stateLock.lock()
          if let c = self.metaContinuation {
            self.metaContinuation = nil
            self.stateLock.unlock()
            c.resume(throwing: NSError(
              domain: "SaizenTorrent",
              code: 11,
              userInfo: [NSLocalizedDescriptionKey: "Timed out waiting for torrent metadata"]
            ))
          } else {
            self.stateLock.unlock()
          }
        }
      }
    }

    currentHash = String(source.hashValue)
    saizen_lt_download_all(created)
    var pausedApplied = false

    while !Task.isCancelled {
      if shouldCancel() { throw CancellationError() }
      if isPaused() {
        if !pausedApplied {
          saizen_lt_pause(created)
          pausedApplied = true
        }
        try await Task.sleep(nanoseconds: 400_000_000)
        continue
      }
      if pausedApplied {
        saizen_lt_resume(created)
        saizen_lt_download_all(created)
        pausedApplied = false
      }

      let total = store?.fileSize ?? 0
      let downloaded = store?.downloadedBytes ?? 0
      let progress = total > 0 ? min(1, Double(downloaded) / Double(total)) : 0
      let speed = saizen_lt_download_rate(created)
      onProgress(progress, downloaded, total, speed)

      if total > 0, downloaded >= total - 2048 {
        break
      }
      try await Task.sleep(nanoseconds: 400_000_000)
    }

    store?.closeHandle()
    let name = fileName.isEmpty ? (partialURL.lastPathComponent) : fileName
    let size = store?.fileSize ?? 0
    let hash = currentHash
    return (name, size, hash)
  }

  /// Stop session/ticker without wiping global playback cache dirs.
  public func shutdownSession() {
    tickTimer?.cancel()
    tickTimer = nil
    server.stop()
    store?.cancelAll()
    store?.closeHandle()
    store = nil
    preferredStoreURL = nil
    let doomed = session
    session = nil
    if let doomed {
      saizen_lt_destroy(doomed)
    }
    stateLock.lock()
    if let c = metaContinuation {
      metaContinuation = nil
      stateLock.unlock()
      c.resume(throwing: CancellationError())
    } else {
      stateLock.unlock()
    }
  }

  public func torrentInfo(hash _: String) async -> [String: Any] {
    let peers = session.map { Int(saizen_lt_num_peers($0)) } ?? 0
    let progress = session.map { saizen_lt_progress($0) } ?? 0
    let downloaded = session.map { saizen_lt_downloaded($0) } ?? 0
    let downRate = session.map { saizen_lt_download_rate($0) } ?? 0
    let storeProgress = store?.progress ?? 0
    return [
      "name": fileName,
      "hash": currentHash,
      "progress": max(progress, storeProgress),
      "size": ["total": store?.fileSize ?? 0, "downloaded": downloaded, "uploaded": 0],
      "speed": ["down": downRate, "up": 0],
      "time": ["remaining": 0, "elapsed": 0],
      "peers": ["seeders": peers, "leechers": 0, "wires": peers],
      "pieces": ["total": 0, "size": store?.pieceLength ?? 0]
    ]
  }

  public func stopAll() {
    tickTimer?.cancel()
    tickTimer = nil
    server.stop()
    store?.cancelAll()
    store?.removeBackingFile()
    store = nil
    // Destroy after timer cancel so tick cannot race without the mutex guard.
    let doomed = session
    session = nil
    if let doomed {
      saizen_lt_destroy(doomed)
    }
    stateLock.lock()
    if let c = metaContinuation {
      metaContinuation = nil
      stateLock.unlock()
      c.resume(throwing: CancellationError())
    } else {
      stateLock.unlock()
    }
    // Clear downloaded .torrent metas / libtorrent session leftovers for this save dir.
    let fm = FileManager.default
    let dir = SaizenStorage.torrentsDir
    if fm.fileExists(atPath: dir.path),
       let items = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
    {
      for item in items {
        try? fm.removeItem(at: item)
      }
    }
    // Any orphaned piece files from prior crashed sessions
    let pieces = SaizenStorage.piecesDir
    if fm.fileExists(atPath: pieces.path),
       let items = try? fm.contentsOfDirectory(at: pieces, includingPropertiesForKeys: nil)
    {
      for item in items {
        try? fm.removeItem(at: item)
      }
    }
  }

  /// True for HTTP(S) URLs that fetch a `.torrent` metafile (not the video itself).
  /// AnimeTosho uses `.../download/<id>/torrent` (no `.torrent` suffix / trailing slash).
  /// NekoBT uses `.../torrents/<id>/download`.
  static func isTorrentFileURL(_ source: String) -> Bool {
    let lower = source.lowercased()
    guard lower.hasPrefix("http://") || lower.hasPrefix("https://") else { return false }

    let path = URL(string: source)?.path.lowercased() ?? lower

    if path.hasSuffix(".torrent") || lower.contains(".torrent?") || lower.contains(".torrent#") {
      return true
    }
    // AnimeTosho / Tosho: /download/<id>/torrent
    if path.hasSuffix("/torrent") || path.contains("/torrent/") {
      return true
    }
    // NekoBT-style: /torrents/<id>/download
    if path.contains("/torrents/") && path.contains("/download") {
      return true
    }
    // Generic download endpoints that advertise torrent in the URL
    if path.contains("/download") && lower.contains("torrent") {
      return true
    }
    return false
  }

  private static func downloadTorrentFile(from source: String, into dir: URL) async throws -> URL {
    // Prefer https for AnimeTosho storage (enclosure is often http://).
    let candidates: [String] = {
      if source.hasPrefix("http://") {
        return ["https://" + source.dropFirst("http://".count), source]
      }
      return [source]
    }()

    var lastError: Error?
    for candidate in candidates {
      guard let url = URL(string: candidate) else { continue }
      do {
        var req = URLRequest(url: url)
        req.setValue(
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
          forHTTPHeaderField: "User-Agent"
        )
        req.timeoutInterval = 60
        NSLog("[Saizen][lt] downloading .torrent → %@", candidate)
        let (data, resp) = try await URLSession.shared.data(for: req)
        if let http = resp as? HTTPURLResponse, !(200 ..< 300).contains(http.statusCode) {
          throw NSError(
            domain: "SaizenTorrent",
            code: http.statusCode,
            userInfo: [NSLocalizedDescriptionKey: "Torrent download HTTP \(http.statusCode)"]
          )
        }
        guard data.count > 16,
              data.starts(with: Data("d".utf8)) || data.range(of: Data("8:announce".utf8)) != nil
        else {
          throw NSError(
            domain: "SaizenTorrent",
            code: 15,
            userInfo: [NSLocalizedDescriptionKey: "Downloaded file does not look like a .torrent"]
          )
        }
        let dest = dir.appendingPathComponent("\(UUID().uuidString).torrent")
        try data.write(to: dest, options: .atomic)
        NSLog("[Saizen][lt] .torrent saved (%d bytes)", data.count)
        return dest
      } catch {
        lastError = error
      }
    }
    throw lastError ?? NSError(
      domain: "SaizenTorrent",
      code: 16,
      userInfo: [NSLocalizedDescriptionKey: "Failed to download .torrent"]
    )
  }

  private static func contentType(for name: String) -> String {
    let n = name.lowercased()
    if n.hasSuffix(".mp4") || n.hasSuffix(".m4v") { return "video/mp4" }
    if n.hasSuffix(".webm") { return "video/webm" }
    if n.hasSuffix(".mkv") { return "video/x-matroska" }
    return "application/octet-stream"
  }
}
