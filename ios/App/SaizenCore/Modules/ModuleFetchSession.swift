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
  private let sessionDelegate: SessionDelegate

  public init(allowedHosts: Set<String>, deniedHosts: Set<String> = []) {
    // IMPORTANT: `HTTPCookieStorage()` (bare init) does NOT accept cookies from
    // URLSession on Apple platforms — jar stays empty and Laravel XSRF breaks.
    // `sharedCookieStorage(forGroupContainerIdentifier:)` with a unique id gives
    // an isolated, working in-process store (invalid group → app-unique store).
    let jar = HTTPCookieStorage.sharedCookieStorage(
      forGroupContainerIdentifier: "saizen.modules.\(UUID().uuidString)"
    )
    jar.cookieAcceptPolicy = .always
    self.cookieStorage = jar

    self.allowedHosts = Set(allowedHosts.map { $0.lowercased() })
    self.deniedHosts = Set(deniedHosts.map { $0.lowercased() })

    let config = URLSessionConfiguration.ephemeral
    config.httpCookieStorage = jar
    config.httpCookieAcceptPolicy = .always
    config.httpShouldSetCookies = true
    config.urlCache = nil

    let delegate = SessionDelegate()
    self.sessionDelegate = delegate
    self.session = URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
    delegate.owner = self
  }

  public convenience init(seedAllowedHosts: Set<String>, deniedHosts: Set<String> = []) {
    self.init(allowedHosts: seedAllowedHosts, deniedHosts: deniedHosts)
  }

  public func allowHost(_ host: String) {
    lock.lock(); allowedHosts.insert(host.lowercased()); lock.unlock()
  }

  public func invalidate() {
    session.invalidateAndCancel()
  }

  public func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
    guard let url = request.url else { throw ModuleFetchError.nonHttps }
    try validateURL(url)
    let (data, resp) = try await session.data(for: request)
    guard let http = resp as? HTTPURLResponse else { throw ModuleFetchError.badResponse }
    if let final = http.url, let h = final.host?.lowercased() { allowHost(h) }
    ingestCookies(from: http, for: http.url ?? url)
    return (data, http)
  }

  public func data(for url: URL, method: String = "GET", headers: [String: String] = [:], body: Data? = nil) async throws -> (Data, HTTPURLResponse) {
    var req = URLRequest(url: url)
    req.httpMethod = method
    headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
    req.httpBody = body
    return try await data(for: req)
  }

  /// Best-effort Set-Cookie harvest. iOS often omits Set-Cookie from
  /// `allHeaderFields`; `value(forHTTPHeaderField:)` sometimes still works,
  /// and URLSession should also write into our jar when the storage is valid.
  private func ingestCookies(from http: HTTPURLResponse, for url: URL) {
    var headerMap: [String: String] = [:]
    if let single = http.value(forHTTPHeaderField: "Set-Cookie"), !single.isEmpty {
      headerMap["Set-Cookie"] = single
    }
    for (key, value) in http.allHeaderFields {
      let name = "\(key)"
      if name.lowercased() == "set-cookie" {
        headerMap["Set-Cookie"] = "\(value)"
      }
    }
    guard !headerMap.isEmpty else { return }
    let parsed = HTTPCookie.cookies(withResponseHeaderFields: headerMap, for: url)
    for cookie in parsed {
      cookieStorage.setCookie(cookie)
    }
    if !parsed.isEmpty {
      NSLog(
        "[Saizen] ModuleFetchSession ingested %d cookie(s) host=%@",
        parsed.count,
        url.host ?? "?"
      )
    }
  }

  fileprivate func validateURL(_ url: URL) throws {
    guard let scheme = url.scheme?.lowercased(), scheme == "https" else { throw ModuleFetchError.nonHttps }
    guard let host = url.host?.lowercased(), !host.isEmpty else { throw ModuleFetchError.nonHttps }
    if deniedHosts.contains(host) { throw ModuleFetchError.hostDenied(host) }
    lock.lock()
    let allowed = allowedHosts.contains(host)
    lock.unlock()
    if !allowed { throw ModuleFetchError.hostNotAllowed(host) }
  }
}

private final class SessionDelegate: NSObject, URLSessionTaskDelegate {
  weak var owner: ModuleFetchSession?

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    guard let owner, let url = request.url else {
      completionHandler(nil)
      return
    }
    // Follow HTTPS redirects onto newly discovered hosts (deny list still wins).
    // Cancelling the redirect returns the 301 HTML body and breaks JSON parsers
    // (AnimePahe / jakBa saw "301 Moved Permanently" as the fetch body).
    if let host = url.host {
      owner.allowHost(host)
    }
    do {
      try owner.validateURL(url)
      completionHandler(request)
    } catch {
      completionHandler(nil)
    }
  }
}

#if DEBUG
public enum ModuleFetchSessionDebug {
  /// Verifies each session owns a private cookie jar distinct from shared storage and other sessions.
  public static func assertCookieStorageIsolation() {
    let sessionA = ModuleFetchSession(allowedHosts: ["example.com"])
    let sessionB = ModuleFetchSession(allowedHosts: ["example.com"])
    assert(sessionA.cookieStorage !== HTTPCookieStorage.shared)
    assert(sessionA.cookieStorage !== sessionB.cookieStorage)
    sessionA.invalidate()
    sessionB.invalidate()
  }
}
#endif
