import AVFoundation
import CoreMedia
import Foundation
import Network
import UniformTypeIdentifiers
import UserNotifications
import UIKit

public struct SaizenDownloadSettings: Codable {
  public var maxParallelDownloads: Int
  public var wifiOnly: Bool
  public var preferredQuality: String
  public var torrentPersist: Bool
  public var torrentStreamedDownload: Bool
  public var torrentSpeed: Int
  public var maxConns: Int

  public static let `default` = SaizenDownloadSettings(
    maxParallelDownloads: 2,
    wifiOnly: true,
    preferredQuality: "1080p",
    torrentPersist: false,
    torrentStreamedDownload: false,
    torrentSpeed: 0,
    maxConns: 100
  )
}

public struct SaizenDownloadRecord: Codable {
  public var id: String
  public var mediaId: Int
  public var episode: Int
  public var seriesTitle: String
  public var episodeTitle: String?
  public var poster: String?
  public var resolution: String?
  public var sourceLabel: String?
  public var seasonLabel: String
  public var source: String
  public var kind: String
  public var status: String
  public var progress: Double
  public var size: Int64
  public var downloaded: Int64
  public var speed: Int64
  public var error: String?
  public var hash: String
  public var name: String
  public var relativePath: String?
  public var date: TimeInterval
  public var files: Int
  /// Queued while Incognito Mode was on. Same download folder; filtered in UI when Incognito is off.
  public var isIncognito: Bool?
  /// Adult Mode / NSFW module download — filtered in UI when Adult Mode is off.
  public var isAdult: Bool?
  /// HTTP headers for http/hls CDN downloads (Referer, User-Agent, etc.).
  public var headers: [String: String]?
}

private struct SaizenDownloadManifest: Codable {
  var settings: SaizenDownloadSettings
  var jobs: [SaizenDownloadRecord]
  var bookmark: Data?
  var folderDisplayPath: String?
}

public final class DownloadCoordinator: NSObject, URLSessionDownloadDelegate, AVAssetDownloadDelegate, UIDocumentPickerDelegate {
  public static let shared = DownloadCoordinator()

  private let lock = NSLock()
  private var manifest: SaizenDownloadManifest
  private var engines: [String: LibtorrentEngine] = [:]
  private var httpTasks: [Int: String] = [:]
  private var httpTaskByJobId: [String: URLSessionDownloadTask] = [:]
  private var hlsTasks: [Int: String] = [:]
  private var hlsTaskByJobId: [String: AVAssetDownloadTask] = [:]
  private var cancelFlags: Set<String> = []
  private var pausedFlags: Set<String> = []
  private var runningIds: Set<String> = []
  private var scopedRoot: URL?
  private var pathMonitor: NWPathMonitor?
  private var wifiAvailable = true
  private var bgSession: URLSession!
  private var assetSession: AVAssetDownloadURLSession!
  private var bgCompletion: (() -> Void)?
  private var audioPlayer: AVAudioPlayer?
  private var libraryServer: HTTPRangeServer?
  private var libraryStore: PieceStore?
  private var folderPickContinuation: CheckedContinuation<URL, Error>?
  private var lastNotifAt = Date.distantPast
  private var lastNotifBody = ""
  private var lastEmitAt = Date.distantPast
  private var pendingEmitWorkItem: DispatchWorkItem?
  private var speedSamples: [String: (bytes: Int64, at: Date)] = [:]
  private let emitInterval: TimeInterval = 2.0

  public var onJobsUpdated: (([[String: Any]]) -> Void)?

  private override init() {
    manifest = SaizenDownloadManifest(settings: .default, jobs: [])
    super.init()
    loadManifest()
    restoreBookmark()
    sweepOrphanWorkDirs()
    let cfg = URLSessionConfiguration.background(withIdentifier: "app.saizen.downloads")
    cfg.sessionSendsLaunchEvents = true
    cfg.isDiscretionary = false
    cfg.allowsCellularAccess = !manifest.settings.wifiOnly
    bgSession = URLSession(configuration: cfg, delegate: self, delegateQueue: nil)
    let assetCfg = URLSessionConfiguration.background(withIdentifier: "app.saizen.hls-downloads")
    assetCfg.sessionSendsLaunchEvents = true
    assetCfg.isDiscretionary = false
    assetCfg.allowsCellularAccess = !manifest.settings.wifiOnly
    // Keep HLS callbacks off the main thread so Cap/UI aren't starved by segment ticks.
    let hlsQueue = OperationQueue()
    hlsQueue.name = "app.saizen.hls-downloads"
    hlsQueue.qualityOfService = .utility
    hlsQueue.maxConcurrentOperationCount = 1
    assetSession = AVAssetDownloadURLSession(
      configuration: assetCfg,
      assetDownloadDelegate: self,
      delegateQueue: hlsQueue
    )
    startPathMonitor()
    purgeFailedJobs()
    purgeOrphanLibraryFiles()
    pumpQueue()
  }

  public func handleBackgroundSession(identifier _: String, completionHandler: @escaping () -> Void) {
    bgCompletion = completionHandler
  }

  // MARK: - Settings / folder

  public func currentSettings() -> SaizenDownloadSettings {
    lock.lock(); defer { lock.unlock() }
    return manifest.settings
  }

  public func updateSettings(_ patch: [String: Any]) {
    lock.lock()
    if let n = patch["maxParallelDownloads"] as? Int {
      manifest.settings.maxParallelDownloads = min(3, max(1, n))
    }
    if let n = patch["maxParallelDownloads"] as? Double {
      manifest.settings.maxParallelDownloads = min(3, max(1, Int(n)))
    }
    if let v = patch["wifiOnly"] as? Bool {
      manifest.settings.wifiOnly = v
    }
    if let q = patch["preferredQuality"] as? String, !q.isEmpty {
      manifest.settings.preferredQuality = q
    }
    if let v = patch["torrentPersist"] as? Bool { manifest.settings.torrentPersist = v }
    if let v = patch["torrentStreamedDownload"] as? Bool { manifest.settings.torrentStreamedDownload = v }
    if let n = patch["torrentSpeed"] as? Int {
      manifest.settings.torrentSpeed = min(100, max(0, n))
    }
    if let n = patch["torrentSpeed"] as? Double {
      manifest.settings.torrentSpeed = min(100, max(0, Int(n.rounded())))
    }
    if let n = patch["maxConns"] as? Int {
      manifest.settings.maxConns = min(300, max(20, n))
    }
    if let n = patch["maxConns"] as? Double {
      manifest.settings.maxConns = min(300, max(20, Int(n.rounded())))
    }
    let wifiOnly = manifest.settings.wifiOnly
    let speed = manifest.settings.torrentSpeed
    let conns = manifest.settings.maxConns
    let running = Array(engines.values)
    lock.unlock()
    bgSession.configuration.allowsCellularAccess = !wifiOnly
    assetSession.configuration.allowsCellularAccess = !wifiOnly
    persist()
    for engine in running {
      engine.applyTransferLimits(downloadMbps: speed, maxConns: conns)
    }
    SaizenPlayback.engine.applyTransferLimits()
    pumpQueue()
  }

  public func folderPath() -> String {
    lock.lock(); defer { lock.unlock() }
    return manifest.folderDisplayPath ?? SaizenStorage.defaultDownloadsDir.path
  }

  public func pickFolder(from presenter: UIViewController) async throws -> String {
    let url: URL = try await withCheckedThrowingContinuation { cont in
      DispatchQueue.main.async {
        self.folderPickContinuation = cont
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder], asCopy: false)
        picker.delegate = self
        picker.allowsMultipleSelection = false
        presenter.present(picker, animated: true)
      }
    }
    try setFolder(url)
    return folderPath()
  }

  public func resetFolder() throws -> String {
    lock.lock()
    manifest.bookmark = nil
    manifest.folderDisplayPath = SaizenStorage.defaultDownloadsDir.path
    lock.unlock()
    scopedRoot?.stopAccessingSecurityScopedResource()
    scopedRoot = nil
    persist()
    return folderPath()
  }

  public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    guard let url = urls.first else {
      folderPickContinuation?.resume(throwing: NSError(
        domain: "SaizenDownloads",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "No folder was selected"]
      ))
      folderPickContinuation = nil
      return
    }
    folderPickContinuation?.resume(returning: url)
    folderPickContinuation = nil
  }

  public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    folderPickContinuation?.resume(throwing: NSError(
      domain: "SaizenDownloads",
      code: 1,
      userInfo: [NSLocalizedDescriptionKey: "Folder picker cancelled"]
    ))
    folderPickContinuation = nil
  }

  // MARK: - Queue

  public func enqueue(options: [String: Any]) throws -> String {
    let source = (options["source"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !source.isEmpty else {
      throw NSError(domain: "SaizenDownloads", code: 2, userInfo: [NSLocalizedDescriptionKey: "Missing source"])
    }
    let mediaId = intVal(options["mediaId"])
    let episode = intVal(options["episode"])
    let seriesTitle = Self.sanitize((options["seriesTitle"] as? String) ?? "Anime")
    let rawSeason = (options["seasonLabel"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let seasonLabel = rawSeason.isEmpty ? "Season 1" : Self.sanitize(rawSeason)
    let id = UUID().uuidString
    let kind = Self.resolveKind(source: source, explicit: options["kind"] as? String)
    let headers = Self.parseHeaders(options["headers"])
    let record = SaizenDownloadRecord(
      id: id,
      mediaId: mediaId,
      episode: episode,
      seriesTitle: seriesTitle,
      episodeTitle: options["episodeTitle"] as? String,
      poster: options["poster"] as? String,
      resolution: options["resolution"] as? String,
      sourceLabel: options["sourceLabel"] as? String,
      seasonLabel: seasonLabel,
      source: source,
      kind: kind,
      status: "queued",
      progress: 0,
      size: 0,
      downloaded: 0,
      speed: 0,
      error: nil,
      hash: "",
      name: options["sourceLabel"] as? String ?? source,
      relativePath: nil,
      date: Date().timeIntervalSince1970,
      files: 1,
      isIncognito: (options["isIncognito"] as? Bool) ?? false,
      isAdult: (options["isAdult"] as? Bool) ?? false,
      headers: headers.isEmpty ? nil : headers
    )
    lock.lock()
    manifest.jobs.append(record)
    lock.unlock()
    persist()
    emit()
    requestNotificationPermission()
    pumpQueue()
    return id
  }

  public func queueSnapshot() -> [[String: Any]] {
    lock.lock()
    let jobs = manifest.jobs
    lock.unlock()
    return jobs.map { $0.asDict() }
  }

  public func librarySnapshot() -> [[String: Any]] {
    lock.lock()
    let jobs = manifest.jobs.filter { $0.status == "completed" }
    lock.unlock()
    return jobs.map { $0.asLibraryDict() }
  }

  public func pause(id: String) {
    lock.lock()
    pausedFlags.insert(id)
    if let idx = manifest.jobs.firstIndex(where: { $0.id == id }),
       manifest.jobs[idx].status == "downloading" || manifest.jobs[idx].status == "queued"
    {
      manifest.jobs[idx].status = "paused"
      manifest.jobs[idx].speed = 0
    }
    let httpTask = httpTaskByJobId[id]
    let hlsTask = hlsTaskByJobId[id]
    lock.unlock()
    // Torrent loop polls pausedFlags; HTTP/HLS must actually stop transferring.
    httpTask?.suspend()
    hlsTask?.suspend()
    persist()
    emit()
    updateKeepAlive()
  }

  public func resume(id: String) {
    lock.lock()
    pausedFlags.remove(id)
    cancelFlags.remove(id)
    let httpTask = httpTaskByJobId[id]
    let hlsTask = hlsTaskByJobId[id]
    let hasLiveTask = httpTask != nil || hlsTask != nil
    if let idx = manifest.jobs.firstIndex(where: { $0.id == id }),
       manifest.jobs[idx].status == "paused" || manifest.jobs[idx].status == "failed"
    {
      if hasLiveTask {
        manifest.jobs[idx].status = "downloading"
        runningIds.insert(id)
      } else {
        manifest.jobs[idx].status = "queued"
      }
      manifest.jobs[idx].error = nil
    }
    lock.unlock()
    persist()
    emit()
    if hasLiveTask {
      httpTask?.resume()
      hlsTask?.resume()
      updateKeepAlive()
    } else {
      pumpQueue()
    }
  }

  public func cancel(id: String) {
    lock.lock()
    cancelFlags.insert(id)
    pausedFlags.remove(id)
    runningIds.remove(id)
    manifest.jobs.removeAll { $0.id == id && $0.status != "completed" }
    let engine = engines[id]
    engines[id] = nil
    let httpTask = httpTaskByJobId[id]
    httpTaskByJobId[id] = nil
    if let httpTask {
      httpTasks[httpTask.taskIdentifier] = nil
    }
    let hlsTask = hlsTaskByJobId[id]
    hlsTaskByJobId[id] = nil
    if let hlsTask {
      hlsTasks[hlsTask.taskIdentifier] = nil
    }
    lock.unlock()
    httpTask?.cancel()
    hlsTask?.cancel()
    engine?.shutdownSession()
    clearSpeedSample(id: id)
    removeWorkDir(id: id)
    persist()
    emit()
    pumpQueue()
    updateKeepAlive()
  }

  public func deleteLibrary(ids: [String]?) {
    let wanted = (ids ?? [])
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
    guard !wanted.isEmpty else { return }

    lock.lock()
    let targets = manifest.jobs.filter { wanted.contains($0.id) || wanted.contains($0.hash) }
    manifest.jobs.removeAll { wanted.contains($0.id) || wanted.contains($0.hash) }
    lock.unlock()
    for job in targets {
      if let url = resolvedFileURL(for: job) {
        try? FileManager.default.removeItem(at: url)
        removeEmptyParents(of: url)
      }
      removeWorkDir(id: job.id)
    }
    sweepOrphanWorkDirs()
    persist()
    emit()
  }

  public func storageUsage() -> [String: Any] {
    let cache =
      SaizenStorage.directorySize(SaizenStorage.piecesDir)
      + SaizenStorage.directorySize(SaizenStorage.torrentsDir)
      + SaizenStorage.directorySize(SaizenStorage.cacheDir)
      + SaizenStorage.directorySize(SaizenStorage.downloadsWorkDir)
    let libraryRoot = activeRoot()
    let library = SaizenStorage.directorySize(libraryRoot)
    var free: Int64 = 0
    if let values = try? libraryRoot.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]),
       let bytes = values.volumeAvailableCapacityForImportantUsage
    {
      free = bytes
    }
    return ["libraryBytes": library, "cacheBytes": cache, "freeBytes": free]
  }

  public func clearCache() {
    SaizenStorage.purgePlaybackData()
    purgeFailedJobs()
    purgeOrphanLibraryFiles()
    sweepOrphanWorkDirs()
    lock.lock()
    let active = Set(
      manifest.jobs
        .filter { $0.status == "downloading" || $0.status == "queued" || $0.status == "paused" }
        .map(\.id)
    )
    lock.unlock()
    if active.isEmpty {
      try? FileManager.default.removeItem(at: SaizenStorage.downloadsWorkDir)
      try? FileManager.default.createDirectory(at: SaizenStorage.downloadsWorkDir, withIntermediateDirectories: true)
    }
  }

  public func playLibraryItem(id: String, spawn: @escaping (URL, String, SaizenDownloadRecord) -> Void) throws {
    lock.lock()
    let job = manifest.jobs.first { $0.id == id && $0.status == "completed" }
    lock.unlock()
    guard let job, let fileURL = resolvedFileURL(for: job) else {
      throw NSError(domain: "SaizenDownloads", code: 4, userInfo: [NSLocalizedDescriptionKey: "Download not found"])
    }
    // Offline HLS asset (.movpkg) — play local file URL with AVPlayer (no Range server).
    if job.kind == "hls" || fileURL.pathExtension.lowercased() == "movpkg" {
      spawn(fileURL, "avplayer", job)
      return
    }
    libraryServer?.stop()
    let store = try PieceStore.openComplete(url: fileURL)
    libraryStore = store
    let server = HTTPRangeServer()
    libraryServer = server
    let type = fileURL.pathExtension.lowercased() == "mp4" ? "video/mp4" : "video/x-matroska"
    try server.start(store: store, contentType: type)
    guard let stream = server.streamURL() else {
      throw NSError(domain: "SaizenDownloads", code: 5, userInfo: [NSLocalizedDescriptionKey: "No stream URL"])
    }
    let hint = fileURL.pathExtension.lowercased() == "mp4" ? "avplayer" : "vlc"
    spawn(stream, hint, job)
  }

  // MARK: - Internals

  private func pumpQueue() {
    lock.lock()
    let maxParallel = manifest.settings.maxParallelDownloads
    let wifiOnly = manifest.settings.wifiOnly
    let blocked = wifiOnly && !wifiAvailable
    let queued = manifest.jobs.filter { $0.status == "queued" || ($0.status == "downloading" && !runningIds.contains($0.id)) }
    let active = runningIds.count
    lock.unlock()

    if blocked {
      updateNotificationSummary()
      return
    }

    let slots = max(0, maxParallel - active)
    for job in queued.prefix(slots) {
      startJob(job)
    }
    updateKeepAlive()
    updateNotificationSummary()
  }

  private func startJob(_ job: SaizenDownloadRecord) {
    lock.lock()
    guard !runningIds.contains(job.id) else {
      lock.unlock()
      return
    }
    runningIds.insert(job.id)
    cancelFlags.remove(job.id)
    if let idx = manifest.jobs.firstIndex(where: { $0.id == job.id }) {
      manifest.jobs[idx].status = "downloading"
    }
    lock.unlock()
    persist()
    emit()

    switch job.kind {
    case "http":
      startHttp(job)
    case "hls":
      startHls(job)
    default:
      startTorrent(job)
    }
  }

  private func startHttp(_ job: SaizenDownloadRecord) {
    guard let url = URL(string: job.source),
          let scheme = url.scheme?.lowercased(),
          scheme == "http" || scheme == "https",
          url.host != nil
    else {
      fail(id: job.id, message: "Invalid HTTP(S) URL")
      return
    }
    var request = URLRequest(url: url)
    if let headers = job.headers {
      for (key, value) in headers {
        request.setValue(value, forHTTPHeaderField: key)
      }
    }
    let task = bgSession.downloadTask(with: request)
    lock.lock()
    httpTasks[task.taskIdentifier] = job.id
    httpTaskByJobId[job.id] = task
    lock.unlock()
    task.taskDescription = job.id
    task.resume()
  }

  private func startHls(_ job: SaizenDownloadRecord) {
    guard let url = URL(string: job.source),
          let scheme = url.scheme?.lowercased(),
          scheme == "http" || scheme == "https",
          url.host != nil
    else {
      fail(id: job.id, message: "Invalid HLS URL")
      return
    }
    var assetOptions: [String: Any] = [:]
    if let headers = job.headers, !headers.isEmpty {
      assetOptions["AVURLAssetHTTPHeaderFieldsKey"] = headers
    }
    let asset = AVURLAsset(url: url, options: assetOptions.isEmpty ? nil : assetOptions)
    let title = job.sourceLabel ?? "\(job.seriesTitle) Ep \(job.episode)"
    guard let task = assetSession.makeAssetDownloadTask(
      asset: asset,
      assetTitle: Self.sanitize(title),
      assetArtworkData: nil,
      options: nil
    ) else {
      fail(id: job.id, message: "HLS offline download is not available on this device")
      return
    }
    lock.lock()
    hlsTasks[task.taskIdentifier] = job.id
    hlsTaskByJobId[job.id] = task
    lock.unlock()
    task.taskDescription = job.id
    task.resume()
  }

  private func startTorrent(_ job: SaizenDownloadRecord) {
    let engine = LibtorrentEngine()
    lock.lock()
    engines[job.id] = engine
    lock.unlock()
    let jobDir = SaizenStorage.downloadsWorkDir.appendingPathComponent(job.id, isDirectory: true)
    let workDir = jobDir.appendingPathComponent("lt", isDirectory: true)
    let partial = jobDir.appendingPathComponent("download.part")
    Task {
      do {
        let result = try await engine.downloadFullFile(
          source: job.source,
          workDir: workDir,
          partialURL: partial,
          shouldCancel: { [weak self] in
            guard let self else { return true }
            self.lock.lock(); defer { self.lock.unlock() }
            return self.cancelFlags.contains(job.id)
          },
          isPaused: { [weak self] in
            guard let self else { return true }
            self.lock.lock(); defer { self.lock.unlock() }
            return self.pausedFlags.contains(job.id)
          },
          onProgress: { [weak self] progress, downloaded, total, speed in
            self?.updateProgress(id: job.id, progress: progress, downloaded: downloaded, total: total, speed: speed)
          }
        )
        try finalizeFile(jobId: job.id, from: partial, originalName: result.fileName, size: result.fileSize, hash: result.hash)
      } catch is CancellationError {
        self.finishCancelled(id: job.id)
      } catch {
        self.fail(id: job.id, message: error.localizedDescription)
      }
    }
  }

  public func urlSession(
    _ session: URLSession,
    downloadTask: URLSessionDownloadTask,
    didWriteData bytesWritten: Int64,
    totalBytesWritten: Int64,
    totalBytesExpectedToWrite: Int64
  ) {
    lock.lock()
    let id = httpTasks[downloadTask.taskIdentifier] ?? downloadTask.taskDescription
    lock.unlock()
    guard let id else { return }
    let total = totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : 0
    let progress = total > 0 ? Double(totalBytesWritten) / Double(total) : 0
    let speed = measuredSpeed(id: id, downloaded: totalBytesWritten)
    updateProgress(id: id, progress: progress, downloaded: totalBytesWritten, total: total, speed: speed)
  }

  public func urlSession(
    _ session: URLSession,
    downloadTask: URLSessionDownloadTask,
    didFinishDownloadingTo location: URL
  ) {
    lock.lock()
    let id = httpTasks[downloadTask.taskIdentifier] ?? downloadTask.taskDescription
    httpTasks[downloadTask.taskIdentifier] = nil
    if let id { httpTaskByJobId[id] = nil }
    lock.unlock()
    guard let id else { return }
    lock.lock()
    let wasCancelled = cancelFlags.contains(id)
    lock.unlock()
    if wasCancelled {
      finishCancelled(id: id)
      return
    }
    let suggested =
      downloadTask.response?.suggestedFilename
      ?? downloadTask.originalRequest?.url?.lastPathComponent
      ?? "episode.bin"
    let size = (try? FileManager.default.attributesOfItem(atPath: location.path)[.size] as? NSNumber)?.int64Value ?? 0
    do {
      try finalizeFile(jobId: id, from: location, originalName: suggested, size: size, hash: id)
    } catch {
      fail(id: id, message: error.localizedDescription)
    }
  }

  public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    if let error, (error as NSError).code != NSURLErrorCancelled {
      lock.lock()
      let id =
        httpTasks[task.taskIdentifier]
        ?? hlsTasks[task.taskIdentifier]
        ?? task.taskDescription
      if task is URLSessionDownloadTask {
        httpTasks[task.taskIdentifier] = nil
        if let id { httpTaskByJobId[id] = nil }
      }
      if task is AVAssetDownloadTask {
        hlsTasks[task.taskIdentifier] = nil
        if let id { hlsTaskByJobId[id] = nil }
      }
      lock.unlock()
      if let id { fail(id: id, message: error.localizedDescription) }
    } else {
      // Cancelled (pause→cancel or explicit cancel): clear maps; don't fail the job.
      lock.lock()
      let id =
        httpTasks[task.taskIdentifier]
        ?? hlsTasks[task.taskIdentifier]
        ?? task.taskDescription
      if task is URLSessionDownloadTask {
        httpTasks[task.taskIdentifier] = nil
        if let id { httpTaskByJobId[id] = nil }
      }
      if task is AVAssetDownloadTask {
        hlsTasks[task.taskIdentifier] = nil
        if let id { hlsTaskByJobId[id] = nil }
      }
      let cancelled = id.map { cancelFlags.contains($0) } ?? false
      lock.unlock()
      if cancelled, let id {
        finishCancelled(id: id)
      }
    }
    bgCompletion?()
    bgCompletion = nil
  }

  // MARK: - AVAssetDownloadDelegate (HLS)

  public func urlSession(
    _ session: URLSession,
    assetDownloadTask: AVAssetDownloadTask,
    didLoad timeRange: CMTimeRange,
    totalTimeRangesLoaded loadedTimeRanges: [NSValue],
    timeRangeExpectedToLoad: CMTimeRange
  ) {
    lock.lock()
    let id = hlsTasks[assetDownloadTask.taskIdentifier] ?? assetDownloadTask.taskDescription
    lock.unlock()
    guard let id else { return }
    var loaded: Double = 0
    for value in loadedTimeRanges {
      loaded += value.timeRangeValue.duration.seconds
    }
    let expected = timeRangeExpectedToLoad.duration.seconds
    let progress = expected > 0 ? min(1, loaded / expected) : 0
    // HLS offline packs have no reliable byte totals — progress fraction only.
    updateProgress(
      id: id,
      progress: progress,
      downloaded: 0,
      total: 0,
      speed: 0
    )
  }

  public func urlSession(
    _ session: URLSession,
    assetDownloadTask: AVAssetDownloadTask,
    didFinishDownloadingTo location: URL
  ) {
    lock.lock()
    let id = hlsTasks[assetDownloadTask.taskIdentifier] ?? assetDownloadTask.taskDescription
    hlsTasks[assetDownloadTask.taskIdentifier] = nil
    if let id { hlsTaskByJobId[id] = nil }
    lock.unlock()
    guard let id else { return }
    var name = location.lastPathComponent
    if name.isEmpty { name = "episode.movpkg" }
    if !name.lowercased().hasSuffix(".movpkg"), location.hasDirectoryPath {
      name = (name as NSString).appendingPathExtension("movpkg") ?? "episode.movpkg"
    }
    let size = SaizenStorage.directorySize(location)
    do {
      try finalizeFile(jobId: id, from: location, originalName: name, size: size, hash: id)
    } catch {
      fail(id: id, message: error.localizedDescription)
    }
  }

  private func finalizeFile(jobId: String, from src: URL, originalName: String, size: Int64, hash: String) throws {
    lock.lock()
    guard let idx = manifest.jobs.firstIndex(where: { $0.id == jobId }) else {
      lock.unlock()
      return
    }
    let job = manifest.jobs[idx]
    lock.unlock()

    let root = try accessingRoot().standardizedFileURL
    let showDir = root
      .appendingPathComponent(Self.sanitize(job.seriesTitle), isDirectory: true)
      .appendingPathComponent(Self.sanitize(job.seasonLabel), isDirectory: true)
      .standardizedFileURL
    guard Self.isContained(showDir, in: root) else {
      throw NSError(
        domain: "SaizenDownloads",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Invalid download path"]
      )
    }
    try FileManager.default.createDirectory(at: showDir, withIntermediateDirectories: true)
    let destName = Self.sanitizeFileName(originalName)
    var dest = showDir.appendingPathComponent(destName).standardizedFileURL
    if FileManager.default.fileExists(atPath: dest.path) {
      dest = showDir.appendingPathComponent("\(job.episode)-\(destName)").standardizedFileURL
    }
    guard Self.isContained(dest, in: root) else {
      throw NSError(
        domain: "SaizenDownloads",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Invalid download path"]
      )
    }
    if FileManager.default.fileExists(atPath: dest.path) {
      try FileManager.default.removeItem(at: dest)
    }
    lock.lock()
    let engine = engines[jobId]
    engines[jobId] = nil
    hlsTaskByJobId[jobId] = nil
    runningIds.remove(jobId)
    lock.unlock()
    engine?.shutdownSession()

    try FileManager.default.moveItem(at: src, to: dest)
    guard let rel = Self.relativePath(of: dest, under: root) else {
      throw NSError(
        domain: "SaizenDownloads",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Invalid download path"]
      )
    }
    removeWorkDir(id: jobId)

    lock.lock()
    if let idx = manifest.jobs.firstIndex(where: { $0.id == jobId }) {
      manifest.jobs[idx].status = "completed"
      manifest.jobs[idx].progress = 1
      manifest.jobs[idx].size = size
      manifest.jobs[idx].downloaded = size
      manifest.jobs[idx].speed = 0
      manifest.jobs[idx].hash = hash
      manifest.jobs[idx].name = destName
      manifest.jobs[idx].relativePath = rel
      manifest.jobs[idx].date = Date().timeIntervalSince1970
    }
    lock.unlock()
    clearSpeedSample(id: jobId)
    persist()
    emit()
    pumpQueue()
    updateKeepAlive()
    notifyCompleted(title: job.seriesTitle, episode: job.episode)
  }

  private func updateProgress(id: String, progress: Double, downloaded: Int64, total: Int64, speed: Int64) {
    lock.lock()
    if let idx = manifest.jobs.firstIndex(where: { $0.id == id }) {
      if manifest.jobs[idx].status == "paused" {
        lock.unlock()
        return
      }
      manifest.jobs[idx].progress = progress
      if downloaded > 0 || manifest.jobs[idx].kind != "hls" {
        manifest.jobs[idx].downloaded = downloaded
      }
      if total > 0 { manifest.jobs[idx].size = total }
      manifest.jobs[idx].speed = speed
      manifest.jobs[idx].status = "downloading"
    }
    lock.unlock()
    emitThrottled()
    updateNotificationSummary(force: false)
  }

  private func measuredSpeed(id: String, downloaded: Int64) -> Int64 {
    let now = Date()
    lock.lock()
    defer { lock.unlock() }
    guard let sample = speedSamples[id] else {
      speedSamples[id] = (downloaded, now)
      return 0
    }
    let dt = now.timeIntervalSince(sample.at)
    guard dt >= 0.25 else { return 0 }
    let delta = downloaded - sample.bytes
    speedSamples[id] = (downloaded, now)
    guard delta > 0 else { return 0 }
    return Int64(Double(delta) / dt)
  }

  private func clearSpeedSample(id: String) {
    lock.lock()
    speedSamples[id] = nil
    lock.unlock()
  }

  private func fail(id: String, message: String) {
    lock.lock()
    if let idx = manifest.jobs.firstIndex(where: { $0.id == id }) {
      manifest.jobs[idx].status = "failed"
      manifest.jobs[idx].error = message
      manifest.jobs[idx].speed = 0
    }
    runningIds.remove(id)
    let engine = engines[id]
    engines[id] = nil
    let httpTask = httpTaskByJobId[id]
    httpTaskByJobId[id] = nil
    if let httpTask { httpTasks[httpTask.taskIdentifier] = nil }
    let hlsTask = hlsTaskByJobId[id]
    hlsTaskByJobId[id] = nil
    if let hlsTask { hlsTasks[hlsTask.taskIdentifier] = nil }
    lock.unlock()
    httpTask?.cancel()
    hlsTask?.cancel()
    engine?.shutdownSession()
    clearSpeedSample(id: id)
    removeWorkDir(id: id)
    persist()
    emit()
    pumpQueue()
    updateKeepAlive()
  }

  private func finishCancelled(id: String) {
    lock.lock()
    runningIds.remove(id)
    cancelFlags.remove(id)
    let engine = engines[id]
    engines[id] = nil
    httpTaskByJobId[id] = nil
    hlsTaskByJobId[id] = nil
    lock.unlock()
    engine?.shutdownSession()
    clearSpeedSample(id: id)
    removeWorkDir(id: id)
    updateKeepAlive()
    pumpQueue()
  }

  private func removeWorkDir(id: String) {
    let dir = SaizenStorage.downloadsWorkDir.appendingPathComponent(id, isDirectory: true)
    try? FileManager.default.removeItem(at: dir)
  }

  /// Drop failed queue rows and scrub partial work dirs.
  private func purgeFailedJobs() {
    lock.lock()
    let failed = manifest.jobs.filter { $0.status == "failed" }.map(\.id)
    manifest.jobs.removeAll { $0.status == "failed" }
    lock.unlock()
    for id in failed {
      removeWorkDir(id: id)
    }
    if !failed.isEmpty {
      persist()
      emit()
    }
  }

  /// Remove on-disk episodes not referenced by completed manifest rows (partial HLS / stale saves).
  private func purgeOrphanLibraryFiles() {
    lock.lock()
    let referenced = Set(
      manifest.jobs
        .filter { $0.status == "completed" }
        .compactMap { $0.relativePath?.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
    )
    let activeHls = manifest.jobs.contains {
      $0.kind == "hls" && ($0.status == "downloading" || $0.status == "queued" || $0.status == "paused")
    }
    lock.unlock()

    let root = activeRoot()
    guard let enumerator = FileManager.default.enumerator(
      at: root,
      includingPropertiesForKeys: [.isDirectoryKey],
      options: [.skipsHiddenFiles]
    ) else { return }

    var removed = 0
    for case let url as URL in enumerator {
      let ext = url.pathExtension.lowercased()
      guard ext == "movpkg" || ext == "mp4" || ext == "mkv" else { continue }
      let rel = Self.relativePath(of: url, under: root)
      if let rel, referenced.contains(rel) { continue }
      try? FileManager.default.removeItem(at: url)
      removed += 1
    }

    if removed > 0 {
      NSLog("[Saizen][dl] purged %d orphan library file(s)", removed)
    }

    if !activeHls {
      purgeManagedAssetOrphans()
    }
  }

  /// AVFoundation HLS offline packs when cancelled before finalize — iOS may still count them toward app size.
  private func purgeManagedAssetOrphans() {
    guard let library = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first else {
      return
    }
    let managed = library.appendingPathComponent("com.apple.UserManagedAssets", isDirectory: true)
    guard FileManager.default.fileExists(atPath: managed.path),
          let items = try? FileManager.default.contentsOfDirectory(
            at: managed,
            includingPropertiesForKeys: nil
          )
    else { return }
    var removed = 0
    for item in items {
      try? FileManager.default.removeItem(at: item)
      removed += 1
    }
    if removed > 0 {
      NSLog("[Saizen][dl] purged %d managed HLS asset(s)", removed)
    }
  }

  private func sweepOrphanWorkDirs() {
    lock.lock()
    let keep = Set(
      manifest.jobs
        .filter { $0.status == "downloading" || $0.status == "queued" || $0.status == "paused" }
        .map(\.id)
    )
    lock.unlock()
    let root = SaizenStorage.downloadsWorkDir
    guard let items = try? FileManager.default.contentsOfDirectory(
      at: root,
      includingPropertiesForKeys: nil
    ) else { return }
    for item in items where !keep.contains(item.lastPathComponent) {
      try? FileManager.default.removeItem(at: item)
    }
  }

  private func removeEmptyParents(of file: URL) {
    let fm = FileManager.default
    var dir = file.deletingLastPathComponent()
    for _ in 0..<2 {
      guard let children = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil),
            children.isEmpty
      else { return }
      try? fm.removeItem(at: dir)
      dir = dir.deletingLastPathComponent()
    }
  }

  private func emit() {
    pendingEmitWorkItem?.cancel()
    pendingEmitWorkItem = nil
    lastEmitAt = Date()
    let snap = queueSnapshot()
    DispatchQueue.main.async { self.onJobsUpdated?(snap) }
  }

  /// Coalesce high-frequency HTTP/HLS progress ticks so Cap bridge / WebView don't flood.
  private func emitThrottled() {
    let elapsed = Date().timeIntervalSince(lastEmitAt)
    if elapsed >= emitInterval {
      emit()
      return
    }
    pendingEmitWorkItem?.cancel()
    let delay = max(0.05, emitInterval - elapsed)
    let work = DispatchWorkItem { [weak self] in
      self?.emit()
    }
    pendingEmitWorkItem = work
    DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
  }

  private func persist() {
    lock.lock()
    let data: Data
    do {
      data = try JSONEncoder().encode(manifest)
    } catch {
      lock.unlock()
      return
    }
    lock.unlock()
    try? FileManager.default.createDirectory(at: SaizenStorage.libraryDir, withIntermediateDirectories: true)
    try? data.write(to: SaizenStorage.manifestURL, options: .atomic)
  }

  private func loadManifest() {
    guard let data = try? Data(contentsOf: SaizenStorage.manifestURL),
          let decoded = try? JSONDecoder().decode(SaizenDownloadManifest.self, from: data)
    else {
      try? FileManager.default.createDirectory(at: SaizenStorage.defaultDownloadsDir, withIntermediateDirectories: true)
      manifest.folderDisplayPath = SaizenStorage.defaultDownloadsDir.path
      return
    }
    manifest = decoded
    for i in manifest.jobs.indices where manifest.jobs[i].status == "downloading" {
      manifest.jobs[i].status = "queued"
      manifest.jobs[i].speed = 0
    }
  }

  private func restoreBookmark() {
    guard let data = manifest.bookmark else { return }
    var stale = false
    // iOS: do not use .withSecurityScope (macOS-only). Document-picker bookmarks
    // restore implicit security scope; then startAccessingSecurityScopedResource().
    guard let url = try? URL(
      resolvingBookmarkData: data,
      options: [],
      relativeTo: nil,
      bookmarkDataIsStale: &stale
    ) else { return }
    _ = url.startAccessingSecurityScopedResource()
    scopedRoot = url
    if stale {
      manifest.bookmark = try? url.bookmarkData(
        options: .minimalBookmark,
        includingResourceValuesForKeys: nil,
        relativeTo: nil
      )
    }
  }

  private func setFolder(_ url: URL) throws {
    let path = url.path
    if path.contains("Mobile Documents") || path.lowercased().contains("icloud") {
      throw NSError(
        domain: "SaizenDownloads",
        code: 6,
        userInfo: [NSLocalizedDescriptionKey: "Choose an On My iPhone folder, not iCloud Drive."]
      )
    }
    scopedRoot?.stopAccessingSecurityScopedResource()
    guard url.startAccessingSecurityScopedResource() else {
      throw NSError(
        domain: "SaizenDownloads",
        code: 7,
        userInfo: [NSLocalizedDescriptionKey: "Could not access the selected folder."]
      )
    }
    scopedRoot = url
    let bookmark = try url.bookmarkData(
      options: .minimalBookmark,
      includingResourceValuesForKeys: nil,
      relativeTo: nil
    )
    lock.lock()
    manifest.bookmark = bookmark
    manifest.folderDisplayPath = path
    lock.unlock()
    persist()
  }

  private func activeRoot() -> URL {
    scopedRoot ?? SaizenStorage.defaultDownloadsDir
  }

  private func accessingRoot() throws -> URL {
    let root = activeRoot()
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    return root
  }

  private func resolvedFileURL(for job: SaizenDownloadRecord) -> URL? {
    guard let rel = job.relativePath?.trimmingCharacters(in: .whitespacesAndNewlines), !rel.isEmpty else {
      return nil
    }
    if rel.hasPrefix("/") || rel.hasPrefix("~") || rel.contains("\0") { return nil }
    let root = activeRoot().standardizedFileURL
    let dest = root.appendingPathComponent(rel).standardizedFileURL
    guard Self.isContained(dest, in: root) else { return nil }
    return dest
  }

  private func startPathMonitor() {
    let monitor = NWPathMonitor()
    pathMonitor = monitor
    monitor.pathUpdateHandler = { [weak self] path in
      self?.wifiAvailable = path.usesInterfaceType(.wifi) || path.usesInterfaceType(.wiredEthernet)
      self?.pumpQueue()
    }
    monitor.start(queue: DispatchQueue.global(qos: .utility))
  }

  private func updateKeepAlive() {
    lock.lock()
    let torrentActive = manifest.jobs.contains { $0.kind == "torrent" && ($0.status == "downloading" || $0.status == "queued") }
    lock.unlock()
    DispatchQueue.main.async {
      if torrentActive {
        self.beginAudioKeepAlive()
      } else {
        self.endAudioKeepAlive()
      }
    }
  }

  private func beginAudioKeepAlive() {
    guard audioPlayer == nil else { return }
    do {
      // mixWithOthers so we don't steal the moviePlayback session from Watch.
      try AVAudioSession.sharedInstance().setCategory(
        .playback,
        mode: .default,
        options: [.mixWithOthers]
      )
      try AVAudioSession.sharedInstance().setActive(true)
      // 1-sample silent WAV
      let wav: [UInt8] = [
        0x52, 0x49, 0x46, 0x46, 0x28, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6D, 0x74, 0x20,
        0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x44, 0xAC, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00,
        0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74, 0x61, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
      ]
      let url = FileManager.default.temporaryDirectory.appendingPathComponent("saizen-keepalive.wav")
      try Data(wav).write(to: url)
      let player = try AVAudioPlayer(contentsOf: url)
      player.numberOfLoops = -1
      player.volume = 0.01
      player.play()
      audioPlayer = player
    } catch {
      NSLog("[Saizen][dl] keep-alive failed: %@", error.localizedDescription)
    }
  }

  private func endAudioKeepAlive() {
    audioPlayer?.stop()
    audioPlayer = nil
    // Never notifyOthersOnDeactivation — that pauses AVPlayer / VLC mid-watch.
  }

  private func requestNotificationPermission() {
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
  }

  private func updateNotificationSummary(force: Bool = true) {
    lock.lock()
    let active = manifest.jobs.filter { $0.status == "downloading" || $0.status == "queued" || $0.status == "paused" }
    let wifiBlocked = manifest.settings.wifiOnly && !wifiAvailable
    lock.unlock()
    guard !active.isEmpty else {
      lastNotifBody = ""
      UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ["saizen.downloads"])
      return
    }
    let downloading = active.filter { $0.status == "downloading" }
    let pct = downloading.first.map { Int(($0.progress * 100).rounded()) } ?? 0
    let body: String
    if wifiBlocked {
      body = "Waiting for Wi‑Fi · \(active.count) queued"
    } else if let first = downloading.first {
      body = "\(first.seriesTitle) · Ep \(first.episode) · \(pct)% · \(active.count) in queue"
    } else {
      body = "\(active.count) download(s) waiting"
    }
    if !force {
      let elapsed = Date().timeIntervalSince(lastNotifAt)
      if body == lastNotifBody { return }
      if elapsed < 8 { return }
    }
    lastNotifAt = Date()
    lastNotifBody = body
    let content = UNMutableNotificationContent()
    content.title = "Saizen downloads"
    content.body = body
    content.sound = nil
    if #available(iOS 15.0, *) {
      content.interruptionLevel = .passive
    }
    let req = UNNotificationRequest(identifier: "saizen.downloads", content: content, trigger: nil)
    UNUserNotificationCenter.current().add(req, withCompletionHandler: nil)
  }

  private func notifyCompleted(title: String, episode: Int) {
    let content = UNMutableNotificationContent()
    content.title = "Download complete"
    content.body = "\(title) · Episode \(episode)"
    let req = UNNotificationRequest(
      identifier: "saizen.downloads.done.\(UUID().uuidString)",
      content: content,
      trigger: nil
    )
    UNUserNotificationCenter.current().add(req, withCompletionHandler: nil)
    updateNotificationSummary()
  }

  private static func sanitize(_ name: String) -> String {
    sanitizePathComponent(name, replaceColon: true, fallback: "Untitled")
  }

  private static func sanitizeFileName(_ name: String) -> String {
    sanitizePathComponent((name as NSString).lastPathComponent, replaceColon: false, fallback: "episode.bin")
  }

  private static func sanitizePathComponent(_ name: String, replaceColon: Bool, fallback: String) -> String {
    var cleaned = name.trimmingCharacters(in: .whitespacesAndNewlines)
      .replacingOccurrences(of: "\0", with: "")
      .replacingOccurrences(of: "/", with: "-")
      .replacingOccurrences(of: "\\", with: "-")
    if replaceColon {
      cleaned = cleaned.replacingOccurrences(of: ":", with: "-")
    }
    cleaned = cleaned.trimmingCharacters(in: .whitespacesAndNewlines)
    if cleaned.isEmpty || cleaned == "." || cleaned == ".." || cleaned.allSatisfy({ $0 == "." }) {
      return fallback
    }
    return cleaned
  }

  private static func isContained(_ url: URL, in root: URL) -> Bool {
    let destPath = url.standardizedFileURL.resolvingSymlinksInPath().path
    let rootPath = root.standardizedFileURL.resolvingSymlinksInPath().path
    let prefix = rootPath.hasSuffix("/") ? rootPath : rootPath + "/"
    return destPath.hasPrefix(prefix)
  }

  private static func relativePath(of url: URL, under root: URL) -> String? {
    let destPath = url.standardizedFileURL.path
    let rootPath = root.standardizedFileURL.path
    let prefix = rootPath.hasSuffix("/") ? rootPath : rootPath + "/"
    guard destPath.hasPrefix(prefix) else { return nil }
    let rel = String(destPath.dropFirst(prefix.count))
    return rel.isEmpty ? nil : rel
  }

  private func intVal(_ raw: Any?) -> Int {
    if let n = raw as? Int { return n }
    if let n = raw as? Double { return Int(n) }
    if let s = raw as? String { return Int(s) ?? 0 }
    return 0
  }

  private static func resolveKind(source: String, explicit: String?) -> String {
    if let explicit {
      let k = explicit.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      if k == "torrent" || k == "http" || k == "hls" { return k }
    }
    if source.hasPrefix("magnet:") || LibtorrentEngine.isTorrentFileURL(source) {
      return "torrent"
    }
    let lower = source.lowercased()
    if lower.contains(".m3u8") { return "hls" }
    return "http"
  }

  private static func parseHeaders(_ raw: Any?) -> [String: String] {
    guard let dict = raw as? [String: Any] else { return [:] }
    var out: [String: String] = [:]
    for (key, value) in dict {
      if let s = value as? String {
        out[key] = s
      } else if let n = value as? NSNumber {
        out[key] = n.stringValue
      }
    }
    return out
  }
}

private extension SaizenDownloadRecord {
  func asDict() -> [String: Any] {
    var d: [String: Any] = [
      "id": id,
      "mediaId": mediaId,
      "episode": episode,
      "seriesTitle": seriesTitle,
      "seasonLabel": seasonLabel,
      "source": source,
      "kind": kind,
      "status": status,
      "progress": progress,
      "size": size,
      "downloaded": downloaded,
      "speed": speed,
      "hash": hash,
      "name": name,
      "date": date,
      "files": files
    ]
    if let episodeTitle { d["episodeTitle"] = episodeTitle }
    if let poster { d["poster"] = poster }
    if let resolution { d["resolution"] = resolution }
    if let sourceLabel { d["sourceLabel"] = sourceLabel }
    if let error { d["error"] = error }
    if let relativePath { d["relativePath"] = relativePath }
    d["isIncognito"] = isIncognito ?? false
    d["isAdult"] = isAdult ?? false
    return d
  }

  func asLibraryDict() -> [String: Any] {
    var d = asDict()
    d["files"] = files
    return d
  }
}
