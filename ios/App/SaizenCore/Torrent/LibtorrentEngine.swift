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
  private var metaContinuation: CheckedContinuation<Void, Error>?
  private let stateLock = NSLock()

  public init() {}

  public func play(source: String, mediaId: Int, episode: Int) async throws -> [SaizenTorrentFileInfo] {
    stopAll()

    if !source.hasPrefix("magnet:"), !Self.isTorrentFileURL(source) {
      return try await ProgressiveHTTPEngine().play(source: source, mediaId: mediaId, episode: episode)
    }

    let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
    let saveDir = docs.appendingPathComponent("Saizen/torrents", isDirectory: true)
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

    // MKV needs EBML/header at start + cues near EOF before VLC can play.
    try await warmForPlayback(session: created, store: store, fileName: fileName)

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

  /// Download enough head (+ MKV tail) bytes into PieceStore before handing URL to the player.
  private func warmForPlayback(session: OpaquePointer, store: PieceStore, fileName: String) async throws {
    let isMkv = fileName.lowercased().hasSuffix(".mkv")
    let head = min(Int64(isMkv ? 8 * 1024 * 1024 : 2 * 1024 * 1024), store.fileSize)
    let tail: Int64 = isMkv ? min(Int64(2 * 1024 * 1024), store.fileSize) : 0

    NSLog(
      "[Saizen][lt] warming playback buffer head=%lld tail=%lld size=%lld",
      head,
      tail,
      store.fileSize
    )

    if head > 0 {
      saizen_lt_prioritize_bytes(session, 0, head)
    }
    if tail > 0, store.fileSize > head {
      saizen_lt_prioritize_bytes(session, store.fileSize - tail, store.fileSize)
    }

    try await withThrowingTaskGroup(of: Void.self) { group in
      if head > 0 {
        group.addTask {
          _ = try await store.read(range: 0 ..< head, timeout: 240)
          NSLog("[Saizen][lt] warm head ready (%lld bytes)", head)
        }
      }
      if tail > 0, store.fileSize > head {
        group.addTask {
          let start = store.fileSize - tail
          _ = try await store.read(range: start ..< store.fileSize, timeout: 240)
          NSLog("[Saizen][lt] warm tail ready (%lld bytes @ %lld)", tail, start)
        }
      }
      try await group.waitForAll()
    }

    NSLog("[Saizen][lt] warm complete store=%.1f%% — opening player", store.progress * 100)
  }

  fileprivate func handleMetadata(name: String, fileSize: Int64, pieceLength: Int) {
    fileName = (name as NSString).lastPathComponent
    do {
      let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
      let pieceURL = docs
        .appendingPathComponent("Saizen/pieces", isDirectory: true)
        .appendingPathComponent("\(UUID().uuidString).part")
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

  public func torrentInfo(hash _: String) async -> [String: Any] {
    let peers = session.map { Int(saizen_lt_num_peers($0)) } ?? 0
    let progress = session.map { saizen_lt_progress($0) } ?? 0
    let downloaded = session.map { saizen_lt_downloaded($0) } ?? 0
    return [
      "name": fileName,
      "hash": currentHash,
      "progress": progress,
      "size": ["total": store?.fileSize ?? 0, "downloaded": downloaded, "uploaded": 0],
      "speed": ["down": 0, "up": 0],
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
    if let session {
      saizen_lt_destroy(session)
    }
    session = nil
    stateLock.lock()
    if let c = metaContinuation {
      metaContinuation = nil
      stateLock.unlock()
      c.resume(throwing: CancellationError())
    } else {
      stateLock.unlock()
    }
  }

  static func isTorrentFileURL(_ source: String) -> Bool {
    let lower = source.lowercased()
    guard lower.hasPrefix("http://") || lower.hasPrefix("https://") else { return false }
    return lower.contains(".torrent") || lower.contains("/torrent/")
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
