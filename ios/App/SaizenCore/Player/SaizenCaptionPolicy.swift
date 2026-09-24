import Foundation

public enum SaizenStreamCaptionHint: String, Equatable, Sendable {
  case soft
  case hard
  case unknown
}

public struct SaizenCaptionMenuItem: Equatable, Sendable {
  public enum Kind: Equatable, Sendable {
    case off
    case sidecar(URL)
    case embedded(index: Int)
  }

  public var title: String
  public var kind: Kind

  public init(title: String, kind: Kind) {
    self.title = title
    self.kind = kind
  }
}

/// Rules for when to overlay sidecar cues vs trust in-stream / burned-in text.
public enum SaizenCaptionPolicy {
  public static func hint(fromStreamTitle title: String?) -> SaizenStreamCaptionHint {
    guard let raw = title?.lowercased(), !raw.isEmpty else { return .unknown }
    if raw.contains("hardsub")
      || raw.contains("hard-sub")
      || raw.contains("hard sub")
      || raw.contains("burned")
      || raw.contains("burn-in")
      || raw.contains("burn in")
    {
      return .hard
    }
    if raw.contains("softsub") || raw.contains("soft-sub") || raw.contains("soft sub") {
      return .soft
    }
    return .unknown
  }

  public static func isGenericClosedCaption(_ name: String) -> Bool {
    let n = name.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
    return n == "cc" || n == "closed captions" || n == "closed caption"
  }

  public static func hasRealEmbeddedCaptions(_ options: [SaizenMediaOption]) -> Bool {
    options.contains { option in
      !option.isForced && !isGenericClosedCaption(option.name)
    }
  }

  public static func shouldAutoEnableSidecar(
    hint: SaizenStreamCaptionHint,
    hasRealEmbeddedCaptions: Bool
  ) -> Bool {
    if hint == .hard { return false }
    if hasRealEmbeddedCaptions { return false }
    return true
  }

  public static func menu(
    sidecarTracks: [SidecarSubtitle],
    embeddedOptions: [SaizenMediaOption]
  ) -> [SaizenCaptionMenuItem] {
    var items: [SaizenCaptionMenuItem] = [
      SaizenCaptionMenuItem(title: "Off", kind: .off)
    ]
    var seen = Set<String>()
    let realEmbeddedKeys = Set(
      embeddedOptions.compactMap { option -> String? in
        guard !option.isForced, !isGenericClosedCaption(option.name) else { return nil }
        return languageKey(label: option.name, language: option.languageCodes.first)
      }
    )
    for track in sidecarTracks {
      let key = languageKey(label: track.label, language: track.language)
      if realEmbeddedKeys.contains(key) { continue }
      if seen.insert(key).inserted {
        items.append(SaizenCaptionMenuItem(title: track.label, kind: .sidecar(track.url)))
      }
    }
    for (index, option) in embeddedOptions.enumerated() {
      if option.isForced || isGenericClosedCaption(option.name) { continue }
      let key = languageKey(label: option.name, language: option.languageCodes.first)
      if seen.insert(key).inserted {
        items.append(SaizenCaptionMenuItem(title: option.name, kind: .embedded(index: index)))
      }
    }
    return items
  }

  public static func defaultKind(
    hint: SaizenStreamCaptionHint,
    sidecarTracks: [SidecarSubtitle],
    embeddedOptions: [SaizenMediaOption],
    preferredLanguages: [String] = ["en", "eng", "english"]
  ) -> SaizenCaptionMenuItem.Kind {
    let realEmbedded = hasRealEmbeddedCaptions(embeddedOptions)
    if hint == .hard {
      return .off
    }
    if realEmbedded {
      if let idx = SaizenMediaTrackPicker.pickLegibleIndex(
        options: embeddedOptions,
        preferredLanguages: preferredLanguages
      ) {
        return .embedded(index: idx)
      }
      return .off
    }
    guard shouldAutoEnableSidecar(hint: hint, hasRealEmbeddedCaptions: false),
          !sidecarTracks.isEmpty
    else { return .off }
    let preferred = Set(preferredLanguages.map { $0.lowercased() })
    if let match = sidecarTracks.first(where: { track in
      languageTokens(label: track.label, language: track.language)
        .contains(where: { preferred.contains($0) })
    }) {
      return .sidecar(match.url)
    }
    return .sidecar(sidecarTracks[0].url)
  }

  private static func languageKey(label: String, language: String?) -> String {
    if let language, let token = languageTokens(label: nil, language: language).first {
      return token
    }
    return languageTokens(label: label, language: nil).first ?? label.lowercased()
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
}
