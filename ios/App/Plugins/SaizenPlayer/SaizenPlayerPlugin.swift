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

  @objc func spawnPlayer(_ call: CAPPluginCall) {
    guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
      call.reject("Missing or invalid url")
      return
    }
    let hintRaw = call.getString("playerHint") ?? "vlc"
    let hint = PlayerHint(rawValue: hintRaw) ?? .vlc
    let title = call.getString("title")

    // Capture session now so a later play can't be killed by this player's dismiss.
    let session = SaizenPlayback.currentSessionID

    DispatchQueue.main.async {
      guard let root = self.bridge?.viewController else {
        call.reject("No view controller")
        return
      }
      var presenter = root
      while let presented = presenter.presentedViewController {
        presenter = presented
      }
      PlayerRouter.present(from: presenter, url: url, hint: hint, title: title) {
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
