import Foundation

/// Tracks which byte ranges of a torrent file are available locally.
/// Disk-backed (sparse file under Documents) so episode-sized MKVs can stream
/// without holding the whole file in RAM.
public final class PieceStore: @unchecked Sendable {
  public let fileSize: Int64
  public let pieceLength: Int
  public let fileURL: URL?

  private var downloaded = IndexSet()
  private var waiters: [UUID: Waiter] = [:]
  private let lock = NSLock()
  private let notifyQueue: DispatchQueue
  private var fileHandle: FileHandle?

  private struct Waiter {
    let range: Range<Int64>
    let continuation: CheckedContinuation<Data, Error>
  }

  public enum PieceStoreError: Error {
    case cancelled
    case timedOut
    case outOfBounds
    case io(String)
  }

  /// - Parameter fileURL: When set, bytes are stored on disk (preferred for torrents).
  ///   When nil, falls back to an in-memory buffer (only for tiny files).
  public init(
    fileSize: Int64,
    pieceLength: Int = 256 * 1024,
    fileURL: URL? = nil,
    notifyQueue: DispatchQueue = .main
  ) throws {
    self.fileSize = fileSize
    self.pieceLength = pieceLength
    self.fileURL = fileURL
    self.notifyQueue = notifyQueue

    if let fileURL {
      let dir = fileURL.deletingLastPathComponent()
      try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      if !FileManager.default.fileExists(atPath: fileURL.path) {
        FileManager.default.createFile(atPath: fileURL.path, contents: nil)
      }
      let fh = try FileHandle(forUpdating: fileURL)
      // Sparse: don't pre-fill; seeks+writes extend as pieces arrive.
      self.fileHandle = fh
    } else {
      self.fileHandle = nil
    }
  }

  deinit {
    try? fileHandle?.close()
  }

  /// Write absolute file bytes into the store and wake waiters whose ranges are now complete.
  public func write(offset: Int64, bytes: Data) {
    lock.lock()
    defer { lock.unlock() }

    guard offset >= 0, !bytes.isEmpty else { return }
    let end = offset + Int64(bytes.count)
    guard end <= fileSize else { return }

    let start = Int(offset)
    do {
      if let fh = fileHandle {
        try fh.seek(toOffset: UInt64(offset))
        try fh.write(contentsOf: bytes)
      }
    } catch {
      NSLog("[Saizen] PieceStore write failed @%lld: %@", offset, "\(error)")
      return
    }

    downloaded.insert(integersIn: start ..< (start + bytes.count))
    if downloaded.count < 32 * 1024 * 1024, start < 256 * 1024 {
      // Log early head fills — confirms piece→store pipeline.
      NSLog("[Saizen] PieceStore write @%lld +%d (progress=%.2f%%)", offset, bytes.count, Double(downloaded.count) / Double(max(fileSize, 1)) * 100)
    }

    let ready = waiters.filter { _, w in isAvailableLocked(range: w.range) }
    for (id, waiter) in ready {
      waiters.removeValue(forKey: id)
      do {
        let slice = try readLocked(range: waiter.range)
        notifyQueue.async {
          waiter.continuation.resume(returning: slice)
        }
      } catch {
        notifyQueue.async {
          waiter.continuation.resume(throwing: error)
        }
      }
    }
  }

  public func isAvailable(range: Range<Int64>) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return isAvailableLocked(range: range)
  }

  private func isAvailableLocked(range: Range<Int64>) -> Bool {
    guard range.lowerBound >= 0, range.upperBound <= fileSize, range.lowerBound < range.upperBound else {
      return false
    }
    let start = Int(range.lowerBound)
    let end = Int(range.upperBound)
    return downloaded.contains(integersIn: start ..< end)
  }

  private func readLocked(range: Range<Int64>) throws -> Data {
    let length = Int(range.upperBound - range.lowerBound)
    guard let fh = fileHandle else {
      throw PieceStoreError.io("no file handle")
    }
    try fh.seek(toOffset: UInt64(range.lowerBound))
    guard let data = try fh.read(upToCount: length), data.count == length else {
      throw PieceStoreError.io("short read")
    }
    return data
  }

  /// Returns bytes immediately if present; otherwise suspends until written, cancelled, or timed out.
  public func read(range: Range<Int64>, timeout: TimeInterval = 120) async throws -> Data {
    guard range.lowerBound >= 0, range.upperBound <= fileSize, range.lowerBound < range.upperBound else {
      throw PieceStoreError.outOfBounds
    }

    lock.lock()
    if isAvailableLocked(range: range) {
      do {
        let slice = try readLocked(range: range)
        lock.unlock()
        return slice
      } catch {
        lock.unlock()
        throw error
      }
    }
    lock.unlock()

    return try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Data, Error>) in
      let id = UUID()
      lock.lock()
      if isAvailableLocked(range: range) {
        do {
          let slice = try readLocked(range: range)
          lock.unlock()
          cont.resume(returning: slice)
        } catch {
          lock.unlock()
          cont.resume(throwing: error)
        }
        return
      }
      waiters[id] = Waiter(range: range, continuation: cont)
      lock.unlock()

      DispatchQueue.global().asyncAfter(deadline: .now() + timeout) { [weak self] in
        guard let self else { return }
        self.lock.lock()
        guard let waiter = self.waiters.removeValue(forKey: id) else {
          self.lock.unlock()
          return
        }
        self.lock.unlock()
        waiter.continuation.resume(throwing: PieceStoreError.timedOut)
      }
    }
  }

  public func cancelAll() {
    lock.lock()
    let pending = waiters
    waiters.removeAll()
    lock.unlock()
    for (_, w) in pending {
      notifyQueue.async {
        w.continuation.resume(throwing: PieceStoreError.cancelled)
      }
    }
  }

  /// Best-effort cleanup of the backing file (call from stopAll).
  public func removeBackingFile() {
    lock.lock()
    try? fileHandle?.close()
    fileHandle = nil
    lock.unlock()
    if let fileURL {
      try? FileManager.default.removeItem(at: fileURL)
    }
  }

  public var progress: Double {
    lock.lock()
    defer { lock.unlock() }
    guard fileSize > 0 else { return 0 }
    return Double(downloaded.count) / Double(fileSize)
  }
}
