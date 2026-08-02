import Capacitor
import UIKit

@objc(SaizenPlayerPlugin)
public class SaizenPlayerPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "SaizenPlayerPlugin"
  public let jsName = "SaizenPlayer"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "spawnPlayer", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "stopPlayer", returnType: CAPPluginReturnPromise)
  ]

  public override func load() {
    PlaybackProgressReporter.shared.bind(plugin: self)
  }

  /// Only allow loopback stream URLs or remote https media.
  private static func isAllowedPlaybackURL(_ url: URL) -> Bool {
    guard let scheme = url.scheme?.lowercased() else { return false }
    if scheme == "https" {
      return url.host != nil && !(url.host?.isEmpty ?? true)
    }
    if scheme == "http" {
      let host = (url.host ?? "").lowercased()
      // Authenticated loopback range server only — never arbitrary LAN hosts.
      return host == "127.0.0.1" || host == "localhost"
    }
    return false
  }

  @objc func spawnPlayer(_ call: CAPPluginCall) {
    guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
      call.reject("Missing or invalid url")
      return
    }
    guard Self.isAllowedPlaybackURL(url) else {
      call.reject("Playback URL not allowed (https or http://127.0.0.1 only)")
      return
    }
    let hintRaw = call.getString("playerHint") ?? "vlc"
    let hint = PlayerHint(rawValue: hintRaw) ?? .vlc
    let title = call.getString("title")
    let anilistId = call.getInt("anilistId") ?? call.getInt("mediaId") ?? 0
    let episode = call.getInt("episode") ?? 0
    let idMal = call.getInt("idMal")
    let context = PlaybackContext(anilistId: anilistId, episode: episode, idMal: idMal)

    // Capture session now so a later play can't be killed by this player's dismiss.
    let session = SaizenPlayback.currentSessionID
    PlaybackProgressReporter.shared.resetThrottle()

    DispatchQueue.main.async {
      guard let root = self.bridge?.viewController else {
        call.reject("No view controller")
        return
      }
      var presenter = root
      while let presented = presenter.presentedViewController {
        presenter = presented
      }
      PlayerRouter.present(
        from: presenter,
        url: url,
        hint: hint,
        title: title,
        context: context
      ) {
        // Only purge if this is still the same playback session.
        SaizenPlayback.stopAndPurge(expecting: session)
      }
      call.resolve()
    }
  }

  @objc func stopPlayer(_ call: CAPPluginCall) {
    let session = SaizenPlayback.currentSessionID
    DispatchQueue.main.async {
      self.bridge?.viewController?.dismiss(animated: true) {
        SaizenPlayback.stopAndPurge(expecting: session)
      }
      call.resolve()
    }
  }
}
