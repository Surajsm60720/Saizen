import Foundation

/// AniList OAuth client secret (Authorization Code grant).
///
/// - Not exposed to JS / Cap bridge / Settings.
/// - Prefer Keychain; seed once from `AnilistSecret.local.swift` (gitignored) or Secrets.plist.
enum AnilistSecretStore {
  static let keychainAccount = "anilist_secret"

  /// Resolve secret for token exchange. Never log the value.
  static func resolve() -> String? {
    if let existing = SaizenKeychain.get(account: keychainAccount)?.trimmingCharacters(in: .whitespacesAndNewlines),
       !existing.isEmpty
    {
      return existing
    }
    if let seeded = seedFromLocalSources() {
      _ = SaizenKeychain.setStatus(seeded, account: keychainAccount)
      return seeded
    }
    return nil
  }

  /// Copy from compile-time local file and/or bundled Secrets.plist into Keychain.
  @discardableResult
  static func seedFromLocalSources() -> String? {
    if let fromSwift = AnilistSecretLocal.value?.trimmingCharacters(in: .whitespacesAndNewlines),
       !fromSwift.isEmpty
    {
      return fromSwift
    }
    if let url = Bundle.main.url(forResource: "Secrets", withExtension: "plist"),
       let dict = NSDictionary(contentsOf: url) as? [String: Any]
    {
      let raw =
        (dict["ANILIST_CLIENT_SECRET"] as? String)
        ?? (dict["anilistClientSecret"] as? String)
        ?? ""
      let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
      if !trimmed.isEmpty { return trimmed }
    }
    return nil
  }
}
