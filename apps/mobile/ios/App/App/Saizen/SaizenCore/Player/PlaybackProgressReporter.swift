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

  public func emitPlayerAction(_ action: String, anilistId: Int, episode: Int) {
    guard anilistId > 0, episode > 0 else { return }
    plugin?.notifyListeners(
      "playerAction",
      data: [
        "action": action,
        "anilistId": anilistId,
        "episode": episode
      ]
    )
  }

  public func resetThrottle() {
    lastEmitAt = .distantPast
  }
}

public struct SkipInterval {
  public let start: Double
  public let end: Double

  public init?(start: Double, end: Double) {
    guard start.isFinite, end.isFinite, end > start else { return nil }
    self.start = start
    self.end = end
  }

  public func contains(_ t: Double) -> Bool {
    t >= start && t < end
  }
}

public struct PlayerSessionOptions {
  public let resolution: String?
  public let sourceLabel: String?
  public let totalEpisodes: Int?
  public let hasNextEpisode: Bool
  public let autoSkipOpEd: Bool
  public let op: SkipInterval?
  public let ed: SkipInterval?

  public static let empty = PlayerSessionOptions(
    resolution: nil,
    sourceLabel: nil,
    totalEpisodes: nil,
    hasNextEpisode: false,
    autoSkipOpEd: false,
    op: nil,
    ed: nil
  )

  public init(
    resolution: String?,
    sourceLabel: String?,
    totalEpisodes: Int?,
    hasNextEpisode: Bool,
    autoSkipOpEd: Bool,
    op: SkipInterval?,
    ed: SkipInterval?
  ) {
    self.resolution = resolution
    self.sourceLabel = sourceLabel
    self.totalEpisodes = totalEpisodes
    self.hasNextEpisode = hasNextEpisode
    self.autoSkipOpEd = autoSkipOpEd
    self.op = op
    self.ed = ed
  }
}

public struct PlaybackContext {
  public let anilistId: Int
  public let episode: Int
  public let idMal: Int?
  public let options: PlayerSessionOptions

  public init(
    anilistId: Int,
    episode: Int,
    idMal: Int?,
    options: PlayerSessionOptions = .empty
  ) {
    self.anilistId = anilistId
    self.episode = episode
    self.idMal = idMal
    self.options = options
  }

  public var isValid: Bool { anilistId > 0 && episode > 0 }
}
