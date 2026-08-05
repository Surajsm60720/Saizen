import Capacitor
import Foundation
import UIKit

/// Capacitor plugin: playback + download library
@objc(SaizenTorrentPlugin)
public class SaizenTorrentPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "SaizenTorrentPlugin"
  public let jsName = "SaizenTorrent"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "playTorrent", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "torrentInfo", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "checkAvailableSpace", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "enqueueDownload", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "downloadQueue", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "pauseDownload", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "resumeDownload", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "cancelDownload", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "library", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "deleteTorrents", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "cachedTorrents", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "updateSettings", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "storageUsage", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "clearCache", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "pickDownloadFolder", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "resetDownloadFolder", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "downloadFolder", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "playLibraryItem", returnType: CAPPluginReturnPromise)
  ]

  public override func load() {
    SaizenPlayback.purgeIfIdle()
    DownloadCoordinator.shared.onJobsUpdated = { [weak self] jobs in
      self?.notifyListeners("downloadProgress", data: ["jobs": jobs])
    }
  }

  @objc func playTorrent(_ call: CAPPluginCall) {
    guard let source = call.getString("source") else {
      call.reject("Missing source (magnet or http URL)")
      return
    }
    let mediaId = call.getInt("mediaId") ?? 0
    let episode = call.getInt("episode") ?? 1

    let minFree: Int64 = 256 * 1024 * 1024
    if let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first,
       let values = try? docs.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]),
       let free = values.volumeAvailableCapacityForImportantUsage,
       free < minFree {
      call.reject("Not enough free storage to start playback (\(free / (1024 * 1024)) MB left)")
      return
    }

    Task {
      do {
        SaizenPlayback.beginSession()
        let files = try await SaizenPlayback.engine.play(
          source: source,
          mediaId: mediaId,
          episode: episode
        )
        let mapped = files.map {
          [
            "id": $0.id,
            "name": $0.name,
            "hash": $0.hash,
            "size": $0.size,
            "url": $0.url,
            "playerHint": $0.playerHint
          ] as [String: Any]
        }
        call.resolve(["files": mapped])
      } catch {
        SaizenPlayback.stopAndPurge(expecting: nil)
        call.reject(error.localizedDescription)
      }
    }
  }

  @objc func torrentInfo(_ call: CAPPluginCall) {
    let hash = call.getString("hash") ?? ""
    Task {
      let info = await SaizenPlayback.engine.torrentInfo(hash: hash)
      call.resolve(info)
    }
  }

  @objc func stop(_ call: CAPPluginCall) {
    SaizenPlayback.stopAndPurge(expecting: nil)
    call.resolve()
  }

  @objc func checkAvailableSpace(_ call: CAPPluginCall) {
    let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
    if let docs,
       let values = try? docs.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]),
       let free = values.volumeAvailableCapacityForImportantUsage {
      call.resolve(["bytes": free])
    } else {
      call.resolve(["bytes": 0])
    }
  }

  @objc func enqueueDownload(_ call: CAPPluginCall) {
    do {
      let id = try DownloadCoordinator.shared.enqueue(options: Self.optionsDict(call))
      call.resolve(["id": id])
    } catch {
      call.reject(error.localizedDescription)
    }
  }

  @objc func downloadQueue(_ call: CAPPluginCall) {
    call.resolve(["jobs": DownloadCoordinator.shared.queueSnapshot()])
  }

  @objc func pauseDownload(_ call: CAPPluginCall) {
    guard let id = call.getString("id") else {
      call.reject("Missing id")
      return
    }
    DownloadCoordinator.shared.pause(id: id)
    call.resolve()
  }

  @objc func resumeDownload(_ call: CAPPluginCall) {
    guard let id = call.getString("id") else {
      call.reject("Missing id")
      return
    }
    DownloadCoordinator.shared.resume(id: id)
    call.resolve()
  }

  @objc func cancelDownload(_ call: CAPPluginCall) {
    guard let id = call.getString("id") else {
      call.reject("Missing id")
      return
    }
    DownloadCoordinator.shared.cancel(id: id)
    call.resolve()
  }

  @objc func library(_ call: CAPPluginCall) {
    call.resolve(["entries": DownloadCoordinator.shared.librarySnapshot()])
  }

  @objc func deleteTorrents(_ call: CAPPluginCall) {
    let hashes = call.getArray("hashes", String.self) ?? call.getArray("ids", String.self) ?? []
    let ids = hashes.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    guard !ids.isEmpty else {
      call.reject("Missing ids — pass non-empty hashes/ids to delete specific library items")
      return
    }
    DownloadCoordinator.shared.deleteLibrary(ids: ids)
    call.resolve()
  }

  @objc func cachedTorrents(_ call: CAPPluginCall) {
    call.resolve(["hashes": [] as [String]])
  }

  @objc func updateSettings(_ call: CAPPluginCall) {
    DownloadCoordinator.shared.updateSettings(Self.optionsDict(call))
    call.resolve()
  }

  @objc func storageUsage(_ call: CAPPluginCall) {
    call.resolve(DownloadCoordinator.shared.storageUsage())
  }

  @objc func clearCache(_ call: CAPPluginCall) {
    DownloadCoordinator.shared.clearCache()
    call.resolve()
  }

  @objc func downloadFolder(_ call: CAPPluginCall) {
    call.resolve(["path": DownloadCoordinator.shared.folderPath()])
  }

  @objc func resetDownloadFolder(_ call: CAPPluginCall) {
    do {
      let path = try DownloadCoordinator.shared.resetFolder()
      call.resolve(["path": path])
    } catch {
      call.reject(error.localizedDescription)
    }
  }

  @objc func pickDownloadFolder(_ call: CAPPluginCall) {
    guard let vc = bridge?.viewController else {
      call.reject("No view controller")
      return
    }
    Task {
      do {
        let path = try await DownloadCoordinator.shared.pickFolder(from: vc)
        call.resolve(["path": path])
      } catch {
        call.reject(error.localizedDescription)
      }
    }
  }

  @objc func playLibraryItem(_ call: CAPPluginCall) {
    guard let id = call.getString("id") else {
      call.reject("Missing id")
      return
    }
    DispatchQueue.main.async {
      do {
        try DownloadCoordinator.shared.playLibraryItem(id: id) { url, hint, job in
          guard let presenter = self.bridge?.viewController else {
            call.reject("No view controller")
            return
          }
          let title = "\(job.seriesTitle) · Ep \(job.episode)"
          PlayerRouter.present(
            from: presenter,
            url: url,
            hint: PlayerHint(rawValue: hint) ?? .vlc,
            title: title,
            context: PlaybackContext(
              anilistId: job.mediaId,
              episode: job.episode,
              idMal: nil
            ),
            onDismiss: nil
          )
          call.resolve()
        }
      } catch {
        call.reject(error.localizedDescription)
      }
    }
  }

  private static func optionsDict(_ call: CAPPluginCall) -> [String: Any] {
    var d: [String: Any] = [:]
    let keys = [
      "source", "mediaId", "episode", "seriesTitle", "episodeTitle", "poster",
      "resolution", "sourceLabel", "seasonLabel", "maxParallelDownloads", "wifiOnly",
      "preferredQuality", "torrentPersist", "torrentStreamedDownload", "torrentSpeed",
      "maxConns", "hashes", "ids", "id"
    ]
    for key in keys {
      if let n = call.getInt(key) {
        d[key] = n
        continue
      }
      if let b = call.getBool(key) {
        d[key] = b
        continue
      }
      if let s = call.getString(key) {
        d[key] = s
      }
    }
    return d
  }
}
