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
    CAPPluginMethod(name: "refreshMalToken", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getSecureItem", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "setSecureItem", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "deleteSecureItem", returnType: CAPPluginReturnPromise)
  ]

  /// Keychain accounts the web bridge may touch (tokens only — never client secrets).
  private static let allowedSecureKeys: Set<String> = ["anilist", "mal"]

  private static func isAllowedOAuthURL(_ url: URL, hosts: Set<String>) -> Bool {
    guard url.scheme?.lowercased() == "https" else { return false }
    let host = (url.host ?? "").lowercased()
    return hosts.contains(host)
  }

  /// Opens AniList OAuth (Authorization Code). Exchanges `?code=` using Keychain /
  /// `AnilistSecret.local.swift` secret. Access token is Keychain-only (not in Cap resolve).
  @objc func authAnilist(_ call: CAPPluginCall) {
    guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
      call.reject("Missing or invalid url")
      return
    }
    guard Self.isAllowedOAuthURL(url, hosts: ["anilist.co"]) else {
      call.reject("OAuth URL not allowed (https://anilist.co only)")
      return
    }
    let clientId = (call.getString("clientId") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !clientId.isEmpty else {
      call.reject("Missing AniList clientId")
      return
    }
    let redirectUri =
      (call.getString("redirectUri") ?? "saizen://anilist/callback")
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let scheme = call.getString("callbackScheme") ?? "saizen"

    guard let secret = AnilistSecretStore.resolve(), !secret.isEmpty else {
      call.reject(
        "AniList Client Secret missing. Run: bash scripts/set-anilist-secret.sh   then pnpm sync:ios and rebuild. (No Settings UI — secret stays off the JS bridge.)"
      )
      return
    }

    DispatchQueue.main.async {
      AuthSession.start(url: url, callbackScheme: scheme, from: self.bridge?.viewController) { result in
        switch result {
        case .failure(let error):
          call.reject(error.localizedDescription)
        case .success(let callbackURL):
          if let err = Self.fragmentValue(callbackURL, key: "error")
            ?? Self.queryValue(callbackURL, key: "error")
          {
            let desc =
              Self.fragmentValue(callbackURL, key: "error_description")
              ?? Self.queryValue(callbackURL, key: "error_description")
              ?? err
            call.reject("AniList OAuth: \(desc.replacingOccurrences(of: "+", with: " "))")
            return
          }
          // Prefer Authorization Code (query). Still accept Implicit fragment if present.
          if let token = Self.fragmentValue(callbackURL, key: "access_token")
            ?? Self.queryValue(callbackURL, key: "access_token"),
            !token.isEmpty
          {
            let expiresRaw =
              Self.fragmentValue(callbackURL, key: "expires_in")
              ?? Self.queryValue(callbackURL, key: "expires_in")
            let state =
              Self.fragmentValue(callbackURL, key: "state")
              ?? Self.queryValue(callbackURL, key: "state")
              ?? ""
            if !Self.persistAnilistToken(accessToken: token, expiresIn: expiresRaw) {
              call.reject("Keychain write failed for AniList token")
              return
            }
            call.resolve([
              "ok": true,
              "expires_in": expiresRaw ?? "",
              "token_type": "Bearer",
              "state": state
            ])
            return
          }
          guard let code = Self.queryValue(callbackURL, key: "code"), !code.isEmpty else {
            call.reject(
              "\(AuthSessionError.missingCode.localizedDescription) (callback host: \(callbackURL.host ?? "")\(callbackURL.path))"
            )
            return
          }
          let state = Self.queryValue(callbackURL, key: "state") ?? ""
          Self.exchangeAnilistCode(
            clientId: clientId,
            clientSecret: secret,
            redirectUri: redirectUri,
            code: code,
            state: state,
            call: call
          )
        }
      }
    }
  }

  /// Opens MAL OAuth authorize URL; returns `code` (+ `state`) from callback query (not tokens).
  @objc func authMAL(_ call: CAPPluginCall) {
    guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
      call.reject("Missing or invalid url")
      return
    }
    guard Self.isAllowedOAuthURL(url, hosts: ["myanimelist.net"]) else {
      call.reject("OAuth URL not allowed (https://myanimelist.net only)")
      return
    }
    let scheme = call.getString("callbackScheme") ?? "saizen"
    DispatchQueue.main.async {
      AuthSession.start(url: url, callbackScheme: scheme, from: self.bridge?.viewController) { result in
        switch result {
        case .failure(let error):
          call.reject(error.localizedDescription)
        case .success(let callbackURL):
          if let err = Self.queryValue(callbackURL, key: "error") {
            let desc =
              Self.queryValue(callbackURL, key: "message")
              ?? Self.queryValue(callbackURL, key: "hint")
              ?? err
            call.reject("MAL OAuth: \(desc.replacingOccurrences(of: "+", with: " "))")
            return
          }
          guard let code = Self.queryValue(callbackURL, key: "code"), !code.isEmpty else {
            call.reject(
              "\(AuthSessionError.missingCode.localizedDescription) — confirm MAL Redirect URL is exactly saizen://mal/callback"
            )
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

  /// Exchange MAL code → tokens; persist to Keychain; resolve without token values.
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

    Self.postMalToken(body: body, clientId: clientId, call: call, persistOnly: true)
  }

  @objc func refreshMalToken(_ call: CAPPluginCall) {
    guard let clientId = call.getString("clientId"), !clientId.isEmpty,
          let refreshToken = call.getString("refreshToken"), !refreshToken.isEmpty
    else {
      call.reject("Missing clientId or refreshToken")
      return
    }
    let body = [
      "client_id=\(Self.formEncode(clientId))",
      "grant_type=refresh_token",
      "refresh_token=\(Self.formEncode(refreshToken))"
    ].joined(separator: "&")
    Self.postMalToken(body: body, clientId: clientId, call: call, persistOnly: true)
  }

  private static func persistAnilistToken(accessToken: String, expiresIn: String?) -> Bool {
    var expiresAt: Any = NSNull()
    if let expiresIn, let sec = Double(expiresIn), sec > 0 {
      expiresAt = Int64(Date().timeIntervalSince1970 * 1000) + Int64(sec * 1000)
    }
    let obj: [String: Any] = [
      "accessToken": accessToken,
      "expiresAt": expiresAt
    ]
    guard let data = try? JSONSerialization.data(withJSONObject: obj),
          let json = String(data: data, encoding: .utf8)
    else { return false }
    return SaizenKeychain.setStatus(json, account: "anilist") == errSecSuccess
  }

  private static func exchangeAnilistCode(
    clientId: String,
    clientSecret: String,
    redirectUri: String,
    code: String,
    state: String,
    call: CAPPluginCall
  ) {
    guard let url = URL(string: "https://anilist.co/api/v2/oauth/token") else {
      call.reject("Invalid AniList token URL")
      return
    }
    var payload: [String: Any] = [
      "grant_type": "authorization_code",
      "client_secret": clientSecret,
      "redirect_uri": redirectUri,
      "code": code
    ]
    if let n = Int(clientId) {
      payload["client_id"] = n
    } else {
      payload["client_id"] = clientId
    }
    guard let body = try? JSONSerialization.data(withJSONObject: payload) else {
      call.reject("Could not encode AniList token request")
      return
    }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.httpBody = body

    URLSession.shared.dataTask(with: request) { data, response, error in
      if let error {
        call.reject(error.localizedDescription)
        return
      }
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      let text = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
      guard status >= 200 && status < 300, let data, !data.isEmpty else {
        if text.contains("invalid_client") {
          call.reject(
            "AniList invalid_client for app \(clientId). Update ios/App/SaizenCore/Auth/AnilistSecret.local.swift via scripts/set-anilist-secret.sh (same app as NEXT_PUBLIC_ANILIST_CLIENT_ID), sync, rebuild."
          )
          return
        }
        let safe = text.replacingOccurrences(
          of: #""(access|refresh)_token"\s*:\s*"[^"]*""#,
          with: "\"$1_token\":\"[redacted]\"",
          options: .regularExpression
        )
        call.reject("AniList token exchange failed (\(status)) \(safe.prefix(160))")
        return
      }
      do {
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let access = json["access_token"] as? String, !access.isEmpty
        else {
          call.reject("AniList token response missing access_token")
          return
        }
        let expires: Any = json["expires_in"] ?? ""
        if !Self.persistAnilistToken(accessToken: access, expiresIn: "\(expires)") {
          call.reject("Keychain write failed for AniList token")
          return
        }
        call.resolve([
          "ok": true,
          "expires_in": "\(expires)",
          "token_type": (json["token_type"] as? String) ?? "Bearer",
          "state": state
        ])
      } catch {
        call.reject("AniList token JSON parse failed")
      }
    }.resume()
  }

  private static func persistMalToken(
    accessToken: String,
    refreshToken: String,
    expiresIn: Int
  ) -> Bool {
    var expiresAt: Any = NSNull()
    if expiresIn > 0 {
      expiresAt = Int64(Date().timeIntervalSince1970 * 1000) + Int64(expiresIn) * 1000
    }
    let obj: [String: Any] = [
      "accessToken": accessToken,
      "refreshToken": refreshToken,
      "expiresAt": expiresAt
    ]
    guard let data = try? JSONSerialization.data(withJSONObject: obj),
          let json = String(data: data, encoding: .utf8)
    else { return false }
    return SaizenKeychain.setStatus(json, account: "mal") == errSecSuccess
  }

  private static func postMalToken(
    body: String,
    clientId: String,
    call: CAPPluginCall,
    persistOnly: Bool
  ) {
    guard let url = URL(string: "https://myanimelist.net/v1/oauth2/token") else {
      call.reject("Invalid token URL")
      return
    }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
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
        // Never echo refresh tokens / secrets from the body.
        let safe = text.replacingOccurrences(
          of: #""(access|refresh)_token"\s*:\s*"[^"]*""#,
          with: "\"$1_token\":\"[redacted]\"",
          options: .regularExpression
        )
        call.reject("MAL token exchange failed (\(status)) \(safe.prefix(160))")
        return
      }
      do {
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let access = json["access_token"] as? String, !access.isEmpty
        else {
          call.reject("MAL token response missing access_token")
          return
        }
        let refresh = json["refresh_token"] as? String ?? ""
        let expires = json["expires_in"] as? Int ?? 0
        if persistOnly {
          if !Self.persistMalToken(
            accessToken: access,
            refreshToken: refresh,
            expiresIn: expires
          ) {
            call.reject("Keychain write failed for MAL token")
            return
          }
          call.resolve([
            "ok": true,
            "expires_in": expires,
            "token_type": (json["token_type"] as? String) ?? "Bearer"
          ])
          return
        }
        call.resolve([
          "ok": true,
          "expires_in": expires,
          "token_type": (json["token_type"] as? String) ?? "Bearer"
        ])
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
    guard Self.allowedSecureKeys.contains(key) else {
      call.reject("Secure key not allowed")
      return
    }
    // Cap Debug logs resolve payloads — return a flag + length only when unset;
    // value is still required by the web session cache. Prefer loggingBehavior: none.
    call.resolve(["value": SaizenKeychain.get(account: key) as Any])
  }

  @objc func setSecureItem(_ call: CAPPluginCall) {
    guard let key = call.getString("key"), !key.isEmpty,
          let value = call.getString("value") else {
      call.reject("Missing key or value")
      return
    }
    guard Self.allowedSecureKeys.contains(key) else {
      call.reject("Secure key not allowed")
      return
    }
    let status = SaizenKeychain.setStatus(value, account: key)
    if status == errSecSuccess {
      call.resolve(["ok": true])
    } else {
      call.reject("Keychain write failed (OSStatus \(status))")
    }
  }

  @objc func deleteSecureItem(_ call: CAPPluginCall) {
    guard let key = call.getString("key"), !key.isEmpty else {
      call.reject("Missing key")
      return
    }
    guard Self.allowedSecureKeys.contains(key) else {
      call.reject("Secure key not allowed")
      return
    }
    SaizenKeychain.delete(account: key)
    call.resolve(["ok": true])
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
