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
  /// Optional external WebVTT (or similar) sidecar URL from `extractStreamUrl.subtitle`.
  public var subtitle: URL?

  public init(
    url: URL,
    headers: [String: String] = [:],
    quality: String? = nil,
    title: String? = nil,
    moduleId: String,
    kind: StreamKind,
    subtitle: URL? = nil
  ) {
    self.url = url
    self.headers = headers
    self.quality = quality
    self.title = title
    self.moduleId = moduleId
    self.kind = kind
    self.subtitle = subtitle
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
  /// Adult catalog flag (`nsfw: true` or legacy `1`).
  public var nsfw: Bool?

  public init(
    id: String,
    sourceName: String,
    scriptUrl: String,
    baseUrl: String? = nil,
    streamType: String? = nil,
    status: String? = nil,
    type: String? = nil,
    quality: String? = nil,
    nsfw: Bool? = nil
  ) {
    self.id = id
    self.sourceName = sourceName
    self.scriptUrl = scriptUrl
    self.baseUrl = baseUrl
    self.streamType = streamType
    self.status = status
    self.type = type
    self.quality = quality
    self.nsfw = nsfw
  }

  public var isNsfw: Bool { nsfw == true }

  private enum CodingKeys: String, CodingKey {
    case id, sourceName, scriptUrl, baseUrl, streamType, status, type, quality, nsfw
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(String.self, forKey: .id)
    sourceName = try c.decode(String.self, forKey: .sourceName)
    scriptUrl = try c.decode(String.self, forKey: .scriptUrl)
    baseUrl = try c.decodeIfPresent(String.self, forKey: .baseUrl)
    streamType = try c.decodeIfPresent(String.self, forKey: .streamType)
    status = try c.decodeIfPresent(String.self, forKey: .status)
    type = try c.decodeIfPresent(String.self, forKey: .type)
    quality = try c.decodeIfPresent(String.self, forKey: .quality)
    if let b = try? c.decodeIfPresent(Bool.self, forKey: .nsfw) {
      nsfw = b
    } else if let i = try? c.decodeIfPresent(Int.self, forKey: .nsfw) {
      nsfw = i != 0
    } else if let s = try? c.decodeIfPresent(String.self, forKey: .nsfw) {
      nsfw = ["1", "true", "yes"].contains(s.lowercased())
    } else {
      nsfw = nil
    }
  }
}
