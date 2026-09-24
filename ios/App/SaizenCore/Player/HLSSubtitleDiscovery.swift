import Foundation

public struct HLSSubtitleTag: Equatable, Sendable {
  public var name: String
  public var language: String
  public var uri: String
  public var isDefault: Bool
  public var isForced: Bool

  public init(name: String, language: String, uri: String, isDefault: Bool, isForced: Bool) {
    self.name = name
    self.language = language
    self.uri = uri
    self.isDefault = isDefault
    self.isForced = isForced
  }
}

/// Parse `#EXT-X-MEDIA:TYPE=SUBTITLES` from an HLS master (or variant) playlist.
public enum HLSSubtitleDiscovery {
  public static func mediaTags(in playlist: String) -> [HLSSubtitleTag] {
    var tags: [HLSSubtitleTag] = []
    for line in playlist.split(whereSeparator: \.isNewline) {
      let trimmed = line.trimmingCharacters(in: .whitespaces)
      guard trimmed.hasPrefix("#EXT-X-MEDIA:") else { continue }
      let attrs = attributes(from: trimmed)
      guard (attrs["TYPE"] ?? "").uppercased() == "SUBTITLES" else { continue }
      guard let uri = attrs["URI"], !uri.isEmpty else { continue }
      tags.append(
        HLSSubtitleTag(
          name: attrs["NAME"] ?? uri,
          language: attrs["LANGUAGE"] ?? "",
          uri: uri,
          isDefault: isYes(attrs["DEFAULT"]),
          isForced: isYes(attrs["FORCED"])
        )
      )
    }
    return tags
  }

  public static func pick(
    _ tags: [HLSSubtitleTag],
    preferredLanguages: [String]
  ) -> HLSSubtitleTag? {
    let options = tags.map {
      SaizenMediaOption(
        name: $0.name,
        languageCodes: [$0.language, $0.name].filter { !$0.isEmpty },
        isDefault: $0.isDefault,
        isForced: $0.isForced
      )
    }
    guard let idx = SaizenMediaTrackPicker.pickLegibleIndex(
      options: options,
      preferredLanguages: preferredLanguages
    ), tags.indices.contains(idx)
    else { return nil }
    return tags[idx]
  }

  public static func resolve(uri: String, against playlistURL: URL) -> URL? {
    let trimmed = uri.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    if let absolute = URL(string: trimmed), absolute.scheme != nil {
      return absolute.scheme?.lowercased() == "https" ? absolute : nil
    }
    return URL(string: trimmed, relativeTo: playlistURL)?.absoluteURL
  }

  private static func isYes(_ raw: String?) -> Bool {
    (raw ?? "").lowercased() == "yes"
  }

  private static func attributes(from line: String) -> [String: String] {
    let body = line.drop { $0 != ":" }.dropFirst()
    var out: [String: String] = [:]
    var current = ""
    var inQuotes = false
    func flush() {
      let pair = current.trimmingCharacters(in: .whitespaces)
      current = ""
      guard let eq = pair.firstIndex(of: "=") else { return }
      let key = String(pair[..<eq]).trimmingCharacters(in: .whitespaces)
      var value = String(pair[pair.index(after: eq)...]).trimmingCharacters(in: .whitespaces)
      if value.hasPrefix("\""), value.hasSuffix("\""), value.count >= 2 {
        value = String(value.dropFirst().dropLast())
      }
      if !key.isEmpty { out[key] = value }
    }
    for ch in body {
      if ch == "\"" {
        inQuotes.toggle()
        current.append(ch)
      } else if ch == ",", !inQuotes {
        flush()
      } else {
        current.append(ch)
      }
    }
    flush()
    return out
  }
}
