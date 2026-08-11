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

  public init(
    url: URL,
    headers: [String: String] = [:],
    quality: String? = nil,
    title: String? = nil,
    moduleId: String,
    kind: StreamKind
  ) {
    self.url = url
    self.headers = headers
    self.quality = quality
    self.title = title
    self.moduleId = moduleId
    self.kind = kind
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
}
