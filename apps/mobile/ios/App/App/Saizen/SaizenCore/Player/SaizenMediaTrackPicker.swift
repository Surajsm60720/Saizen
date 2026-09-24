import Foundation

/// Lightweight HLS/AVPlayer option descriptor so selection can be unit-tested.
public struct SaizenMediaOption: Equatable, Sendable {
  public var name: String
  public var languageCodes: [String]
  public var isDefault: Bool
  public var isForced: Bool

  public init(name: String, languageCodes: [String], isDefault: Bool, isForced: Bool) {
    self.name = name
    self.languageCodes = languageCodes
    self.isDefault = isDefault
    self.isForced = isForced
  }
}

public enum SaizenMediaTrackPicker {
  /// Pick a soft-sub track: preferred language (non-forced), then default, then first non-forced.
  public static func pickLegibleIndex(
    options: [SaizenMediaOption],
    preferredLanguages: [String]
  ) -> Int? {
    guard !options.isEmpty else { return nil }
    let preferred = Set(preferredLanguages.map { $0.lowercased() })

    func matchesPreferred(_ option: SaizenMediaOption) -> Bool {
      option.languageCodes.contains { token in
        preferred.contains(token.lowercased())
      } || preferred.contains(option.name.lowercased())
    }

    func isGenericCC(_ option: SaizenMediaOption) -> Bool {
      let n = option.name.lowercased().trimmingCharacters(in: .whitespaces)
      return n == "cc" || n == "closed captions" || n == "closed caption"
    }

    if let idx = options.firstIndex(where: { !$0.isForced && matchesPreferred($0) && !isGenericCC($0) }) {
      return idx
    }
    if let idx = options.firstIndex(where: { !$0.isForced && matchesPreferred($0) }) {
      return idx
    }
    if let idx = options.firstIndex(where: { $0.isDefault && !$0.isForced && !isGenericCC($0) }) {
      return idx
    }
    if let idx = options.firstIndex(where: { !$0.isForced && !isGenericCC($0) }) {
      return idx
    }
    if let idx = options.firstIndex(where: { $0.isDefault && !$0.isForced }) {
      return idx
    }
    if let idx = options.firstIndex(where: { !$0.isForced }) {
      return idx
    }
    if let idx = options.firstIndex(where: { $0.isDefault }) {
      return idx
    }
    return 0
  }
}
