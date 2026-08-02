import Capacitor
import UIKit

@objc(SaizenAuthPlugin)
public class SaizenAuthPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "SaizenAuthPlugin"
  public let jsName = "SaizenAuth"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "authAnilist", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "authMAL", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getSecureItem", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "setSecureItem", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "deleteSecureItem", returnType: CAPPluginReturnPromise)
  ]

  /// Opens AniList OAuth (implicit or code). Parses `#access_token=` or `?code=` from callback.
  @objc func authAnilist(_ call: CAPPluginCall) {
    guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
      call.reject("Missing or invalid url")
      return
    }
    let scheme = call.getString("callbackScheme") ?? "saizen"
    DispatchQueue.main.async {
      AuthSession.start(url: url, callbackScheme: scheme, from: self.bridge?.viewController) { result in
        switch result {
        case .failure(let error):
          call.reject(error.localizedDescription)
        case .success(let callbackURL):
          if let token = Self.fragmentValue(callbackURL, key: "access_token") {
            let expires = Self.fragmentValue(callbackURL, key: "expires_in") ?? ""
            call.resolve([
              "access_token": token,
              "expires_in": expires,
              "token_type": "Bearer"
            ])
          } else if let code = Self.queryValue(callbackURL, key: "code") {
            call.resolve([
              "code": code,
              "state": Self.queryValue(callbackURL, key: "state") ?? ""
            ])
          } else {
            call.reject(AuthSessionError.missingToken.localizedDescription)
          }
        }
      }
    }
  }

  /// Opens MAL OAuth authorize URL; returns `code` (+ `state`) from callback query.
  @objc func authMAL(_ call: CAPPluginCall) {
    guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
      call.reject("Missing or invalid url")
      return
    }
    let scheme = call.getString("callbackScheme") ?? "saizen"
    DispatchQueue.main.async {
      AuthSession.start(url: url, callbackScheme: scheme, from: self.bridge?.viewController) { result in
        switch result {
        case .failure(let error):
          call.reject(error.localizedDescription)
        case .success(let callbackURL):
          guard let code = Self.queryValue(callbackURL, key: "code") else {
            call.reject(AuthSessionError.missingCode.localizedDescription)
            return
          }
          call.resolve([
            "code": code,
            "state": Self.queryValue(callbackURL, key: "state") ?? ""
          ])
        }
      }
    }
  }

  @objc func getSecureItem(_ call: CAPPluginCall) {
    guard let key = call.getString("key"), !key.isEmpty else {
      call.reject("Missing key")
      return
    }
    call.resolve(["value": SaizenKeychain.get(account: key) as Any])
  }

  @objc func setSecureItem(_ call: CAPPluginCall) {
    guard let key = call.getString("key"), !key.isEmpty,
          let value = call.getString("value") else {
      call.reject("Missing key or value")
      return
    }
    let ok = SaizenKeychain.set(value, account: key)
    if ok { call.resolve() } else { call.reject("Keychain write failed") }
  }

  @objc func deleteSecureItem(_ call: CAPPluginCall) {
    guard let key = call.getString("key"), !key.isEmpty else {
      call.reject("Missing key")
      return
    }
    SaizenKeychain.delete(account: key)
    call.resolve()
  }

  private static func fragmentValue(_ url: URL, key: String) -> String? {
    guard let fragment = url.fragment else { return nil }
    return Self.parsePairs(fragment)[key]
  }

  private static func queryValue(_ url: URL, key: String) -> String? {
    if let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems {
      return items.first(where: { $0.name == key })?.value
    }
    // Some callbacks put params after host without standard parsing
    if let query = url.query {
      return Self.parsePairs(query)[key]
    }
    return nil
  }

  private static func parsePairs(_ raw: String) -> [String: String] {
    var out: [String: String] = [:]
    for part in raw.split(separator: "&") {
      let kv = part.split(separator: "=", maxSplits: 1).map(String.init)
      guard kv.count == 2 else { continue }
      out[kv[0]] = kv[1].removingPercentEncoding ?? kv[1]
    }
    return out
  }
}
