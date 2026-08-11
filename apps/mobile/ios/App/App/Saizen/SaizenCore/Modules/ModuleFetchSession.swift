import Foundation

public enum ModuleFetchError: Error, LocalizedError {
  case nonHttps
  case hostDenied(String)
  case hostNotAllowed(String)
  case badResponse

  public var errorDescription: String? {
    switch self {
    case .nonHttps: return "Module fetch requires https://"
    case .hostDenied(let h): return "Host denied: \(h)"
    case .hostNotAllowed(let h): return "Host not allowed: \(h)"
    case .badResponse: return "Invalid HTTP response"
    }
  }
}

public final class ModuleFetchSession: @unchecked Sendable {
  public let cookieStorage: HTTPCookieStorage
  private let session: URLSession
  private var allowedHosts: Set<String>
  private let deniedHosts: Set<String>
  private let lock = NSLock()

  public init(seedAllowedHosts: Set<String>, deniedHosts: Set<String> = []) {
    self.cookieStorage = HTTPCookieStorage()
    self.allowedHosts = seedAllowedHosts
    self.deniedHosts = deniedHosts
    let config = URLSessionConfiguration.ephemeral
    config.httpCookieStorage = cookieStorage
    config.httpCookieAcceptPolicy = .always
    config.httpShouldSetCookies = true
    self.session = URLSession(configuration: config)
  }

  public func allowHost(_ host: String) {
    lock.lock(); allowedHosts.insert(host.lowercased()); lock.unlock()
  }

  public func invalidate() {
    session.invalidateAndCancel()
  }

  public func data(for url: URL, method: String = "GET", headers: [String: String] = [:], body: Data? = nil) async throws -> (Data, HTTPURLResponse) {
    guard let scheme = url.scheme?.lowercased(), scheme == "https" else { throw ModuleFetchError.nonHttps }
    guard let host = url.host?.lowercased(), !host.isEmpty else { throw ModuleFetchError.nonHttps }
    if deniedHosts.contains(host) { throw ModuleFetchError.hostDenied(host) }
    lock.lock(); let allowed = allowedHosts.contains(host); lock.unlock()
    if !allowed { throw ModuleFetchError.hostNotAllowed(host) }

    var req = URLRequest(url: url)
    req.httpMethod = method
    headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
    req.httpBody = body
    let (data, resp) = try await session.data(for: req)
    guard let http = resp as? HTTPURLResponse else { throw ModuleFetchError.badResponse }
    if let final = http.url, let h = final.host?.lowercased() { allowHost(h) }
    return (data, http)
  }
}

#if DEBUG
public enum ModuleFetchSessionDebug {
  /// Verifies each session owns a private cookie jar distinct from shared storage and other sessions.
  public static func assertCookieStorageIsolation() {
    let sessionA = ModuleFetchSession(seedAllowedHosts: ["example.com"])
    let sessionB = ModuleFetchSession(seedAllowedHosts: ["example.com"])
    assert(sessionA.cookieStorage !== HTTPCookieStorage.shared)
    assert(sessionA.cookieStorage !== sessionB.cookieStorage)
    sessionA.invalidate()
    sessionB.invalidate()
  }
}
#endif
