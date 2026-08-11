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
    return try Self.arrayOfDictionaries(from: value)
  }

  public func extractEpisodes(_ showUrl: String) async throws -> [[String: Any]] {
    let value = try await callModuleFunction("extractEpisodes", argument: showUrl)
    return try Self.arrayOfDictionaries(from: value)
  }

  public func extractStreamUrl(_ episodeUrl: String) async throws -> [StreamCandidate] {
    let value = try await callModuleFunction("extractStreamUrl", argument: episodeUrl)
    guard let object = Self.dictionary(from: value),
          let streams = object["streams"] as? [Any] else {
      throw ModuleRuntimeError.invalidReturn
    }

    return try streams.compactMap { item in
      guard let stream = Self.dictionary(from: item),
            let urlString = stream["url"] as? String,
            let url = URL(string: urlString, relativeTo: baseURL)?.absoluteURL,
            url.scheme?.lowercased() == "https" else {
        throw ModuleRuntimeError.invalidReturn
      }

      let headers = Self.stringDictionary(from: stream["headers"]) ?? [:]
      return StreamCandidate(
        url: url,
        headers: headers,
        quality: stream["quality"] as? String,
        title: stream["title"] as? String,
        moduleId: moduleId,
        kind: StreamCandidate.kind(for: url)
      )
    }
  }

  public func teardown() {
    teardownLock.lock()
    let shouldTeardown = !didTeardown
    didTeardown = true
    teardownLock.unlock()

    guard shouldTeardown else { return }
    fetchSession.invalidate()
  }

  deinit {
    teardown()
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
    context.evaluateScript(
      """
      this.fetch = function(input, options) {
        return new Promise(function(resolve, reject) {
          __saizenNativeFetch(input, options || {}, resolve, reject);
        });
      };
      this.console = this.console || {
        log: function() {},
        warn: function() {},
        error: function() {}
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

    return request
  }

  private func makeFetchResponse(data: Data, response: HTTPURLResponse) -> JSValue {
    let body = String(data: data, encoding: .utf8) ?? ""
    let headers = response.allHeaderFields.reduce(into: [String: String]()) { result, item in
      result["\(item.key)".lowercased()] = "\(item.value)"
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

  private static func arrayOfDictionaries(from value: Any) throws -> [[String: Any]] {
    guard let array = value as? [Any] else { throw ModuleRuntimeError.invalidReturn }
    return try array.map {
      guard let dictionary = dictionary(from: $0) else { throw ModuleRuntimeError.invalidReturn }
      return dictionary
    }
  }

  private static func dictionary(from value: Any?) -> [String: Any]? {
    if let dictionary = value as? [String: Any] { return dictionary }
    if let dictionary = value as? NSDictionary { return dictionary as? [String: Any] }
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
