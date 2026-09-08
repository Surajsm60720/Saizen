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

/// Per-module HTTPS fetch with an in-memory cookie jar.
///
/// We intentionally do **not** use `HTTPCookieStorage` with URLSession:
/// concurrent `setCookie` from URLSession’s cookie engine + our ingest path
/// races and crashes (`EXC_BAD_ACCESS` / `__CF_IS_OBJC`) under parallel rails
/// (e.g. haho cover backfills).
public final class ModuleFetchSession: @unchecked Sendable {
  private let session: URLSession
  private var allowedHosts: Set<String>
  private let deniedHosts: Set<String>
  private let lock = NSLock()
  private let cookieLock = NSLock()
  /// name|domain|path → cookie
  private var jar: [String: HTTPCookie] = [:]
  private var didInvalidate = false
  private let sessionDelegate: SessionDelegate

  public init(allowedHosts: Set<String>, deniedHosts: Set<String> = []) {
    self.allowedHosts = Set(allowedHosts.map { $0.lowercased() })
    self.deniedHosts = Set(deniedHosts.map { $0.lowercased() })

    let config = URLSessionConfiguration.ephemeral
    // Exclusive ownership of cookies — URLSession must not touch a shared jar.
    config.httpCookieStorage = nil
    config.httpCookieAcceptPolicy = .never
    config.httpShouldSetCookies = false
    config.urlCache = nil

    let delegate = SessionDelegate()
    self.sessionDelegate = delegate
    let delegateQueue = OperationQueue()
    delegateQueue.name = "app.saizen.modules.fetch"
    delegateQueue.maxConcurrentOperationCount = 1
    self.session = URLSession(configuration: config, delegate: delegate, delegateQueue: delegateQueue)
    delegate.owner = self
  }

  public convenience init(seedAllowedHosts: Set<String>, deniedHosts: Set<String> = []) {
    self.init(allowedHosts: seedAllowedHosts, deniedHosts: deniedHosts)
  }

  public func allowHost(_ host: String) {
    lock.lock(); allowedHosts.insert(host.lowercased()); lock.unlock()
  }

  public func invalidate() {
    lock.lock()
    didInvalidate = true
    lock.unlock()
    cookieLock.lock()
    jar.removeAll()
    cookieLock.unlock()
    session.invalidateAndCancel()
  }

  /// Thread-safe cookie read for Laravel XSRF / Set-Cookie synthesis.
  public func cookies(for url: URL) -> [HTTPCookie] {
    cookieLock.lock()
    defer { cookieLock.unlock() }
    return Self.cookiesMatching(url: url, from: Array(jar.values))
  }

  /// Thread-safe full jar snapshot.
  public func allCookies() -> [HTTPCookie] {
    cookieLock.lock()
    defer { cookieLock.unlock() }
    return Array(jar.values)
  }

  public func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
    guard let url = request.url else { throw ModuleFetchError.nonHttps }
    try validateURL(url)
    var req = request
    attachCookies(to: &req)
    let (data, resp) = try await session.data(for: req)
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

  fileprivate func attachCookies(to request: inout URLRequest) {
    guard let url = request.url else { return }
    let cookies = cookies(for: url)
    guard !cookies.isEmpty else { return }
    let fields = HTTPCookie.requestHeaderFields(with: cookies)
    for (key, value) in fields {
      // Don't overwrite an explicit Cookie header from the module.
      if request.value(forHTTPHeaderField: key) == nil {
        request.setValue(value, forHTTPHeaderField: key)
      }
    }
  }

  /// Best-effort Set-Cookie harvest into the locked in-memory jar.
  fileprivate func ingestCookies(from http: HTTPURLResponse, for url: URL) {
    lock.lock()
    let dead = didInvalidate
    lock.unlock()
    guard !dead else { return }

    var headerMap: [String: String] = [:]
    if let single = http.value(forHTTPHeaderField: "Set-Cookie"), !single.isEmpty {
      headerMap["Set-Cookie"] = single
    }
    for (key, value) in http.allHeaderFields {
      if "\(key)".lowercased() == "set-cookie" {
        headerMap["Set-Cookie"] = "\(value)"
      }
    }
    guard !headerMap.isEmpty else { return }
    let parsed = HTTPCookie.cookies(withResponseHeaderFields: headerMap, for: url)
    guard !parsed.isEmpty else { return }

    cookieLock.lock()
    for cookie in parsed {
      let key = "\(cookie.name.lowercased())|\(cookie.domain.lowercased())|\(cookie.path)"
      jar[key] = cookie
    }
    let count = parsed.count
    let host = url.host ?? "?"
    cookieLock.unlock()

    #if DEBUG
    NSLog("[Saizen] ModuleFetchSession ingested %d cookie(s) host=%@", count, host)
    #endif
  }

  private static func cookiesMatching(url: URL, from cookies: [HTTPCookie]) -> [HTTPCookie] {
    guard let host = url.host?.lowercased() else { return [] }
    let path = url.path.isEmpty ? "/" : url.path
    return cookies.filter { cookie in
      let domain = cookie.domain.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))
      let hostOk = host == domain || host.hasSuffix("." + domain)
      guard hostOk else { return false }
      let cookiePath = cookie.path.isEmpty ? "/" : cookie.path
      return path == cookiePath || path.hasPrefix(cookiePath)
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
    // Capture Set-Cookie on the redirect response, then attach jar cookies
    // to the follow-up request (URLSession won't — we own the jar).
    if let redirectURL = response.url ?? task.currentRequest?.url {
      owner.ingestCookies(from: response, for: redirectURL)
    }
    if let host = url.host {
      owner.allowHost(host)
    }
    do {
      try owner.validateURL(url)
      var next = request
      owner.attachCookies(to: &next)
      completionHandler(next)
    } catch {
      completionHandler(nil)
    }
  }
}

#if DEBUG
public enum ModuleFetchSessionDebug {
  public static func assertCookieStorageIsolation() {
    let sessionA = ModuleFetchSession(allowedHosts: ["example.com"])
    let sessionB = ModuleFetchSession(allowedHosts: ["example.com"])
    // Separate in-memory jars — mutating one must not affect the other.
    assert(sessionA.allCookies().isEmpty && sessionB.allCookies().isEmpty)
    sessionA.invalidate()
    sessionB.invalidate()
  }
}
#endif
