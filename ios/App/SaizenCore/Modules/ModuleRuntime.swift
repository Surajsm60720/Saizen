import Foundation
import JavaScriptCore

public enum ModuleRuntimeError: Error, LocalizedError {
  case scriptError(String)
  case missingFunction(String)
  case invalidReturn
  case invalidURL(String)
  case sessionEnded

  public var errorDescription: String? {
    switch self {
    case .scriptError(let message): return "Module script error: \(message)"
    case .missingFunction(let name): return "Module function missing: \(name)"
    case .invalidReturn: return "Module returned an invalid value"
    case .invalidURL(let value): return "Module URL is invalid: \(value)"
    case .sessionEnded: return "Module resolve session has ended"
    }
  }
}

public final class ModuleResolveSession: @unchecked Sendable {
  public let moduleId: String

  private let context: JSContext
  private let fetchSession: ModuleFetchSession
  private let baseURL: URL?
  private let contextQueue: DispatchQueue
  private let teardownLock = NSLock()
  private var didTeardown = false
  private let timerLock = NSLock()
  private var nextTimerId = 1
  private var pendingTimers: [Int: DispatchWorkItem] = [:]

  public init(moduleId: String, scriptSource: String, baseURL: URL?) throws {
    self.moduleId = moduleId
    self.context = JSContext()!
    self.baseURL = baseURL
    self.contextQueue = DispatchQueue(label: "app.saizen.modules.runtime.\(moduleId)")

    var seeds = Set<String>()
    if let host = baseURL?.host?.lowercased() { seeds.insert(host) }
    self.fetchSession = ModuleFetchSession(seedAllowedHosts: seeds)

    var startupError: ModuleRuntimeError?
    contextQueue.sync {
      context.exceptionHandler = { _, exception in
        NSLog("[Saizen] Module JS exception: %@", exception?.toString() ?? "?")
      }
      installTimers()
      installFetchBridge()
      installPromiseHelpers()
      context.evaluateScript(scriptSource)
      if let exception = context.exception {
        startupError = .scriptError(exception.toString() ?? "unknown")
        context.exception = nil
      }
    }

    if let startupError { throw startupError }
  }

  public func searchResults(_ query: String) async throws -> [[String: Any]] {
    let value = try await callModuleFunction("searchResults", argument: query)
    return try normalizedResultRows(from: value)
  }

  /// Run many `searchResults` queries concurrently inside one JS context (shared cookie jar).
  /// Network waits happen on URLSession; wall-clock ≈ slowest rail instead of sum.
  public func searchResultsBatch(_ queries: [String]) async throws -> [[[String: Any]]] {
    guard !queries.isEmpty else { return [] }
    let payload = try JSONSerialization.data(withJSONObject: queries)
    guard let json = String(data: payload, encoding: .utf8) else {
      throw ModuleRuntimeError.invalidReturn
    }

    let value = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Any, Error>) in
      contextQueue.async {
        guard !self.isTornDown else {
          continuation.resume(throwing: ModuleRuntimeError.sessionEnded)
          return
        }
        guard let function = self.context.objectForKeyedSubscript("searchResults"),
              !function.isUndefined
        else {
          continuation.resume(throwing: ModuleRuntimeError.missingFunction("searchResults"))
          return
        }

        let script = """
        (function(queries) {
          return Promise.all(queries.map(function(q) {
            return Promise.resolve(searchResults(q)).then(
              function(rows) { return rows; },
              function() { return []; }
            );
          }));
        })(\(json))
        """
        let result = self.context.evaluateScript(script)
        if let exception = self.context.exception {
          self.context.exception = nil
          continuation.resume(throwing: ModuleRuntimeError.scriptError(exception.toString() ?? "unknown"))
          return
        }

        let didResume = ResumeOnce()
        let resolveBlock: @convention(block) (JSValue?) -> Void = { value in
          didResume.resume {
            continuation.resume(returning: value?.toObject() as Any)
          }
        }
        let rejectBlock: @convention(block) (JSValue?) -> Void = { value in
          didResume.resume {
            let message = value?.toString() ?? "unknown"
            continuation.resume(throwing: ModuleRuntimeError.scriptError(message))
          }
        }
        self.context.objectForKeyedSubscript("__saizenAwait").call(
          withArguments: [result as Any, resolveBlock, rejectBlock]
        )
        if let exception = self.context.exception {
          self.context.exception = nil
          didResume.resume {
            continuation.resume(throwing: ModuleRuntimeError.scriptError(exception.toString() ?? "unknown"))
          }
        }
      }
    }

    let decoded = Self.decodeModuleJSON(value) ?? value
    guard let outer = decoded as? [Any] else {
      throw ModuleRuntimeError.invalidReturn
    }
    return try outer.map { item -> [[String: Any]] in
      try normalizedResultRows(from: item)
    }
  }

  public func extractEpisodes(_ showUrl: String) async throws -> [[String: Any]] {
    let value = try await callModuleFunction("extractEpisodes", argument: showUrl)
    return try normalizedResultRows(from: value)
  }

  /// Optional browse API — returns [] if the module does not implement `getHomeSections`.
  public func getHomeSections() async throws -> [[String: Any]] {
    do {
      let value = try await callModuleFunction("getHomeSections", argument: "")
      let decoded = Self.decodeModuleJSON(value) ?? value
      if let arr = decoded as? [Any] {
        return arr.compactMap { Self.dictionary(from: $0) }
      }
      return try normalizedResultRows(from: value)
    } catch ModuleRuntimeError.missingFunction {
      return []
    }
  }

  /// Optional — string names or `{ id, name }` objects. Empty if unimplemented.
  public func getGenres() async throws -> [[String: Any]] {
    do {
      let value = try await callModuleFunction("getGenres", argument: "")
      let decoded = Self.decodeModuleJSON(value) ?? value
      if let strings = decoded as? [String] {
        return strings.map { ["id": $0, "name": $0] }
      }
      if let arr = decoded as? [Any] {
        return arr.compactMap { item -> [String: Any]? in
          if let s = item as? String { return ["id": s, "name": s] }
          return Self.dictionary(from: item)
        }
      }
      return []
    } catch ModuleRuntimeError.missingFunction {
      return []
    }
  }

  public func extractStreamUrl(_ episodeUrl: String) async throws -> [StreamCandidate] {
    let value = try await callModuleFunction("extractStreamUrl", argument: episodeUrl)
    let decoded = Self.decodeModuleJSON(value) ?? value
    guard let object = Self.dictionary(from: decoded),
          let streams = object["streams"] as? [Any] else {
      NSLog(
        "[Saizen] ModuleRuntime extractStreamUrl invalid type=%@",
        String(describing: type(of: value))
      )
      throw ModuleRuntimeError.invalidReturn
    }

    let sharedSubtitle: URL? = {
      guard let raw = object["subtitle"] as? String, !raw.isEmpty,
            let url = URL(string: raw, relativeTo: baseURL)?.absoluteURL,
            url.scheme?.lowercased() == "https" else { return nil }
      return url
    }()

    return try streams.compactMap { item -> StreamCandidate? in
      guard var stream = Self.dictionary(from: item) else {
        throw ModuleRuntimeError.invalidReturn
      }
      // Sora/Luna modules often use `streamUrl` instead of `url`.
      if stream["url"] == nil, let streamUrl = stream["streamUrl"] as? String {
        stream["url"] = streamUrl
      }
      guard let urlString = stream["url"] as? String,
            !urlString.isEmpty,
            let url = URL(string: urlString, relativeTo: baseURL)?.absoluteURL,
            url.scheme?.lowercased() == "https" else {
        return nil
      }

      let headers = Self.stringDictionary(from: stream["headers"]) ?? [:]
      let title = stream["title"] as? String
      let quality =
        (stream["quality"] as? String)
        ?? (stream["resolution"] as? String)
        ?? Self.qualityFromTitle(title)
      let perStreamSubtitle: URL? = {
        guard let raw = stream["subtitle"] as? String, !raw.isEmpty,
              let u = URL(string: raw, relativeTo: baseURL)?.absoluteURL,
              u.scheme?.lowercased() == "https" else { return nil }
        return u
      }()
      return StreamCandidate(
        url: url,
        headers: headers,
        quality: quality,
        title: title,
        moduleId: moduleId,
        kind: StreamCandidate.kind(for: url),
        subtitle: perStreamSubtitle ?? sharedSubtitle
      )
    }
  }

  public func teardown() {
    teardownLock.lock()
    let shouldTeardown = !didTeardown
    didTeardown = true
    teardownLock.unlock()

    guard shouldTeardown else { return }
    cancelAllTimers()
    fetchSession.invalidate()
  }

  deinit {
    teardown()
  }

  /// JSContext has no browser timers; Animex and others use setTimeout for 429 backoff.
  private func installTimers() {
    let setTimeoutBlock: @convention(block) (JSValue?, Double) -> Int = { [weak self] callback, ms in
      guard let self else { return 0 }
      return self.scheduleTimer(callback: callback, delayMs: ms, repeating: false)
    }
    let setIntervalBlock: @convention(block) (JSValue?, Double) -> Int = { [weak self] callback, ms in
      guard let self else { return 0 }
      return self.scheduleTimer(callback: callback, delayMs: ms, repeating: true)
    }
    let clearBlock: @convention(block) (Int) -> Void = { [weak self] id in
      self?.cancelTimer(id: id)
    }
    context.setObject(setTimeoutBlock, forKeyedSubscript: "__saizenSetTimeout" as NSString)
    context.setObject(setIntervalBlock, forKeyedSubscript: "__saizenSetInterval" as NSString)
    context.setObject(clearBlock, forKeyedSubscript: "__saizenClearTimer" as NSString)
    context.evaluateScript(
      """
      this.setTimeout = function(fn, ms) {
        var args = Array.prototype.slice.call(arguments, 2);
        return __saizenSetTimeout(function() {
          if (typeof fn === 'function') fn.apply(null, args);
        }, Number(ms) || 0);
      };
      this.setInterval = function(fn, ms) {
        var args = Array.prototype.slice.call(arguments, 2);
        return __saizenSetInterval(function() {
          if (typeof fn === 'function') fn.apply(null, args);
        }, Number(ms) || 0);
      };
      this.clearTimeout = function(id) { __saizenClearTimer(Number(id) || 0); };
      this.clearInterval = function(id) { __saizenClearTimer(Number(id) || 0); };
      """
    )
  }

  private func scheduleTimer(
    callback: JSValue?,
    delayMs: Double,
    repeating: Bool,
    existingId: Int? = nil
  ) -> Int {
    timerLock.lock()
    let id: Int
    if let existingId {
      id = existingId
    } else {
      id = nextTimerId
      nextTimerId += 1
    }
    timerLock.unlock()

    // Cap delays so a bad Retry-After (e.g. 72774s) cannot stall resolve for hours.
    let clampedMs = min(max(delayMs, 0), 30_000)
    let work = DispatchWorkItem { [weak self] in
      guard let self, !self.isTornDown else { return }
      self.contextQueue.async {
        guard !self.isTornDown else { return }
        callback?.call(withArguments: [])
        if repeating, !self.isTornDown {
          _ = self.scheduleTimer(
            callback: callback,
            delayMs: clampedMs,
            repeating: true,
            existingId: id
          )
        } else {
          self.cancelTimer(id: id)
        }
      }
    }

    timerLock.lock()
    pendingTimers[id]?.cancel()
    pendingTimers[id] = work
    timerLock.unlock()
    DispatchQueue.global(qos: .userInitiated).asyncAfter(
      deadline: .now() + .milliseconds(Int(clampedMs)),
      execute: work
    )
    if delayMs > clampedMs + 1 {
      NSLog(
        "[Saizen] ModuleRuntime clamped setTimeout %.0fms → %.0fms module=%@",
        delayMs,
        clampedMs,
        moduleId
      )
    }
    return id
  }

  private func cancelTimer(id: Int) {
    timerLock.lock()
    let work = pendingTimers.removeValue(forKey: id)
    timerLock.unlock()
    work?.cancel()
  }

  private func cancelAllTimers() {
    timerLock.lock()
    let all = pendingTimers
    pendingTimers.removeAll()
    timerLock.unlock()
    for (_, work) in all { work.cancel() }
  }

  private func installFetchBridge() {
    let fetchBlock: @convention(block) (Any, JSValue?, JSValue, JSValue) -> Void = { [weak self] input, options, resolve, reject in
      guard let self else {
        reject.call(withArguments: ["Module resolve session has ended"])
        return
      }

      let request: URLRequest
      do {
        request = try self.makeFetchRequest(input: input, options: options)
      } catch {
        reject.call(withArguments: [Self.errorMessage(error)])
        return
      }

      let callbacks = FetchPromiseCallbacks(resolve: resolve, reject: reject)
      Task {
        do {
          let (data, response) = try await self.fetchSession.data(for: request)
          self.contextQueue.async {
            let responseValue = self.makeFetchResponse(data: data, response: response)
            callbacks.resolve.call(withArguments: [responseValue as Any])
          }
        } catch {
          self.contextQueue.async {
            callbacks.reject.call(withArguments: [Self.errorMessage(error)])
          }
        }
      }
    }

    context.setObject(fetchBlock, forKeyedSubscript: "__saizenNativeFetch" as NSString)

    let logBlock: @convention(block) (JSValue?) -> Void = { args in
      var message = args?.toString() ?? ""
      // Modules dump huge HTML/JSON into console; keep Xcode console usable.
      if message.count > 400 {
        message = String(message.prefix(400)) + "…"
      }
      NSLog("[Saizen][module] %@", message)
    }
    context.setObject(logBlock, forKeyedSubscript: "__saizenConsoleLog" as NSString)

    context.evaluateScript(
      """
      this.fetch = function(input, options) {
        return new Promise(function(resolve, reject) {
          __saizenNativeFetch(input, options || {}, resolve, reject);
        });
      };
      // Sora/Luna host API: fetchv2(url, headers?, method?, body?, …extra ignored)
      this.fetchv2 = function(url, headers, method, body) {
        var opts = { method: method || 'GET', headers: headers || {} };
        if (body !== undefined && body !== null && String(opts.method).toUpperCase() !== 'GET') {
          opts.body = (typeof body === 'string') ? body : JSON.stringify(body);
          if (!opts.headers['Content-Type'] && !opts.headers['content-type']) {
            opts.headers['Content-Type'] = 'application/json';
          }
        }
        return this.fetch(url, opts);
      };
      this.__saizenFormatLogArg = function(v) {
        if (v === null || v === undefined) return String(v);
        if (typeof v === 'string') return v;
        if (typeof v === 'number' || typeof v === 'boolean') return String(v);
        try { return JSON.stringify(v); } catch (e) { return String(v); }
      };
      this.console = {
        log: function() {
          __saizenConsoleLog(Array.prototype.map.call(arguments, __saizenFormatLogArg).join(' '));
        },
        warn: function() {
          __saizenConsoleLog(Array.prototype.map.call(arguments, __saizenFormatLogArg).join(' '));
        },
        error: function() {
          __saizenConsoleLog(Array.prototype.map.call(arguments, __saizenFormatLogArg).join(' '));
        }
      };
      """
    )
  }

  private func installPromiseHelpers() {
    context.evaluateScript(
      """
      this.__saizenAwait = function(value, resolve, reject) {
        Promise.resolve(value).then(resolve, reject);
      };
      """
    )
  }

  private func makeFetchRequest(input: Any, options: JSValue?) throws -> URLRequest {
    guard !isTornDown else { throw ModuleRuntimeError.sessionEnded }

    let urlString: String
    if let value = input as? JSValue {
      urlString = value.toString()
    } else if let value = input as? String {
      urlString = value
    } else {
      urlString = "\(input)"
    }

    guard let url = URL(string: urlString, relativeTo: baseURL)?.absoluteURL else {
      throw ModuleRuntimeError.invalidURL(urlString)
    }
    guard url.scheme?.lowercased() == "https", let host = url.host, !host.isEmpty else {
      throw ModuleRuntimeError.invalidURL(urlString)
    }
    // Installed modules are user-trusted for the session: allow HTTPS hosts they request
    // (AnimePahe baseUrl is .si but fetches .pw + worker solvers).
    fetchSession.allowHost(host)

    var request = URLRequest(url: url)
    let optionObject = options?.toObject() as? [String: Any] ?? [:]
    let method = (optionObject["method"] as? String)?.uppercased() ?? "GET"
    request.httpMethod = method

    if let headers = Self.stringDictionary(from: optionObject["headers"]) {
      headers.forEach { request.setValue($1, forHTTPHeaderField: $0) }
    }

    if let body = optionObject["body"] {
      request.httpBody = Self.bodyData(from: body)
    }

    // Laravel / Axios: X-XSRF-TOKEN must match the XSRF-TOKEN cookie. iOS hides
    // Set-Cookie from JS, so modules often POST with a missing/wrong header → 419.
    // Always prefer the session jar value when present.
    if method != "GET", method != "HEAD", method != "OPTIONS" {
      applyLaravelXsrfHeader(to: &request)
    }

    return request
  }

  /// Sets `X-XSRF-TOKEN` from the `XSRF-TOKEN` cookie (overrides module value).
  private func applyLaravelXsrfHeader(to request: inout URLRequest) {
    guard let url = request.url, let host = url.host?.lowercased() else { return }
    let forURL = fetchSession.cookies(for: url)
    let fallback = fetchSession.allCookies().filter { cookie in
      let domain = cookie.domain.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))
      return host == domain || host.hasSuffix("." + domain)
    }
    let cookies = forURL.isEmpty ? fallback : forURL
    guard let raw = cookies.first(where: { $0.name == "XSRF-TOKEN" })?.value, !raw.isEmpty else {
      NSLog(
        "[Saizen] ModuleRuntime no XSRF-TOKEN cookie host=%@ jar=%d",
        host,
        cookies.count
      )
      return
    }
    let decoded = raw.removingPercentEncoding ?? raw
    request.setValue(decoded, forHTTPHeaderField: "X-XSRF-TOKEN")
    NSLog("[Saizen] ModuleRuntime set X-XSRF-TOKEN from cookie jar host=%@", host)
  }

  private func makeFetchResponse(data: Data, response: HTTPURLResponse) -> JSValue {
    let body = String(data: data, encoding: .utf8) ?? ""
    var headers = response.allHeaderFields.reduce(into: [String: String]()) { result, item in
      result["\(item.key)".lowercased()] = "\(item.value)"
    }
    // iOS URLSession strips Set-Cookie from allHeaderFields (cookies go only into
    // HTTPCookieStorage). Laravel/Axios modules need to read XSRF-TOKEN from
    // set-cookie — synthesize it from the session jar for this response URL.
    if headers["set-cookie"] == nil, let url = response.url {
      let cookies = fetchSession.cookies(for: url)
      if !cookies.isEmpty {
        headers["set-cookie"] = cookies.map { "\($0.name)=\($0.value)" }.joined(separator: ", ")
      }
    }
    // Modules parse Retry-After as seconds; Cloudflare sometimes returns huge / date values.
    // Cap to 30s so 429 backoff stays usable inside a resolve session.
    if let raw = headers["retry-after"] {
      if let seconds = Int(raw.trimmingCharacters(in: .whitespacesAndNewlines)), seconds > 30 {
        headers["retry-after"] = "5"
        NSLog(
          "[Saizen] ModuleRuntime clamped Retry-After %d → 5 module=%@",
          seconds,
          moduleId
        )
      } else if Int(raw.trimmingCharacters(in: .whitespacesAndNewlines)) == nil {
        // HTTP-date form — modules' parseInt fails open to 5 already; normalize explicitly.
        headers["retry-after"] = "5"
      }
    }

    let payload: [String: Any] = [
      "body": body,
      "headers": headers,
      "ok": (200..<300).contains(response.statusCode),
      "status": response.statusCode,
      "statusText": HTTPURLResponse.localizedString(forStatusCode: response.statusCode),
      "url": response.url?.absoluteString ?? ""
    ]

    let json = Self.jsonLiteral(payload)
    return context.evaluateScript(
      """
      (function(payload) {
        return {
          ok: payload.ok,
          status: payload.status,
          statusText: payload.statusText,
          url: payload.url,
          headers: {
            get: function(name) {
              return payload.headers[String(name).toLowerCase()] || null;
            },
            entries: function() {
              return Object.entries(payload.headers);
            }
          },
          text: function() {
            return Promise.resolve(payload.body);
          },
          json: function() {
            return Promise.resolve(JSON.parse(payload.body));
          }
        };
      })(\(json));
      """
    )
  }

  private func callModuleFunction(_ name: String, argument: String) async throws -> Any {
    try await withCheckedThrowingContinuation { continuation in
      contextQueue.async {
        guard !self.isTornDown else {
          continuation.resume(throwing: ModuleRuntimeError.sessionEnded)
          return
        }

        #if DEBUG
        NSLog("[Saizen] ModuleResolveSession %@ context=%@ call=%@", self.moduleId, String(describing: ObjectIdentifier(self.context)), name)
        #endif

        guard let function = self.context.objectForKeyedSubscript(name), !function.isUndefined else {
          continuation.resume(throwing: ModuleRuntimeError.missingFunction(name))
          return
        }

        let result = function.call(withArguments: [argument])
        if let exception = self.context.exception {
          self.context.exception = nil
          continuation.resume(throwing: ModuleRuntimeError.scriptError(exception.toString() ?? "unknown"))
          return
        }

        let didResume = ResumeOnce()
        let resolveBlock: @convention(block) (JSValue?) -> Void = { value in
          didResume.resume {
            continuation.resume(returning: value?.toObject() as Any)
          }
        }
        let rejectBlock: @convention(block) (JSValue?) -> Void = { value in
          didResume.resume {
            let message = value?.toString() ?? "unknown"
            continuation.resume(throwing: ModuleRuntimeError.scriptError(message))
          }
        }

        self.context.objectForKeyedSubscript("__saizenAwait").call(withArguments: [result as Any, resolveBlock, rejectBlock])
        if let exception = self.context.exception {
          self.context.exception = nil
          didResume.resume {
            continuation.resume(throwing: ModuleRuntimeError.scriptError(exception.toString() ?? "unknown"))
          }
        }
      }
    }
  }

  private var isTornDown: Bool {
    teardownLock.lock()
    let value = didTeardown
    teardownLock.unlock()
    return value
  }

  /// Sora modules commonly `return JSON.stringify([...])` and use `href` instead of `url`.
  private func normalizedResultRows(from value: Any) throws -> [[String: Any]] {
    let decoded = Self.decodeModuleJSON(value) ?? value
    guard let array = decoded as? [Any] else {
      NSLog(
        "[Saizen] ModuleRuntime expected array, got %@",
        String(describing: type(of: decoded))
      )
      throw ModuleRuntimeError.invalidReturn
    }
    return try array.compactMap { item -> [String: Any]? in
      guard var dictionary = Self.dictionary(from: item) else {
        throw ModuleRuntimeError.invalidReturn
      }
      if dictionary["url"] == nil, let href = dictionary["href"] as? String {
        dictionary["url"] = href
      }
      var url = (dictionary["url"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      // Modules return placeholder rows like { title: "Please wait...", href: "" } on failure.
      if url.isEmpty { return nil }
      // AnimePahe (and others) return { href: "Error", number: "Error" } on failure —
      // don't treat that as a relative path against baseURL.
      let lower = url.lowercased()
      if lower == "error" || lower == "null" || lower == "undefined" { return nil }
      // Relative paths (e.g. "anime/178789/slug") must resolve against the module baseURL.
      if let absoluteURL = URL(string: url, relativeTo: baseURL)?.absoluteURL {
        let scheme = absoluteURL.scheme?.lowercased() ?? ""
        // Keep absolute https (and rare http) only; drop junk that can't be fetched.
        if scheme == "https" || scheme == "http" {
          url = absoluteURL.absoluteString
          dictionary["url"] = url
          if dictionary["href"] != nil { dictionary["href"] = url }
        } else if baseURL == nil {
          // No base to resolve against — leave relative for the module's own fetch().
        } else {
          return nil
        }
      }
      return dictionary
    }
  }

  private static func decodeModuleJSON(_ value: Any) -> Any? {
    if let string = value as? String {
      let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
      guard let data = trimmed.data(using: .utf8),
            let json = try? JSONSerialization.jsonObject(with: data) else {
        return nil
      }
      return json
    }
    return nil
  }

  private static func qualityFromTitle(_ title: String?) -> String? {
    guard let title else { return nil }
    if let match = title.range(of: #"(\d{3,4})p"#, options: .regularExpression) {
      return String(title[match])
    }
    return nil
  }

  private static func dictionary(from value: Any?) -> [String: Any]? {
    if let dictionary = value as? [String: Any] { return dictionary }
    if let dictionary = value as? NSDictionary {
      var out: [String: Any] = [:]
      for (key, val) in dictionary {
        out["\(key)"] = val
      }
      return out
    }
    return nil
  }

  private static func stringDictionary(from value: Any?) -> [String: String]? {
    if let dictionary = value as? [String: String] { return dictionary }
    guard let dictionary = dictionary(from: value) else { return nil }
    return dictionary.reduce(into: [String: String]()) { result, item in
      result[item.key] = "\(item.value)"
    }
  }

  private static func bodyData(from value: Any) -> Data? {
    if let data = value as? Data { return data }
    if let string = value as? String { return string.data(using: .utf8) }
    if JSONSerialization.isValidJSONObject(value) {
      return try? JSONSerialization.data(withJSONObject: value, options: [])
    }
    return "\(value)".data(using: .utf8)
  }

  private static func jsonLiteral(_ value: Any) -> String {
    guard JSONSerialization.isValidJSONObject(value),
          let data = try? JSONSerialization.data(withJSONObject: value, options: []),
          let string = String(data: data, encoding: .utf8) else {
      return "null"
    }
    return string
  }

  private static func errorMessage(_ error: Error) -> String {
    if let localized = error as? LocalizedError, let description = localized.errorDescription {
      return description
    }
    return error.localizedDescription
  }
}

private final class ResumeOnce {
  private let lock = NSLock()
  private var didResume = false

  func resume(_ block: () -> Void) {
    lock.lock()
    guard !didResume else {
      lock.unlock()
      return
    }
    didResume = true
    lock.unlock()
    block()
  }
}

private final class FetchPromiseCallbacks: @unchecked Sendable {
  let resolve: JSValue
  let reject: JSValue

  init(resolve: JSValue, reject: JSValue) {
    self.resolve = resolve
    self.reject = reject
  }
}
