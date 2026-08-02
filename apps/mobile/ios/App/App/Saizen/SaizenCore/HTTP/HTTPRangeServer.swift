import Foundation
import Network
import Security

/**
 Loopback HTTP server that serves a PieceStore with Range / 206 support.

 Streams the full requested byte range on a single connection (chunked TCP
 writes as torrent pieces arrive). Previously we closed after 512KB, which
 made VLC/avformat re-open from offset 0 and see the MKV header repeating.

 Each session gets a random path token so other local apps cannot scrape
 `http://127.0.0.1:<port>/0/stream` without knowing the URL (S-05).
 */
public final class HTTPRangeServer: @unchecked Sendable {
  public private(set) var port: UInt16 = 0
  public private(set) var baseURL: URL?
  /// Opaque path segment required on every request.
  public private(set) var accessToken: String = ""

  private var listener: NWListener?
  private var store: PieceStore?
  private var contentType: String = "application/octet-stream"
  private let queue = DispatchQueue(label: "app.saizen.http-range", qos: .userInitiated)
  /// Called when a client asks for bytes not yet in the store (so torrent can prioritize).
  public var onNeedRange: ((Range<Int64>) -> Void)?

  private let chunkSize: Int64 = 256 * 1024
  private let idleHeaderTimeout: TimeInterval = 15

  public enum ServerError: Error {
    case alreadyRunning
    case notRunning
    case bindFailed(String)
  }

  public init() {}

  public func start(store: PieceStore, contentType: String = "video/mp4") throws {
    if listener != nil { throw ServerError.alreadyRunning }
    self.store = store
    self.contentType = contentType
    self.accessToken = Self.makeAccessToken()

    let params = NWParameters.tcp
    params.allowLocalEndpointReuse = true
    params.requiredLocalEndpoint = NWEndpoint.hostPort(
      host: NWEndpoint.Host("127.0.0.1"),
      port: NWEndpoint.Port(integerLiteral: 0)
    )

    let listener = try NWListener(using: params)
    self.listener = listener

    let started = DispatchSemaphore(value: 0)
    var startError: Error?

    listener.stateUpdateHandler = { [weak self] state in
      switch state {
      case .ready:
        if let p = listener.port?.rawValue {
          self?.port = p
          self?.baseURL = URL(string: "http://127.0.0.1:\(p)")
        }
        started.signal()
      case .failed(let err):
        startError = err
        started.signal()
      default:
        break
      }
    }

    listener.newConnectionHandler = { [weak self] connection in
      self?.handle(connection: connection)
    }

    listener.start(queue: queue)
    _ = started.wait(timeout: .now() + 3)
    if let startError { throw ServerError.bindFailed(String(describing: startError)) }
    if port == 0 { throw ServerError.bindFailed("no port assigned") }
  }

  public func stop() {
    listener?.cancel()
    listener = nil
    store?.cancelAll()
    store = nil
    onNeedRange = nil
    port = 0
    baseURL = nil
    accessToken = ""
  }

  public func streamURL(fileIndex: Int = 0) -> URL? {
    guard !accessToken.isEmpty else { return nil }
    return baseURL?
      .appendingPathComponent(accessToken)
      .appendingPathComponent("\(fileIndex)")
      .appendingPathComponent("stream")
  }

  /// True if `url` is this server's authenticated loopback stream.
  public func isAuthorizedStreamURL(_ url: URL) -> Bool {
    guard !accessToken.isEmpty, url.scheme == "http", url.host == "127.0.0.1" else { return false }
    let path = url.path
    return path.contains("/\(accessToken)/") && path.hasSuffix("/stream")
  }

  private static func makeAccessToken() -> String {
    var bytes = [UInt8](repeating: 0, count: 16)
    _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
    return bytes.map { String(format: "%02x", $0) }.joined()
  }

  private func handle(connection: NWConnection) {
    connection.start(queue: queue)
    receiveHeader(connection: connection, buffer: Data(), startedAt: Date())
  }

  private func receiveHeader(connection: NWConnection, buffer: Data, startedAt: Date) {
    if Date().timeIntervalSince(startedAt) > idleHeaderTimeout {
      sendHeadersOnly(connection: connection, status: 408, headers: ["Connection": "close"], close: true)
      return
    }
    connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] data, _, isComplete, error in
      guard let self else { return }
      if error != nil || (isComplete && (data == nil || data?.isEmpty == true)) {
        connection.cancel()
        return
      }
      guard let data, !data.isEmpty else {
        if isComplete { connection.cancel() }
        return
      }
      var buf = buffer
      buf.append(data)
      if let range = buf.range(of: Data("\r\n\r\n".utf8)) {
        let headerData = buf.subdata(in: 0 ..< range.lowerBound)
        let header = String(data: headerData, encoding: .utf8) ?? ""
        Task {
          await self.serve(connection: connection, header: header)
        }
      } else if buf.count > 64 * 1024 {
        self.sendHeadersOnly(connection: connection, status: 400, headers: ["Connection": "close"], close: true)
      } else {
        self.receiveHeader(connection: connection, buffer: buf, startedAt: startedAt)
      }
    }
  }

  private func pathHasValidToken(_ path: String) -> Bool {
    guard !accessToken.isEmpty else { return false }
    // Expect /{token}/{fileIndex}/stream
    let parts = path.split(separator: "/").map(String.init)
    guard parts.count >= 3 else { return false }
    return parts[0] == accessToken && parts.last == "stream"
  }

  private func serve(connection: NWConnection, header: String) async {
    guard let store else {
      sendHeadersOnly(
        connection: connection,
        status: 503,
        headers: ["Content-Type": "text/plain", "Connection": "close"],
        close: true
      )
      return
    }

    let lines = header.split(separator: "\r\n", omittingEmptySubsequences: false)
    guard let requestLine = lines.first else {
      sendHeadersOnly(connection: connection, status: 400, headers: ["Connection": "close"], close: true)
      return
    }
    let parts = requestLine.split(separator: " ")
    guard parts.count >= 2 else {
      sendHeadersOnly(connection: connection, status: 400, headers: ["Connection": "close"], close: true)
      return
    }
    let method = String(parts[0]).uppercased()
    // Strip query string if present
    let rawPath = String(parts[1])
    let path = rawPath.split(separator: "?", maxSplits: 1).first.map(String.init) ?? rawPath

    guard pathHasValidToken(path) else {
      sendHeadersOnly(connection: connection, status: 401, headers: ["Connection": "close"], close: true)
      return
    }

    let fileSize = store.fileSize
    // No Access-Control-Allow-Origin — this is for native players, not browsers.
    let baseHeaders: [String: String] = [
      "Content-Type": contentType,
      "Accept-Ranges": "bytes"
    ]

    if method == "HEAD" {
      var headers = baseHeaders
      headers["Content-Length"] = "\(fileSize)"
      headers["Connection"] = "close"
      sendHeadersOnly(connection: connection, status: 200, headers: headers, close: true)
      return
    }

    guard method == "GET" else {
      sendHeadersOnly(connection: connection, status: 405, headers: ["Connection": "close"], close: true)
      return
    }

    var rangeStart: Int64 = 0
    var rangeEnd: Int64 = fileSize - 1
    var isPartial = false

    if let rangeLine = lines.first(where: { $0.lowercased().hasPrefix("range:") }) {
      let value = rangeLine.dropFirst(6).trimmingCharacters(in: .whitespaces)
      if value.hasPrefix("bytes=") {
        let spec = String(value.dropFirst(6))
        // Reject multi-range
        if spec.contains(",") {
          var headers = baseHeaders
          headers["Content-Range"] = "bytes */\(max(fileSize, 0))"
          headers["Connection"] = "close"
          sendHeadersOnly(connection: connection, status: 416, headers: headers, close: true)
          return
        }
        let bounds = spec.split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false)
        if bounds.count == 2 {
          let left = String(bounds[0])
          let right = String(bounds[1])
          if left.isEmpty, let suffix = Int64(right), suffix > 0 {
            // bytes=-N → last N bytes
            rangeStart = max(0, fileSize - suffix)
            rangeEnd = fileSize - 1
            isPartial = true
          } else if let start = Int64(left), start >= 0 {
            rangeStart = start
            isPartial = true
            if !right.isEmpty, let end = Int64(right) {
              rangeEnd = min(end, fileSize - 1)
            } else {
              rangeEnd = fileSize - 1
            }
          }
        }
      }
    }

    if fileSize <= 0 || rangeStart >= fileSize || rangeStart > rangeEnd {
      var headers = baseHeaders
      headers["Content-Range"] = "bytes */\(max(fileSize, 0))"
      headers["Connection"] = "close"
      sendHeadersOnly(connection: connection, status: 416, headers: headers, close: true)
      return
    }

    let totalLength = rangeEnd - rangeStart + 1
    var headers = baseHeaders
    headers["Content-Length"] = "\(totalLength)"
    headers["Connection"] = "close"
    let status: Int
    if isPartial {
      status = 206
      headers["Content-Range"] = "bytes \(rangeStart)-\(rangeEnd)/\(fileSize)"
    } else {
      status = 200
    }

    NSLog(
      "[Saizen][http] %@ %lld-%lld/%lld partial=%@",
      method,
      rangeStart,
      rangeEnd,
      fileSize,
      isPartial ? "yes" : "no"
    )

    let headerSent = await sendHeadersAsync(connection: connection, status: status, headers: headers)
    guard headerSent else {
      connection.cancel()
      return
    }

    var offset = rangeStart
    do {
      while offset <= rangeEnd {
        let end = min(rangeEnd, offset + chunkSize - 1)
        let slice = offset ..< (end + 1)
        if !store.isAvailable(range: slice) {
          let aheadEnd = min(rangeEnd, offset + chunkSize * 32 - 1)
          onNeedRange?(offset ..< (aheadEnd + 1))
        }
        let bytes = try await store.read(range: slice, timeout: 180)
        let ok = await sendBodyAsync(connection: connection, data: bytes)
        guard ok else {
          connection.cancel()
          return
        }
        offset = end + 1
      }
      connection.cancel()
    } catch {
      NSLog("[Saizen][http] stream error @%lld: %@", offset, "\(error)")
      connection.cancel()
    }
  }

  private func sendHeadersOnly(
    connection: NWConnection,
    status: Int,
    headers: [String: String],
    close: Bool
  ) {
    Task {
      _ = await sendHeadersAsync(connection: connection, status: status, headers: headers)
      if close { connection.cancel() }
    }
  }

  private func sendHeadersAsync(
    connection: NWConnection,
    status: Int,
    headers: [String: String]
  ) async -> Bool {
    let reason: String
    switch status {
    case 200: reason = "OK"
    case 206: reason = "Partial Content"
    case 400: reason = "Bad Request"
    case 401: reason = "Unauthorized"
    case 404: reason = "Not Found"
    case 405: reason = "Method Not Allowed"
    case 408: reason = "Request Timeout"
    case 416: reason = "Range Not Satisfiable"
    case 503: reason = "Service Unavailable"
    default: reason = "Error"
    }
    var message = "HTTP/1.1 \(status) \(reason)\r\n"
    for (k, v) in headers {
      message += "\(k): \(v)\r\n"
    }
    message += "\r\n"
    return await sendRawAsync(connection: connection, data: Data(message.utf8))
  }

  private func sendBodyAsync(connection: NWConnection, data: Data) async -> Bool {
    await sendRawAsync(connection: connection, data: data)
  }

  private func sendRawAsync(connection: NWConnection, data: Data) async -> Bool {
    await withCheckedContinuation { cont in
      connection.send(content: data, completion: .contentProcessed { error in
        cont.resume(returning: error == nil)
      })
    }
  }
}
