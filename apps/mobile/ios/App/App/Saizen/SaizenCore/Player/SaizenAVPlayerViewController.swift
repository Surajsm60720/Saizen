import AVFoundation
import AVKit
import UIKit

/// Fullscreen custom AVPlayer chrome for CDN Watch (clean-room Shirox-pattern UX).
final class SaizenAVPlayerViewController: UIViewController {
  var onDismiss: (() -> Void)?

  private let player: AVPlayer
  private let playbackContext: PlaybackContext
  private let titleText: String?

  private let playerView = PlayerLayerView()
  private let chrome = PassthroughChromeView()
  private let dimTop = GradientFadeView(topHeavy: true)
  private let dimBottom = GradientFadeView(topHeavy: false)

  private let closeButton = UIButton(type: .system)
  private let serverLabel = UILabel()

  private let playPauseButton = UIButton(type: .system)
  private let skipBack10Button = UIButton(type: .system)
  private let skipForward10Button = UIButton(type: .system)
  private var centerTransport: UIStackView!

  private let episodeLabel = UILabel()
  private let showTitleLabel = UILabel()
  private let skipSegmentButton = UIButton(type: .system)
  private let speedButton = UIButton(type: .system)
  private let aspectButton = UIButton(type: .system)
  private let nextEpisodeButton = UIButton(type: .system)
  private let actionsTray = UIStackView()

  private let timeLabel = UILabel()
  private let durationLabel = UILabel()
  private let scrubber = SaizenPlayerScrubber()
  private let bufferingLabel = UILabel()
  private let seekFlashLabel = UILabel()

  private var timeObserver: Any?
  private var endObserver: NSObjectProtocol?
  private var interruptionObserver: NSObjectProtocol?
  private var rateObserver: NSKeyValueObservation?
  private var timeControlObserver: NSKeyValueObservation?
  private var itemStatusObserver: NSKeyValueObservation?

  private var didNotify = false
  private var hasAppeared = false
  private var userPaused = false
  private var wantsPlayback = true
  private var hasStartedPlaying = false
  private var audioInterrupted = false
  private var isRotating = false
  private var isSeeking = false
  private var chromeVisible = true
  private var hideChromeWorkItem: DispatchWorkItem?
  private var seekFlashWorkItem: DispatchWorkItem?
  private var seekFlashLeading: NSLayoutConstraint?
  private var seekFlashTrailing: NSLayoutConstraint?
  private var didAutoSkipOp = false
  private var didAutoSkipEd = false
  private var activeSkipKind: String?
  private var activeSkipEnd: Double?
  private var didHandleEnded = false
  private var rateIndex = 1
  private let rates: [Float] = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0]
  private var aspectFill = false

  private let glassFill = UIColor.white.withAlphaComponent(0.14)
  private let glassStroke = UIColor.white.withAlphaComponent(0.18)

  private let subtitleURL: URL?
  private let subtitleHeaders: [String: String]
  private let subtitleLabel = UILabel()
  private var subtitleCues: [(start: Double, end: Double, text: String)] = []
  private var subtitleLoadTask: URLSessionDataTask?

  init(
    player: AVPlayer,
    title: String?,
    context: PlaybackContext,
    subtitleURL: URL? = nil,
    subtitleHeaders: [String: String] = [:]
  ) {
    self.player = player
    self.titleText = title
    self.playbackContext = context
    self.subtitleURL = subtitleURL
    self.subtitleHeaders = subtitleHeaders
    super.init(nibName: nil, bundle: nil)
    modalPresentationStyle = .fullScreen
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) { fatalError() }

  override var prefersStatusBarHidden: Bool { true }
  override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    configureVideo()
    configureChrome()
    configureGestures()
    installObservers()
    applySkipRanges()
    scheduleHideChrome()
    loadExternalSubtitlesIfNeeded()
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    hasAppeared = true
    SaizenPlaybackAudio.activate()
    if wantsPlayback, !userPaused {
      player.play()
    }
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    playerView.playerLayer.frame = playerView.bounds
  }

  override func viewWillTransition(to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator) {
    super.viewWillTransition(to: size, with: coordinator)
    let shouldKeepPlaying = wantsPlayback && !userPaused
    isRotating = true
    coordinator.animate(alongsideTransition: { _ in
      self.playerView.playerLayer.frame = CGRect(origin: .zero, size: size)
    }, completion: { [weak self] _ in
      guard let self else { return }
      self.isRotating = false
      guard shouldKeepPlaying else { return }
      if self.player.rate == 0 {
        NSLog("[Saizen] custom AVPlayer resume after orientation change")
        SaizenPlaybackAudio.activate()
        self.player.play()
      }
    })
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    guard hasAppeared else { return }
    guard isBeingDismissed || isMovingFromParent else { return }
    notifyDismiss()
  }

  deinit {
    subtitleLoadTask?.cancel()
    tearDownObservers()
  }

  // MARK: - Setup

  private func configureVideo() {
    playerView.translatesAutoresizingMaskIntoConstraints = false
    playerView.backgroundColor = .black
    playerView.playerLayer.player = player
    playerView.playerLayer.videoGravity = .resizeAspect
    view.addSubview(playerView)
    NSLayoutConstraint.activate([
      playerView.topAnchor.constraint(equalTo: view.topAnchor),
      playerView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      playerView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      playerView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
    ])
  }

  private func configureChrome() {
    chrome.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(chrome)
    NSLayoutConstraint.activate([
      chrome.topAnchor.constraint(equalTo: view.topAnchor),
      chrome.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      chrome.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      chrome.bottomAnchor.constraint(equalTo: view.bottomAnchor)
    ])

    for fade in [dimTop, dimBottom] {
      fade.translatesAutoresizingMaskIntoConstraints = false
      fade.isUserInteractionEnabled = false
      chrome.addSubview(fade)
    }
    NSLayoutConstraint.activate([
      dimTop.topAnchor.constraint(equalTo: chrome.topAnchor),
      dimTop.leadingAnchor.constraint(equalTo: chrome.leadingAnchor),
      dimTop.trailingAnchor.constraint(equalTo: chrome.trailingAnchor),
      dimTop.heightAnchor.constraint(equalTo: chrome.heightAnchor, multiplier: 0.28),
      dimBottom.bottomAnchor.constraint(equalTo: chrome.bottomAnchor),
      dimBottom.leadingAnchor.constraint(equalTo: chrome.leadingAnchor),
      dimBottom.trailingAnchor.constraint(equalTo: chrome.trailingAnchor),
      dimBottom.heightAnchor.constraint(equalTo: chrome.heightAnchor, multiplier: 0.42)
    ])

    styleGlassCircle(closeButton, size: 34)
    closeButton.setImage(UIImage(systemName: "xmark", withConfiguration: symbolConfig(12, .semibold)), for: .normal)
    closeButton.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
    closeButton.accessibilityLabel = "Close"
    chrome.addSubview(closeButton)

    let source = playbackContext.options.sourceLabel?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    serverLabel.text = source.isEmpty ? "Server 1" : source
    serverLabel.textColor = .white.withAlphaComponent(0.92)
    serverLabel.font = .systemFont(ofSize: 14, weight: .semibold)
    serverLabel.textAlignment = .center
    serverLabel.translatesAutoresizingMaskIntoConstraints = false
    chrome.addSubview(serverLabel)

    styleGlassCircle(skipBack10Button, size: 46)
    skipBack10Button.setImage(
      UIImage(systemName: "gobackward.10", withConfiguration: symbolConfig(18, .regular)),
      for: .normal
    )
    skipBack10Button.addTarget(self, action: #selector(skipBack10), for: .touchUpInside)
    skipBack10Button.accessibilityLabel = "Back 10 seconds"

    styleGlassCircle(playPauseButton, size: 54)
    playPauseButton.setImage(
      UIImage(systemName: "pause.fill", withConfiguration: symbolConfig(20, .semibold)),
      for: .normal
    )
    playPauseButton.addTarget(self, action: #selector(togglePlay), for: .touchUpInside)
    playPauseButton.accessibilityLabel = "Pause"

    styleGlassCircle(skipForward10Button, size: 46)
    skipForward10Button.setImage(
      UIImage(systemName: "goforward.10", withConfiguration: symbolConfig(18, .regular)),
      for: .normal
    )
    skipForward10Button.addTarget(self, action: #selector(skipForward10), for: .touchUpInside)
    skipForward10Button.accessibilityLabel = "Forward 10 seconds"

    centerTransport = UIStackView(arrangedSubviews: [
      skipBack10Button, playPauseButton, skipForward10Button
    ])
    centerTransport.axis = .horizontal
    centerTransport.alignment = .center
    centerTransport.spacing = 22
    centerTransport.translatesAutoresizingMaskIntoConstraints = false
    chrome.addSubview(centerTransport)

    let ep = playbackContext.episode
    episodeLabel.text = ep > 0 ? "EP\(ep)" : "Episode"
    episodeLabel.textColor = .white.withAlphaComponent(0.55)
    episodeLabel.font = .systemFont(ofSize: 12, weight: .medium)
    episodeLabel.translatesAutoresizingMaskIntoConstraints = false

    showTitleLabel.text = titleText ?? "Saizen"
    showTitleLabel.textColor = .white
    showTitleLabel.font = .systemFont(ofSize: 15, weight: .semibold)
    showTitleLabel.lineBreakMode = .byTruncatingTail
    showTitleLabel.translatesAutoresizingMaskIntoConstraints = false
    chrome.addSubview(episodeLabel)
    chrome.addSubview(showTitleLabel)

    skipSegmentButton.translatesAutoresizingMaskIntoConstraints = false
    skipSegmentButton.isHidden = true
    skipSegmentButton.addTarget(self, action: #selector(skipSegmentTapped), for: .touchUpInside)
    applySkipButtonStyle(seconds: nil, title: "Skip Opening")
    chrome.addSubview(skipSegmentButton)

    speedButton.setTitle("1x", for: .normal)
    speedButton.setTitleColor(.white, for: .normal)
    speedButton.titleLabel?.font = .systemFont(ofSize: 13, weight: .semibold)
    speedButton.titleLabel?.textAlignment = .center
    speedButton.contentHorizontalAlignment = .center
    speedButton.addTarget(self, action: #selector(speedTapped), for: .touchUpInside)
    speedButton.translatesAutoresizingMaskIntoConstraints = false
    speedButton.widthAnchor.constraint(equalToConstant: 28).isActive = true
    speedButton.heightAnchor.constraint(equalToConstant: 28).isActive = true

    styleTrayIcon(aspectButton, "arrow.up.left.and.arrow.down.right", #selector(aspectTapped))
    styleTrayIcon(nextEpisodeButton, "forward.end.fill", #selector(nextEpisodeTapped))
    nextEpisodeButton.isHidden = !playbackContext.options.hasNextEpisode
    nextEpisodeButton.accessibilityLabel = "Next episode"

    actionsTray.axis = .horizontal
    actionsTray.alignment = .center
    actionsTray.spacing = 12
    actionsTray.translatesAutoresizingMaskIntoConstraints = false
    actionsTray.isLayoutMarginsRelativeArrangement = true
    actionsTray.layoutMargins = UIEdgeInsets(top: 8, left: 12, bottom: 8, right: 12)
    applyGlassTray(actionsTray, corner: 18)
    actionsTray.addArrangedSubview(aspectButton)
    actionsTray.addArrangedSubview(speedButton)
    actionsTray.addArrangedSubview(nextEpisodeButton)
    chrome.addSubview(actionsTray)

    timeLabel.font = .monospacedDigitSystemFont(ofSize: 12, weight: .medium)
    timeLabel.textColor = .white.withAlphaComponent(0.85)
    timeLabel.text = "0:00"
    durationLabel.font = .monospacedDigitSystemFont(ofSize: 12, weight: .medium)
    durationLabel.textColor = .white.withAlphaComponent(0.55)
    durationLabel.text = "0:00"
    durationLabel.textAlignment = .right
    scrubber.translatesAutoresizingMaskIntoConstraints = false
    scrubber.heightAnchor.constraint(equalToConstant: 28).isActive = true
    scrubber.onSeek = { [weak self] t in self?.seek(to: t) }
    scrubber.onDragStart = { [weak self] in
      self?.isSeeking = true
      self?.showChrome(persistent: true)
    }
    scrubber.onDragEnd = { [weak self] in
      self?.isSeeking = false
      self?.scheduleHideChrome()
    }
    chrome.addSubview(scrubber)
    chrome.addSubview(timeLabel)
    chrome.addSubview(durationLabel)
    timeLabel.translatesAutoresizingMaskIntoConstraints = false
    durationLabel.translatesAutoresizingMaskIntoConstraints = false

    bufferingLabel.translatesAutoresizingMaskIntoConstraints = false
    bufferingLabel.text = "Buffering…"
    bufferingLabel.textColor = .white.withAlphaComponent(0.9)
    bufferingLabel.font = .systemFont(ofSize: 14, weight: .semibold)
    bufferingLabel.isHidden = true
    chrome.addSubview(bufferingLabel)

    subtitleLabel.translatesAutoresizingMaskIntoConstraints = false
    subtitleLabel.textColor = .white
    subtitleLabel.font = .systemFont(ofSize: 16, weight: .semibold)
    subtitleLabel.textAlignment = .center
    subtitleLabel.numberOfLines = 0
    subtitleLabel.layer.shadowColor = UIColor.black.cgColor
    subtitleLabel.layer.shadowOpacity = 0.85
    subtitleLabel.layer.shadowRadius = 2
    subtitleLabel.layer.shadowOffset = CGSize(width: 0, height: 1)
    subtitleLabel.isHidden = true
    // Sit above chrome so cues stay visible when chrome auto-hides.
    view.insertSubview(subtitleLabel, belowSubview: chrome)

    seekFlashLabel.font = .systemFont(ofSize: 15, weight: .semibold)
    seekFlashLabel.textColor = .white
    seekFlashLabel.backgroundColor = glassFill
    seekFlashLabel.textAlignment = .center
    seekFlashLabel.layer.cornerRadius = 18
    seekFlashLabel.clipsToBounds = true
    seekFlashLabel.isHidden = true
    seekFlashLabel.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(seekFlashLabel)

    let guide = chrome.safeAreaLayoutGuide
    // Landscape safeArea.top is often 0 — keep title/close clear of Dynamic Island without huge chrome.
    let topMin = closeButton.topAnchor.constraint(greaterThanOrEqualTo: chrome.topAnchor, constant: 20)
    let topSafe = closeButton.topAnchor.constraint(equalTo: guide.topAnchor, constant: 8)
    topSafe.priority = .defaultHigh

    NSLayoutConstraint.activate([
      topMin,
      topSafe,
      closeButton.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 12),

      serverLabel.centerYAnchor.constraint(equalTo: closeButton.centerYAnchor),
      serverLabel.centerXAnchor.constraint(equalTo: chrome.centerXAnchor),
      serverLabel.leadingAnchor.constraint(greaterThanOrEqualTo: closeButton.trailingAnchor, constant: 10),
      serverLabel.trailingAnchor.constraint(lessThanOrEqualTo: guide.trailingAnchor, constant: -12),

      centerTransport.centerXAnchor.constraint(equalTo: chrome.centerXAnchor),
      centerTransport.centerYAnchor.constraint(equalTo: chrome.centerYAnchor, constant: -6),

      scrubber.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 16),
      scrubber.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -16),
      scrubber.bottomAnchor.constraint(equalTo: guide.bottomAnchor, constant: -22),

      timeLabel.leadingAnchor.constraint(equalTo: scrubber.leadingAnchor),
      timeLabel.topAnchor.constraint(equalTo: scrubber.bottomAnchor, constant: 1),
      durationLabel.trailingAnchor.constraint(equalTo: scrubber.trailingAnchor),
      durationLabel.centerYAnchor.constraint(equalTo: timeLabel.centerYAnchor),

      // Title + actions sit on the same baseline just above the scrubber.
      actionsTray.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -14),
      actionsTray.bottomAnchor.constraint(equalTo: scrubber.topAnchor, constant: -6),

      showTitleLabel.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 16),
      showTitleLabel.trailingAnchor.constraint(lessThanOrEqualTo: actionsTray.leadingAnchor, constant: -10),
      showTitleLabel.bottomAnchor.constraint(equalTo: scrubber.topAnchor, constant: -8),
      episodeLabel.leadingAnchor.constraint(equalTo: showTitleLabel.leadingAnchor),
      episodeLabel.bottomAnchor.constraint(equalTo: showTitleLabel.topAnchor, constant: -1),
      episodeLabel.trailingAnchor.constraint(lessThanOrEqualTo: showTitleLabel.trailingAnchor),

      // Skip OP/ED — bottom-trailing, above the actions tray.
      skipSegmentButton.trailingAnchor.constraint(equalTo: actionsTray.trailingAnchor),
      skipSegmentButton.bottomAnchor.constraint(equalTo: actionsTray.topAnchor, constant: -6),
      skipSegmentButton.leadingAnchor.constraint(greaterThanOrEqualTo: chrome.centerXAnchor, constant: 8),

      bufferingLabel.centerXAnchor.constraint(equalTo: chrome.centerXAnchor),
      bufferingLabel.bottomAnchor.constraint(equalTo: centerTransport.topAnchor, constant: -12),

      subtitleLabel.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24),
      subtitleLabel.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24),
      subtitleLabel.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -72),

      seekFlashLabel.centerYAnchor.constraint(equalTo: playerView.centerYAnchor),
      seekFlashLabel.heightAnchor.constraint(equalToConstant: 32),
      seekFlashLabel.widthAnchor.constraint(greaterThanOrEqualToConstant: 64)
    ])
    seekFlashLeading = seekFlashLabel.leadingAnchor.constraint(equalTo: playerView.leadingAnchor, constant: 24)
    seekFlashTrailing = seekFlashLabel.trailingAnchor.constraint(equalTo: playerView.trailingAnchor, constant: -24)
    seekFlashLeading?.isActive = true
  }

  private func applyGlassTray(_ view: UIView, corner: CGFloat) {
    view.backgroundColor = glassFill
    view.layer.cornerRadius = corner
    view.layer.borderWidth = 1 / UIScreen.main.scale
    view.layer.borderColor = glassStroke.cgColor
    if #available(iOS 13.0, *) {
      view.layer.cornerCurve = .continuous
    }
  }

  private func styleGlassCircle(_ button: UIButton, size: CGFloat) {
    button.tintColor = .white
    button.backgroundColor = glassFill
    button.layer.cornerRadius = size / 2
    button.layer.borderWidth = 1 / UIScreen.main.scale
    button.layer.borderColor = glassStroke.cgColor
    button.translatesAutoresizingMaskIntoConstraints = false
    button.widthAnchor.constraint(equalToConstant: size).isActive = true
    button.heightAnchor.constraint(equalToConstant: size).isActive = true
  }

  private func styleTrayIcon(_ button: UIButton, _ systemName: String, _ action: Selector) {
    button.setImage(UIImage(systemName: systemName, withConfiguration: symbolConfig(14, .medium)), for: .normal)
    button.tintColor = .white
    button.contentHorizontalAlignment = .center
    button.contentVerticalAlignment = .center
    button.addTarget(self, action: action, for: .touchUpInside)
    button.translatesAutoresizingMaskIntoConstraints = false
    button.widthAnchor.constraint(equalToConstant: 28).isActive = true
    button.heightAnchor.constraint(equalToConstant: 28).isActive = true
  }

  private func symbolConfig(_ point: CGFloat, _ weight: UIImage.SymbolWeight) -> UIImage.SymbolConfiguration {
    UIImage.SymbolConfiguration(pointSize: point, weight: weight)
  }

  private func applySkipButtonStyle(seconds: Int?, title: String) {
    var cfg = UIButton.Configuration.plain()
    cfg.cornerStyle = .capsule
    cfg.baseForegroundColor = .white
    cfg.background.backgroundColor = glassFill
    cfg.contentInsets = NSDirectionalEdgeInsets(top: 7, leading: 10, bottom: 7, trailing: 12)
    cfg.image = UIImage(systemName: "goforward", withConfiguration: symbolConfig(11, .semibold))
    cfg.imagePadding = 6
    cfg.title = (seconds != nil && seconds! > 0) ? "\(seconds!)s" : title
    cfg.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
      var out = incoming
      out.font = .systemFont(ofSize: 13, weight: .semibold)
      return out
    }
    skipSegmentButton.configuration = cfg
    skipSegmentButton.layer.borderWidth = 1 / UIScreen.main.scale
    skipSegmentButton.layer.borderColor = glassStroke.cgColor
    skipSegmentButton.layer.cornerRadius = 16
  }

  private func configureGestures() {
    let single = UITapGestureRecognizer(target: self, action: #selector(toggleChrome))
    single.numberOfTapsRequired = 1
    playerView.addGestureRecognizer(single)
    playerView.isUserInteractionEnabled = true

    guard playbackContext.options.gestureSeekEnabled else { return }

    let double = UITapGestureRecognizer(target: self, action: #selector(handleSeekTap(_:)))
    double.numberOfTapsRequired = 2
    playerView.addGestureRecognizer(double)
    single.require(toFail: double)

    if playbackContext.options.tripleTapSeekSec > 0 {
      let triple = UITapGestureRecognizer(target: self, action: #selector(handleSeekTap(_:)))
      triple.numberOfTapsRequired = 3
      playerView.addGestureRecognizer(triple)
      double.require(toFail: triple)
    }
  }

  private func applySkipRanges() {
    if let op = playbackContext.options.op {
      scrubber.opRange = (op.start, op.end)
    }
    if let ed = playbackContext.options.ed {
      scrubber.edRange = (ed.start, ed.end)
    }
  }

  // MARK: - Observers

  private func installObservers() {
    let interval = CMTime(seconds: 0.25, preferredTimescale: 600)
    timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) {
      [weak self] time in
      self?.handleTime(time.seconds)
    }

    if let item = player.currentItem {
      itemStatusObserver = item.observe(\.status, options: [.new]) { [weak self] item, _ in
        guard let self else { return }
        switch item.status {
        case .readyToPlay:
          NSLog("[Saizen] custom AVPlayerItem readyToPlay")
          NowPlayingSession.shared.refresh(from: self.player)
          if self.wantsPlayback, !self.userPaused {
            self.player.play()
          }
        case .failed:
          NSLog(
            "[Saizen] custom AVPlayerItem failed: %@",
            String(describing: item.error)
          )
        default:
          break
        }
      }

      endObserver = NotificationCenter.default.addObserver(
        forName: .AVPlayerItemDidPlayToEndTime,
        object: item,
        queue: .main
      ) { [weak self] _ in
        self?.handlePlaybackEnded()
      }
    }

    rateObserver = player.observe(\.rate, options: [.new]) { [weak self] player, _ in
      guard let self else { return }
      if player.rate > 0 {
        self.hasStartedPlaying = true
        self.userPaused = false
        self.wantsPlayback = true
        self.updatePlayPauseButton(playing: true)
        return
      }
      guard self.hasStartedPlaying else { return }
      guard !self.audioInterrupted, !self.isRotating, !self.isSeeking else { return }
      if player.timeControlStatus == .paused, player.reasonForWaitingToPlay == nil {
        self.userPaused = true
        self.wantsPlayback = false
        self.updatePlayPauseButton(playing: false)
        self.showChrome(persistent: true)
      }
    }

    timeControlObserver = player.observe(\.timeControlStatus, options: [.new]) { [weak self] player, _ in
      guard let self else { return }
      switch player.timeControlStatus {
      case .playing:
        self.bufferingLabel.isHidden = true
        self.hasStartedPlaying = true
        self.userPaused = false
        self.wantsPlayback = true
        self.updatePlayPauseButton(playing: true)
        self.scheduleHideChrome()
      case .waitingToPlayAtSpecifiedRate:
        self.bufferingLabel.isHidden = false
        self.wantsPlayback = true
        self.userPaused = false
      case .paused:
        self.bufferingLabel.isHidden = true
        self.updatePlayPauseButton(playing: false)
      @unknown default:
        break
      }
    }

    interruptionObserver = NotificationCenter.default.addObserver(
      forName: AVAudioSession.interruptionNotification,
      object: AVAudioSession.sharedInstance(),
      queue: .main
    ) { [weak self] note in
      self?.handleInterruption(note)
    }
  }

  private func handleTime(_ pos: Double) {
    guard pos.isFinite else { return }
    NowPlayingSession.shared.refresh(from: player)
    updateSubtitle(at: pos)
    let dur = player.currentItem?.duration.seconds ?? .nan
    if !isSeeking {
      scrubber.currentTime = pos
      if dur.isFinite, dur > 0 {
        scrubber.duration = dur
        durationLabel.text = Self.formatSec(dur)
      }
      timeLabel.text = Self.formatSec(pos)
    }

    if let range = player.currentItem?.loadedTimeRanges.last?.timeRangeValue,
       dur.isFinite, dur > 0 {
      let end = CMTimeGetSeconds(range.start) + CMTimeGetSeconds(range.duration)
      if end.isFinite {
        scrubber.bufferedFraction = min(1, max(0, end / dur))
      }
    }

    updateSkipUI(at: pos)

    if playbackContext.isValid, dur.isFinite, dur >= 30 {
      PlaybackProgressReporter.shared.emit(
        anilistId: playbackContext.anilistId,
        episode: playbackContext.episode,
        idMal: playbackContext.idMal,
        positionSec: pos,
        durationSec: dur
      )
    }
  }

  private func handleInterruption(_ note: Notification) {
    guard
      let info = note.userInfo,
      let typeVal = info[AVAudioSessionInterruptionTypeKey] as? UInt,
      let type = AVAudioSession.InterruptionType(rawValue: typeVal)
    else { return }

    switch type {
    case .began:
      audioInterrupted = true
    case .ended:
      audioInterrupted = false
      let optsVal = info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
      let opts = AVAudioSession.InterruptionOptions(rawValue: optsVal)
      let shouldResume = opts.contains(.shouldResume) || wantsPlayback
      if shouldResume, !userPaused {
        wantsPlayback = true
        SaizenPlaybackAudio.activate()
        player.play()
      }
    @unknown default:
      break
    }
  }

  private func handlePlaybackEnded() {
    guard !didHandleEnded else { return }
    didHandleEnded = true
    updatePlayPauseButton(playing: false)
    showChrome(persistent: true)
    guard playbackContext.options.autoplayNext,
          playbackContext.options.hasNextEpisode,
          playbackContext.isValid
    else { return }
    PlaybackProgressReporter.shared.emitPlayerAction(
      "nextEpisode",
      anilistId: playbackContext.anilistId,
      episode: playbackContext.episode
    )
    dismiss(animated: true)
  }

  // MARK: - Skip

  private func updateSkipUI(at t: Double) {
    let opts = playbackContext.options
    if let op = opts.op, t < op.start { didAutoSkipOp = false }
    if let ed = opts.ed, t < ed.start { didAutoSkipEd = false }

    if let op = opts.op, op.contains(t) {
      activeSkipKind = "op"
      activeSkipEnd = op.end
      let remaining = max(1, Int((op.end - t).rounded(.up)))
      applySkipButtonStyle(seconds: remaining, title: "Skip Opening")
      skipSegmentButton.isHidden = false
      if opts.autoSkipOpEd, !didAutoSkipOp {
        didAutoSkipOp = true
        skipSegmentButton.isHidden = true
        activeSkipKind = nil
        activeSkipEnd = nil
        seek(to: op.end)
      }
      return
    }
    if let ed = opts.ed, ed.contains(t) {
      activeSkipKind = "ed"
      activeSkipEnd = ed.end
      let remaining = max(1, Int((ed.end - t).rounded(.up)))
      applySkipButtonStyle(seconds: remaining, title: "Skip Ending")
      skipSegmentButton.isHidden = false
      if opts.autoSkipOpEd, !didAutoSkipEd {
        didAutoSkipEd = true
        skipSegmentButton.isHidden = true
        activeSkipKind = nil
        activeSkipEnd = nil
        seek(to: ed.end)
      }
      return
    }
    activeSkipKind = nil
    activeSkipEnd = nil
    skipSegmentButton.isHidden = true
  }

  @objc private func skipSegmentTapped() {
    guard let kind = activeSkipKind else { return }
    let opts = playbackContext.options
    if kind == "op", let op = opts.op {
      didAutoSkipOp = true
      seek(to: op.end)
    } else if kind == "ed", let ed = opts.ed {
      didAutoSkipEd = true
      seek(to: ed.end)
    }
    activeSkipKind = nil
    activeSkipEnd = nil
    skipSegmentButton.isHidden = true
  }

  // MARK: - Actions

  @objc private func closeTapped() {
    dismiss(animated: true)
  }

  @objc private func nextEpisodeTapped() {
    guard playbackContext.isValid, playbackContext.options.hasNextEpisode else { return }
    PlaybackProgressReporter.shared.emitPlayerAction(
      "nextEpisode",
      anilistId: playbackContext.anilistId,
      episode: playbackContext.episode
    )
    dismiss(animated: true)
  }

  @objc private func aspectTapped() {
    aspectFill.toggle()
    playerView.playerLayer.videoGravity = aspectFill ? .resizeAspectFill : .resizeAspect
    let name = aspectFill ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right"
    aspectButton.setImage(UIImage(systemName: name, withConfiguration: symbolConfig(14, .medium)), for: .normal)
    showChrome(persistent: player.rate == 0)
  }

  @objc private func togglePlay() {
    if player.rate > 0 {
      userPaused = true
      wantsPlayback = false
      player.pause()
      updatePlayPauseButton(playing: false)
      showChrome(persistent: true)
    } else {
      userPaused = false
      wantsPlayback = true
      SaizenPlaybackAudio.activate()
      player.play()
      updatePlayPauseButton(playing: true)
      scheduleHideChrome()
    }
  }

  @objc private func skipBack10() { seekBy(-10) }
  @objc private func skipForward10() { seekBy(10) }

  @objc private func handleSeekTap(_ gr: UITapGestureRecognizer) {
    guard playbackContext.options.gestureSeekEnabled else { return }
    let x = gr.location(in: playerView).x
    let left = x < playerView.bounds.width / 2
    let taps = gr.numberOfTapsRequired
    let sec: Double
    if taps >= 3 {
      sec = Double(playbackContext.options.tripleTapSeekSec)
    } else {
      sec = Double(playbackContext.options.doubleTapSeekSec)
    }
    let delta = left ? -sec : sec
    seekBy(delta)
    flashSeek(amount: delta, left: left)
  }

  @objc private func speedTapped() {
    let sheet = UIAlertController(title: "Playback speed", message: nil, preferredStyle: .actionSheet)
    for (i, rate) in rates.enumerated() {
      let label = rate == 1.0 ? "1x" : String(format: "%gx", rate)
      let mark = i == rateIndex ? " ✓" : ""
      sheet.addAction(UIAlertAction(title: label + mark, style: .default) { [weak self] _ in
        guard let self else { return }
        self.rateIndex = i
        self.player.rate = self.wantsPlayback && !self.userPaused ? rate : 0
        if self.wantsPlayback, !self.userPaused {
          self.player.play()
          self.player.rate = rate
        }
        self.speedButton.setTitle(label, for: .normal)
      })
    }
    sheet.addAction(UIAlertAction(title: "Cancel", style: .cancel))
    if let pop = sheet.popoverPresentationController {
      pop.sourceView = speedButton
      pop.sourceRect = speedButton.bounds
    }
    present(sheet, animated: true)
    showChrome(persistent: true)
  }

  @objc private func toggleChrome() {
    if chromeVisible {
      hideChrome()
    } else {
      showChrome(persistent: player.rate == 0)
    }
  }

  private func seekBy(_ delta: Double) {
    let pos = player.currentTime().seconds
    guard pos.isFinite else { return }
    seek(to: max(0, pos + delta))
  }

  private func seek(to seconds: Double) {
    let t = CMTime(seconds: max(0, seconds), preferredTimescale: 600)
    isSeeking = true
    player.seek(to: t, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] finished in
      guard let self else { return }
      self.isSeeking = false
      if finished, self.wantsPlayback, !self.userPaused {
        self.player.play()
        let rate = self.rates[self.rateIndex]
        if rate != 1.0 { self.player.rate = rate }
      }
    }
  }

  private func flashSeek(amount: Double, left: Bool) {
    seekFlashWorkItem?.cancel()
    seekFlashLabel.text = String(format: "%@%.0fs", amount < 0 ? "" : "+", amount)
    seekFlashLabel.isHidden = false
    seekFlashLabel.alpha = 1
    seekFlashLeading?.isActive = left
    seekFlashTrailing?.isActive = !left
    let work = DispatchWorkItem { [weak self] in
      UIView.animate(withDuration: 0.2) {
        self?.seekFlashLabel.alpha = 0
      } completion: { _ in
        self?.seekFlashLabel.isHidden = true
      }
    }
    seekFlashWorkItem = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.55, execute: work)
  }

  private func updatePlayPauseButton(playing: Bool) {
    playPauseButton.setImage(
      UIImage(systemName: playing ? "pause.fill" : "play.fill", withConfiguration: symbolConfig(20, .semibold)),
      for: .normal
    )
    playPauseButton.accessibilityLabel = playing ? "Pause" : "Play"
  }

  // MARK: - Chrome visibility

  private func showChrome(persistent: Bool) {
    hideChromeWorkItem?.cancel()
    chromeVisible = true
    chrome.isHidden = false
    UIView.animate(withDuration: 0.2) {
      self.chrome.alpha = 1
    }
    if !persistent, player.rate > 0 {
      scheduleHideChrome()
    }
  }

  private func hideChrome() {
    hideChromeWorkItem?.cancel()
    chromeVisible = false
    UIView.animate(withDuration: 0.25) {
      self.chrome.alpha = 0
    }
  }

  private func scheduleHideChrome() {
    hideChromeWorkItem?.cancel()
    let work = DispatchWorkItem { [weak self] in
      guard let self, self.player.rate > 0, !self.userPaused else { return }
      self.hideChrome()
    }
    hideChromeWorkItem = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 3.5, execute: work)
  }

  // MARK: - Teardown

  private func tearDownObservers() {
    hideChromeWorkItem?.cancel()
    seekFlashWorkItem?.cancel()
    if let timeObserver {
      player.removeTimeObserver(timeObserver)
    }
    timeObserver = nil
    if let endObserver {
      NotificationCenter.default.removeObserver(endObserver)
    }
    endObserver = nil
    if let interruptionObserver {
      NotificationCenter.default.removeObserver(interruptionObserver)
    }
    interruptionObserver = nil
    rateObserver?.invalidate()
    rateObserver = nil
    timeControlObserver?.invalidate()
    timeControlObserver = nil
    itemStatusObserver?.invalidate()
    itemStatusObserver = nil
  }

  private func notifyDismiss() {
    guard !didNotify else { return }
    didNotify = true
    wantsPlayback = false
    player.pause()
    tearDownObservers()
    NowPlayingSession.shared.tearDown()
    onDismiss?()
  }

  // MARK: - External WebVTT

  private func loadExternalSubtitlesIfNeeded() {
    guard let subtitleURL else { return }
    var request = URLRequest(url: subtitleURL)
    for (key, value) in subtitleHeaders {
      request.setValue(value, forHTTPHeaderField: key)
    }
    if request.value(forHTTPHeaderField: "Referer") == nil {
      request.setValue(subtitleURL.host.map { "https://\($0)/" }, forHTTPHeaderField: "Referer")
    }
    subtitleLoadTask = URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
      guard let self else { return }
      if let error {
        NSLog("[Saizen] subtitle fetch failed: %@", error.localizedDescription)
        return
      }
      let status = (response as? HTTPURLResponse)?.statusCode ?? -1
      guard let data, let text = String(data: data, encoding: .utf8), status == 200 || status == 206 else {
        NSLog("[Saizen] subtitle fetch bad status=%d", status)
        return
      }
      let cues = Self.parseWebVTT(text)
      DispatchQueue.main.async {
        self.subtitleCues = cues
        NSLog("[Saizen] subtitle cues loaded count=%d", cues.count)
      }
    }
    subtitleLoadTask?.resume()
  }

  private func updateSubtitle(at seconds: Double) {
    guard !subtitleCues.isEmpty else {
      if !subtitleLabel.isHidden {
        subtitleLabel.isHidden = true
        subtitleLabel.text = nil
      }
      return
    }
    if let cue = subtitleCues.first(where: { seconds >= $0.start && seconds < $0.end }) {
      if subtitleLabel.text != cue.text || subtitleLabel.isHidden {
        subtitleLabel.text = cue.text
        subtitleLabel.isHidden = false
      }
    } else if !subtitleLabel.isHidden {
      subtitleLabel.isHidden = true
      subtitleLabel.text = nil
    }
  }

  /// Minimal WebVTT cue parser (timestamps + text; ignores NOTE/STYLE/regions).
  private static func parseWebVTT(_ raw: String) -> [(start: Double, end: Double, text: String)] {
    var cues: [(start: Double, end: Double, text: String)] = []
    let normalized = raw.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
    let blocks = normalized.components(separatedBy: "\n\n")
    let arrow = "-->"
    for block in blocks {
      let lines = block.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
      guard let timingLine = lines.first(where: { $0.contains(arrow) }) else { continue }
      let parts = timingLine.components(separatedBy: arrow)
      guard parts.count >= 2,
            let start = parseVTTTimestamp(parts[0].trimmingCharacters(in: .whitespaces)),
            let end = parseVTTTimestamp(
              parts[1].split(whereSeparator: { $0.isWhitespace }).first.map(String.init) ?? ""
            )
      else { continue }
      let textLines = lines
        .drop(while: { !$0.contains(arrow) })
        .dropFirst()
        .map { $0.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression) }
        .filter { !$0.isEmpty }
      let text = textLines.joined(separator: "\n")
      guard !text.isEmpty else { continue }
      cues.append((start, end, text))
    }
    return cues
  }

  private static func parseVTTTimestamp(_ raw: String) -> Double? {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    let bits = trimmed.split(separator: ":").map(String.init)
    guard bits.count == 2 || bits.count == 3 else { return nil }
    let hours = bits.count == 3 ? Double(bits[0]) ?? 0 : 0
    let minutes = Double(bits[bits.count == 3 ? 1 : 0]) ?? 0
    let secParts = bits[bits.count == 3 ? 2 : 1].replacingOccurrences(of: ",", with: ".").split(separator: ".")
    let seconds = Double(secParts.first.map(String.init) ?? "0") ?? 0
    let frac: Double
    if secParts.count > 1 {
      let fracStr = String(secParts[1].prefix(3))
      let padded = fracStr.padding(toLength: 3, withPad: "0", startingAt: 0)
      frac = (Double(padded) ?? 0) / 1000
    } else {
      frac = 0
    }
    return hours * 3600 + minutes * 60 + seconds + frac
  }

  private static func formatSec(_ sec: Double) -> String {
    let total = max(0, Int(sec.rounded(.down)))
    let h = total / 3600
    let m = (total % 3600) / 60
    let s = total % 60
    if h > 0 {
      return String(format: "%d:%02d:%02d", h, m, s)
    }
    return String(format: "%d:%02d", m, s)
  }
}

// MARK: - Helpers

enum SaizenPlaybackAudio {
  static func activate() {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playback, mode: .moviePlayback, options: [])
      try session.setActive(true)
    } catch {
      NSLog("[Saizen] AVAudioSession activate failed: %@", error.localizedDescription)
    }
  }
}

private final class PlayerLayerView: UIView {
  override class var layerClass: AnyClass { AVPlayerLayer.self }
  var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
}

/// Chrome overlay that only intercepts hits on real controls.
private final class PassthroughChromeView: UIView {
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let hit = super.hitTest(point, with: event)
    return hit === self ? nil : hit
  }
}

private final class GradientFadeView: UIView {
  private let topHeavy: Bool

  init(topHeavy: Bool) {
    self.topHeavy = topHeavy
    super.init(frame: .zero)
    backgroundColor = .clear
    isOpaque = false
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) { fatalError() }

  override class var layerClass: AnyClass { CAGradientLayer.self }

  override func layoutSubviews() {
    super.layoutSubviews()
    guard let layer = layer as? CAGradientLayer else { return }
    layer.colors = topHeavy
      ? [UIColor.black.withAlphaComponent(0.55).cgColor, UIColor.clear.cgColor]
      : [UIColor.clear.cgColor, UIColor.black.withAlphaComponent(0.62).cgColor]
    layer.locations = [0, 1]
  }
}
