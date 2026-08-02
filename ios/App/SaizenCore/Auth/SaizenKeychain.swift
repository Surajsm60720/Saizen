import Foundation
import Security

/// Tiny Keychain helper for OAuth tokens (personal-app scope).
public enum SaizenKeychain {
  private static let service = "app.saizen.auth"

  public static func set(_ value: String, account: String) -> Bool {
    guard let data = value.data(using: .utf8) else { return false }
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account
    ]
    SecItemDelete(query as CFDictionary)
    var add = query
    add[kSecValueData as String] = data
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
  }

  public static func get(account: String) -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne
    ]
    var out: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &out)
    guard status == errSecSuccess, let data = out as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }

  public static func delete(account: String) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account
    ]
    SecItemDelete(query as CFDictionary)
  }
}
