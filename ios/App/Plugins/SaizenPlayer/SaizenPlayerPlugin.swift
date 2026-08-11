import Capacitor
import UIKit

@objc(SaizenPlayerPlugin)
public class SaizenPlayerPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "SaizenPlayerPlugin"
  public let jsName = "SaizenPlayer"
  public let pluginMethods: [CAPPluginMethod] = {
    var methods: [CAPPluginMethod] = [
      CAPPluginMethod(name: "spawnPlayer", returnType: CAPPluginReturnPromise),
      CAPPluginMethod(name: "stopPlayer", returnType: CAPPluginReturnPromise)
    ]
    #if DEBUG
    methods.append(CAPPluginMethod(name: "runModuleDay0Spike", returnType: CAPPluginReturnPromise))
    #endif
    return methods
  }()

  public override func load() {
    PlaybackProgressReporter.shared.bind(plugin: self)
  }

  /// Only allow remote https media, or an *active* authenticated loopback stream.
  private static func isAllowedPlaybackURL(_ url: URL) -> Bool {
    guard let scheme = url.scheme?.lowercased() else { return false }
    if scheme == "https" {
      return url.host != nil && !(url.host?.isEmpty ?? true)
    }
    if scheme == "http" {
      let host = (url.host ?? "").lowercased()
      guard host == "127.0.0.1" || host == "localhost" else { return false }
      // Bind to a live HTTPRangeServer session token (not any loopback path).
      return HTTPRangeServer.isAuthorizedActiveStreamURL(url)
    }
    return false
  }

  private static func parseSkipInterval(_ raw: Any?) -> SkipInterval? {
    guard let dict = raw as? [String: Any] else { return nil }
    let start = (dict["start"] as? Double) ?? (dict["start"] as? Int).map(Double.init)
    let end = (dict["end"] as? Double) ?? (dict["end"] as? Int).map(Double.init)
    guard let start, let end else { return nil }
    return SkipInterval(start: start, end: end)
  }

  private static func parseSessionOptions(_ call: CAPPluginCall) -> PlayerSessionOptions {
    let skip = call.getObject("skipTimes")
    let op = parseSkipInterval(skip?["op"])
    let ed = parseSkipInterval(skip?["ed"])
    let total = call.getInt("totalEpisodes")
    let hasNext =
      call.getBool("hasNextEpisode")
      ?? (total.map { t in
        let ep = call.getInt("episode") ?? 0
        return ep > 0 && ep < t
      } ?? false)

    return PlayerSessionOptions(
      resolution: call.getString("resolution"),
      sourceLabel: call.getString("sourceLabel"),
      totalEpisodes: total,
      hasNextEpisode: hasNext,
      autoSkipOpEd: call.getBool("autoSkipOpEd") ?? false,
      gestureSeekEnabled: call.getBool("gestureSeekEnabled") ?? true,
      doubleTapSeekSec: call.getInt("doubleTapSeekSec") ?? 10,
      tripleTapSeekSec: call.getInt("tripleTapSeekSec") ?? 30,
      autoplayNext: call.getBool("autoplayNext") ?? false,
      op: op,
      ed: ed
    )
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
    let options = Self.parseSessionOptions(call)
    let context = PlaybackContext(
      anilistId: anilistId,
      episode: episode,
      idMal: idMal,
      options: options
    )

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

  #if DEBUG
  @objc func runModuleDay0Spike(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
      guard let root = self.bridge?.viewController else {
        call.reject("No view controller")
        return
      }

      Task {
        do {
          let result = try await ModuleDay0Spike.run(from: root)
          var payload: [String: Any] = [
            "moduleId": result.moduleId,
            "sourceName": result.sourceName,
            "streamUrl": result.streamURL.absoluteString
          ]
          if let quality = result.quality {
            payload["quality"] = quality
          }
          call.resolve(payload)
        } catch {
          let message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
          NSLog("[Saizen] Day0 spike failed: %@", message)
          call.reject(message)
        }
      }
    }
  }
  #endif
}
