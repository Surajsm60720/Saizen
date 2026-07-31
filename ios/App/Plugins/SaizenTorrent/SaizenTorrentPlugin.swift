import Capacitor
import Foundation
import UIKit

/// Capacitor plugin: playTorrent / torrentInfo / stop
@objc(SaizenTorrentPlugin)
public class SaizenTorrentPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "SaizenTorrentPlugin"
  public let jsName = "SaizenTorrent"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "playTorrent", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "torrentInfo", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "checkAvailableSpace", returnType: CAPPluginReturnPromise)
  ]

  private let engine = HybridTorrentEngine()

  @objc func playTorrent(_ call: CAPPluginCall) {
    guard let source = call.getString("source") else {
      call.reject("Missing source (magnet or http URL)")
      return
    }
    let mediaId = call.getInt("mediaId") ?? 0
    let episode = call.getInt("episode") ?? 1

    Task {
      do {
        let files = try await engine.play(source: source, mediaId: mediaId, episode: episode)
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
        call.reject(error.localizedDescription)
      }
    }
  }

  @objc func torrentInfo(_ call: CAPPluginCall) {
    let hash = call.getString("hash") ?? ""
    Task {
      let info = await engine.torrentInfo(hash: hash)
      call.resolve(info)
    }
  }

  @objc func stop(_ call: CAPPluginCall) {
    engine.stopAll()
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
}
