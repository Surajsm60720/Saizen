import Capacitor
import UIKit

@objc(SaizenAuthPlugin)
public class SaizenAuthPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "SaizenAuthPlugin"
  public let jsName = "SaizenAuth"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "authAnilist", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "authMAL", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "exchangeMalToken", returnType: CAPPluginReturnPromise),
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

  /// Exchange MAL authorization code for tokens via URLSession (reliable form POST).
  /// Public/"other"/iOS clients only — PKCE, no client_secret (Saizen security invariant).
  /// Uses MAL Scheme 1: HTTP Basic with `client_id` and empty password.
  @objc func exchangeMalToken(_ call: CAPPluginCall) {
    guard let clientId = call.getString("clientId"), !clientId.isEmpty,
          let code = call.getString("code"), !code.isEmpty,
          let codeVerifier = call.getString("codeVerifier"), !codeVerifier.isEmpty,
          let redirectUri = call.getString("redirectUri"), !redirectUri.isEmpty
    else {
      call.reject("Missing clientId, code, codeVerifier, or redirectUri")
      return
    }

    let body = [
      "client_id=\(Self.formEncode(clientId))",
      "code=\(Self.formEncode(code))",
      "code_verifier=\(Self.formEncode(codeVerifier))",
      "grant_type=authorization_code",
      "redirect_uri=\(Self.formEncode(redirectUri))"
    ].joined(separator: "&")

    guard let url = URL(string: "https://myanimelist.net/v1/oauth2/token") else {
      call.reject("Invalid token URL")
      return
    }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    // Scheme 1: Basic username=client_id, password="" (public client has no secret).
    let basic = Data("\(clientId):".utf8).base64EncodedString()
    request.setValue("Basic \(basic)", forHTTPHeaderField: "Authorization")
    request.httpBody = Data(body.utf8)

    URLSession.shared.dataTask(with: request) { data, response, error in
      if let error {
        call.reject(error.localizedDescription)
        return
      }
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      let text = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
      guard status >= 200 && status < 300, let data, !data.isEmpty else {
        call.reject("MAL token exchange failed (\(status)) \(text.prefix(200))")
        return
      }
      do {
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let access = json["access_token"] as? String, !access.isEmpty
        else {
          call.reject("MAL token response missing access_token")
          return
        }
        let out: [String: Any] = [
          "access_token": access,
          "refresh_token": json["refresh_token"] as? String ?? "",
          "expires_in": json["expires_in"] as? Int ?? 0,
          "token_type": json["token_type"] as? String ?? "Bearer"
        ]
        call.resolve(out)
      } catch {
        call.reject("MAL token JSON parse failed")
      }
    }.resume()
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

  private static func formEncode(_ value: String) -> String {
    var allowed = CharacterSet.alphanumerics
    allowed.insert(charactersIn: "-._~")
    return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
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
