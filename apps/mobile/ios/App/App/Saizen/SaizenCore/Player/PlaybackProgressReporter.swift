import Capacitor
import Foundation

/// Thread playback position from PlayerRouter → Capacitor JS (`playbackProgress`).
public final class PlaybackProgressReporter {
  public static let shared = PlaybackProgressReporter()

  public weak var plugin: CAPPlugin?

  private var lastEmitAt: Date = .distantPast
  private let minInterval: TimeInterval = 2

  private init() {}

  public func bind(plugin: CAPPlugin) {
    self.plugin = plugin
  }

  public func emit(
    anilistId: Int,
    episode: Int,
    idMal: Int?,
    positionSec: Double,
    durationSec: Double
  ) {
    guard anilistId > 0, episode > 0 else { return }
    guard durationSec >= 30, positionSec >= 0 else { return }
    let now = Date()
    guard now.timeIntervalSince(lastEmitAt) >= minInterval else { return }
    lastEmitAt = now

    var data: [String: Any] = [
      "anilistId": anilistId,
      "episode": episode,
      "positionSec": positionSec,
      "durationSec": durationSec
    ]
    if let idMal, idMal > 0 {
      data["idMal"] = idMal
    }
    plugin?.notifyListeners("playbackProgress", data: data)
  }

  public func resetThrottle() {
    lastEmitAt = .distantPast
  }
}

public struct PlaybackContext {
  public let anilistId: Int
  public let episode: Int
  public let idMal: Int?

  public init(anilistId: Int, episode: Int, idMal: Int?) {
    self.anilistId = anilistId
    self.episode = episode
    self.idMal = idMal
  }

  public var isValid: Bool { anilistId > 0 && episode > 0 }
}
