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

/**
 Progressive HTTP / bundled sample playback.

 Priority:
 1. `bundle:filename` → file shipped in the app (always works offline)
 2. http(s) → download to Documents/Saizen/cache with a browser User-Agent
    (many CDNs 403 the default URLSession UA), then play `file://`
 */
public final class ProgressiveHTTPEngine: TorrentEngine {
  private var currentHash = "progressive"
  private var lastSize: Int64 = 0
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

    let cacheDir = try Self.cacheDirectory()
    let fileName = Self.safeFileName(from: remote)
    let dest = cacheDir.appendingPathComponent(fileName)

    if !FileManager.default.fileExists(atPath: dest.path) {
      NSLog("[Saizen] ProgressiveHTTP downloading → %@", remote.absoluteString)
      var req = URLRequest(url: remote)
      req.setValue(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        forHTTPHeaderField: "User-Agent"
      )
      let (tempURL, response) = try await session.download(for: req)
      if let http = response as? HTTPURLResponse, !(200 ... 299).contains(http.statusCode) {
        throw NSError(
          domain: "SaizenTorrent",
          code: http.statusCode,
          userInfo: [NSLocalizedDescriptionKey: "Download failed HTTP \(http.statusCode)"]
        )
      }
      if FileManager.default.fileExists(atPath: dest.path) {
        try FileManager.default.removeItem(at: dest)
      }
      try FileManager.default.moveItem(at: tempURL, to: dest)
      NSLog("[Saizen] ProgressiveHTTP cached → %@", dest.path)
    } else {
      NSLog("[Saizen] ProgressiveHTTP cache hit → %@", dest.path)
    }

    return try finishLocalFile(dest, hashSeed: remote.absoluteString)
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

    // Copy into Documents so AVPlayer always gets a regular file URL we own
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

    let fileName = dest.lastPathComponent
    let hint = Self.probeHint(name: fileName, contentType: "video/mp4")
    currentHash = String(hashSeed.hashValue)
    lastSize = size

    NSLog("[Saizen] ProgressiveHTTP play file → %@ (size=%lld)", dest.absoluteString, size)

    return [
      SaizenTorrentFileInfo(
        id: 0,
        name: fileName,
        hash: currentHash,
        size: size,
        url: dest.absoluteString,
        playerHint: hint
      )
    ]
  }

  public func torrentInfo(hash _: String) async -> [String: Any] {
    [
      "name": "progressive",
      "hash": currentHash,
      "progress": 1,
      "size": ["total": lastSize, "downloaded": lastSize, "uploaded": 0],
      "speed": ["down": 0, "up": 0],
      "time": ["remaining": 0, "elapsed": 0],
      "peers": ["seeders": 0, "leechers": 0, "wires": 0],
      "pieces": ["total": 0, "size": 0]
    ]
  }

  public func stopAll() {}

  public static func probeHint(name: String, contentType: String) -> String {
    let n = name.lowercased()
    let c = contentType.lowercased()
    if n.hasSuffix(".mp4") || n.hasSuffix(".m4v") || c.contains("mp4") || c.contains("quicktime") {
      return "avplayer"
    }
    return "vlc"
  }

  private static func cacheDirectory() throws -> URL {
    let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
    let dir = docs.appendingPathComponent("Saizen/cache", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  private static func safeFileName(from url: URL) -> String {
    let base = url.lastPathComponent
    if base.isEmpty || base == "/" { return "stream.mp4" }
    let cleaned = base.replacingOccurrences(of: "[^A-Za-z0-9._-]", with: "_", options: .regularExpression)
    return cleaned.hasSuffix(".mp4") ? cleaned : cleaned + ".mp4"
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
}
