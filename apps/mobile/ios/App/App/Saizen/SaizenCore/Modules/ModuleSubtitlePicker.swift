import Foundation

/// Resolves a single HTTPS sidecar URL from Sora/Luna/Saizen extractStreamUrl payloads.
public enum ModuleSubtitlePicker {
  public static func pickURL(
    payload: [String: Any],
    stream: [String: Any]?,
    baseURL: URL?,
    preferredLanguages: [String] = ["en", "eng", "english"]
  ) -> URL? {
    var candidates: [Candidate] = []
    if let stream {
      candidates.append(contentsOf: collect(from: stream, baseURL: baseURL))
    }
    candidates.append(contentsOf: collect(from: payload, baseURL: baseURL))

    guard !candidates.isEmpty else { return nil }
    let preferred = Set(preferredLanguages.map { $0.lowercased() })

    func languageRank(_ candidate: Candidate) -> Int {
      if candidate.tokens.contains(where: { preferred.contains($0) }) { return 0 }
      return 1
    }

    func formatRank(_ candidate: Candidate) -> Int {
      if candidate.isTextCue { return 0 }
      return 1
    }

    let ranked = candidates.sorted { a, b in
      let langA = languageRank(a)
      let langB = languageRank(b)
      if langA != langB { return langA < langB }
      if a.isDefault != b.isDefault { return a.isDefault && !b.isDefault }
      let fmtA = formatRank(a)
      let fmtB = formatRank(b)
      if fmtA != fmtB { return fmtA < fmtB }
      return false
    }
    return ranked.first?.url
  }

  /// Unique sidecar languages, VTT preferred over SRT/ASS. English first.
  public static func listTracks(
    payload: [String: Any],
    stream: [String: Any]?,
    baseURL: URL?,
    preferredLanguages: [String] = ["en", "eng", "english"]
  ) -> [SidecarSubtitle] {
    var candidates: [Candidate] = []
    if let stream {
      candidates.append(contentsOf: collect(from: stream, baseURL: baseURL))
    }
    candidates.append(contentsOf: collect(from: payload, baseURL: baseURL))
    guard !candidates.isEmpty else { return [] }
    let preferred = Set(preferredLanguages.map { $0.lowercased() })

    func formatRank(_ candidate: Candidate) -> Int {
      let ext = candidate.url.pathExtension.lowercased()
      if ext == "vtt" { return 0 }
      if ext == "srt" { return 1 }
      return 2
    }

    var best: [String: Candidate] = [:]
    var order: [String] = []
    for candidate in candidates {
      let key = languageKey(candidate)
      if let existing = best[key] {
        if formatRank(candidate) < formatRank(existing) {
          best[key] = candidate
        }
      } else {
        best[key] = candidate
        order.append(key)
      }
    }

    return order.compactMap { key -> SidecarSubtitle? in
      guard let candidate = best[key] else { return nil }
      return SidecarSubtitle(
        url: candidate.url,
        label: displayLabel(candidate),
        language: candidate.language
      )
    }
    .sorted { a, b in
      let aPref = languageTokens(label: a.label, language: a.language)
        .contains(where: { preferred.contains($0) })
      let bPref = languageTokens(label: b.label, language: b.language)
        .contains(where: { preferred.contains($0) })
      if aPref != bPref { return aPref && !bPref }
      return a.label.localizedCaseInsensitiveCompare(b.label) == .orderedAscending
    }
  }

  private struct Candidate {
    var url: URL
    var tokens: Set<String>
    var isDefault: Bool
    var isTextCue: Bool
    var label: String?
    var language: String?
  }

  private static func collect(from object: [String: Any], baseURL: URL?) -> [Candidate] {
    var out: [Candidate] = []
    out.append(contentsOf: collectValue(object["subtitle"], label: nil, baseURL: baseURL, isDefault: true))
    for key in ["subtitles", "tracks", "subs", "captions"] {
      out.append(contentsOf: collectValue(object[key], label: nil, baseURL: baseURL, isDefault: false))
    }
    return out
  }

  private static func collectValue(
    _ value: Any?,
    label: String?,
    baseURL: URL?,
    isDefault: Bool
  ) -> [Candidate] {
    guard let value else { return [] }
    if let raw = string(value), let parsed = parseJSON(raw) {
      return collectValue(parsed, label: label, baseURL: baseURL, isDefault: isDefault)
    }
    if let raw = string(value), let url = httpsURL(raw, baseURL: baseURL) {
      return [makeCandidate(url: url, label: label, lang: label, isDefault: isDefault, kind: nil)]
    }
    if let rows = asArray(value) {
      return rows.flatMap { collectValue($0, label: label, baseURL: baseURL, isDefault: false) }
    }
    guard let dict = asDictionary(value) else { return [] }
    if let url = urlFromTrack(dict, baseURL: baseURL) {
      let kind = string(dict["kind"]) ?? string(dict["type"])
      if isThumbnail(kind) { return [] }
      return [
        makeCandidate(
          url: url,
          label: string(dict["label"]) ?? string(dict["name"]) ?? label,
          lang: string(dict["lang"]) ?? string(dict["language"]) ?? string(dict["srclang"]),
          isDefault: isDefault || bool(dict["default"]) || bool(dict["isDefault"]),
          kind: kind
        )
      ]
    }
    var mapped: [Candidate] = []
    for (key, nested) in dict {
      mapped.append(contentsOf: collectValue(nested, label: key, baseURL: baseURL, isDefault: false))
    }
    return mapped
  }

  private static func urlFromTrack(_ dict: [String: Any], baseURL: URL?) -> URL? {
    let raw =
      string(dict["file"])
      ?? string(dict["url"])
      ?? string(dict["src"])
      ?? string(dict["link"])
      ?? string(dict["subtitle"])
      ?? string(dict["subtitleUrl"])
      ?? string(dict["vtt"])
    guard let raw else { return nil }
    return httpsURL(raw, baseURL: baseURL)
  }

  private static func asArray(_ value: Any) -> [Any]? {
    if let rows = value as? [Any] { return rows }
    if let rows = value as? NSArray { return rows.map { $0 } }
    return nil
  }

  private static func asDictionary(_ value: Any) -> [String: Any]? {
    if let dictionary = value as? [String: Any] { return dictionary }
    if let dictionary = value as? NSDictionary {
      var out: [String: Any] = [:]
      for (key, val) in dictionary {
        out["\(key)"] = val
      }
      return out
    }
    return nil
  }

  private static func parseJSON(_ raw: String) -> Any? {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard trimmed.hasPrefix("[") || trimmed.hasPrefix("{") else { return nil }
    guard let data = trimmed.data(using: .utf8) else { return nil }
    return try? JSONSerialization.jsonObject(with: data)
  }

  private static func makeCandidate(
    url: URL,
    label: String?,
    lang: String?,
    isDefault: Bool,
    kind: String?
  ) -> Candidate {
    var tokens = Set<String>()
    if let label { tokens.insert(label.lowercased()) }
    if let lang { tokens.insert(lang.lowercased()) }
    if let kind { tokens.insert(kind.lowercased()) }
    let ext = url.pathExtension.lowercased()
    let isTextCue = ext.isEmpty || ext == "vtt" || ext == "srt"
    return Candidate(
      url: url,
      tokens: tokens,
      isDefault: isDefault,
      isTextCue: isTextCue,
      label: label,
      language: lang
    )
  }

  private static func languageKey(_ candidate: Candidate) -> String {
    if let language = candidate.language?.lowercased(), !language.isEmpty {
      return language.split(separator: "-").first.map(String.init) ?? language
    }
    if let label = candidate.label?.lowercased(), !label.isEmpty {
      return label
    }
    return candidate.url.absoluteString
  }

  private static func displayLabel(_ candidate: Candidate) -> String {
    if let label = candidate.label, !label.isEmpty { return label }
    if let language = candidate.language, !language.isEmpty { return language }
    return "Subtitles"
  }

  private static func languageTokens(label: String?, language: String?) -> Set<String> {
    var tokens = Set<String>()
    if let language {
      let lower = language.lowercased()
      tokens.insert(lower)
      if let short = lower.split(separator: "-").first {
        tokens.insert(String(short))
      }
    }
    if let label {
      tokens.insert(label.lowercased())
    }
    return tokens
  }

  private static func httpsURL(_ raw: String, baseURL: URL?) -> URL? {
    var trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    if trimmed.hasPrefix("//") {
      trimmed = "https:" + trimmed
    }
    guard let url = URL(string: trimmed, relativeTo: baseURL)?.absoluteURL,
          url.scheme?.lowercased() == "https" else { return nil }
    return url
  }

  private static func isThumbnail(_ kind: String?) -> Bool {
    guard let kind else { return false }
    let lower = kind.lowercased()
    return lower.contains("thumb")
  }

  private static func string(_ value: Any?) -> String? {
    if let s = value as? String {
      let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
      if t.isEmpty || t == "null" || t == "undefined" { return nil }
      return t
    }
    if let s = value as? NSString {
      return string(s as String)
    }
    return nil
  }

  private static func bool(_ value: Any?) -> Bool {
    if let b = value as? Bool { return b }
    if let n = value as? NSNumber { return n.boolValue }
    if let s = value as? String {
      return ["1", "true", "yes"].contains(s.lowercased())
    }
    return false
  }
}
