import AVKit
import UIKit

#if canImport(MobileVLCKit)
import MobileVLCKit
#endif

public enum PlayerHint: String {
  case vlc
  case avplayer
}

public final class PlayerRouter {
  public static func present(
    from presenter: UIViewController,
    url: URL,
    hint: PlayerHint,
    title: String?,
    context: PlaybackContext = PlaybackContext(anilistId: 0, episode: 0, idMal: nil),
    onDismiss: (() -> Void)? = nil
  ) {
    NSLog("[Saizen] PlayerRouter present hint=%@ url=%@", hint.rawValue, url.absoluteString)

    #if canImport(MobileVLCKit)
    let vlcAvailable = true
    #else
    let vlcAvailable = false
    #endif

    switch hint {
    case .avplayer:
      presentAVPlayer(from: presenter, url: url, title: title, context: context, onDismiss: onDismiss)
    case .vlc:
      if vlcAvailable {
        #if canImport(MobileVLCKit)
        presentVLC(from: presenter, url: url, title: title, context: context, onDismiss: onDismiss)
        #endif
      } else {
        NSLog("[Saizen] MobileVLCKit not linked — cannot play MKV/ASS via AVPlayer")
        presentMissingVLCAlert(from: presenter, url: url, title: title, context: context, onDismiss: onDismiss)
      }
    }
  }

  private static func presentMissingVLCAlert(
    from presenter: UIViewController,
    url: URL,
    title: String?,
    context: PlaybackContext,
    onDismiss: (() -> Void)?
  ) {
    let alert = UIAlertController(
      title: "VLC player required",
      message:
        "This stream is likely MKV (anime fansubs). AVPlayer cannot play it.\n\n"
        + "Add MobileVLCKit to the Podfile and run `pod install`, then rebuild.",
      preferredStyle: .alert
    )
    alert.addAction(UIAlertAction(title: "Dismiss", style: .cancel) { _ in
      onDismiss?()
    })
    alert.addAction(UIAlertAction(title: "Try AVPlayer anyway", style: .default) { _ in
      presentAVPlayer(from: presenter, url: url, title: title, context: context, onDismiss: onDismiss)
    })
    presenter.present(alert, animated: true)
  }

  private static func presentAVPlayer(
    from presenter: UIViewController,
    url: URL,
    title: String?,
    context: PlaybackContext,
    onDismiss: (() -> Void)?
  ) {
    let asset = AVURLAsset(url: url)
    let item = AVPlayerItem(asset: asset)
    let player = AVPlayer(playerItem: item)
    let vc = DismissAwareAVPlayerViewController()
    vc.player = player
    vc.title = title
    vc.onDismiss = onDismiss
    vc.playbackContext = context

    var observer: NSKeyValueObservation?
    observer = item.observe(\.status, options: [.new]) { item, _ in
      switch item.status {
      case .readyToPlay:
        NSLog("[Saizen] AVPlayerItem readyToPlay")
        player.play()
      case .failed:
        NSLog(
          "[Saizen] AVPlayerItem failed: %@ | log=%@",
          String(describing: item.error),
          String(describing: item.errorLog())
        )
      case .unknown:
        break
      @unknown default:
        break
      }
      if item.status != .unknown {
        observer?.invalidate()
      }
    }

    if context.isValid {
      let interval = CMTime(seconds: 2, preferredTimescale: 600)
      vc.timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) {
        [weak player] _ in
        guard let player else { return }
        let pos = player.currentTime().seconds
        let dur = player.currentItem?.duration.seconds ?? .nan
        guard pos.isFinite, dur.isFinite, dur >= 30 else { return }
        PlaybackProgressReporter.shared.emit(
          anilistId: context.anilistId,
          episode: context.episode,
          idMal: context.idMal,
          positionSec: pos,
          durationSec: dur
        )
      }
    }

    presenter.present(vc, animated: true)
  }

  #if canImport(MobileVLCKit)
  private static func presentVLC(
    from presenter: UIViewController,
    url: URL,
    title: String?,
    context: PlaybackContext,
    onDismiss: (() -> Void)?
  ) {
    let vc = VLCPlayerViewController(url: url, titleText: title, context: context)
    vc.onDismiss = onDismiss
    vc.modalPresentationStyle = .fullScreen
    presenter.present(vc, animated: true)
  }
  #endif
}

/// AVPlayer sheet that notifies when the user dismisses it.
final class DismissAwareAVPlayerViewController: AVPlayerViewController {
  var onDismiss: (() -> Void)?
  var playbackContext: PlaybackContext?
  var timeObserver: Any?
  private var didNotify = false
  private var hasAppeared = false

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    hasAppeared = true
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    // Avoid firing during presentation / transient hierarchy churn.
    guard hasAppeared, isBeingDismissed || presentingViewController == nil else { return }
    notifyDismiss()
  }

  deinit {
    if let timeObserver, let player {
      player.removeTimeObserver(timeObserver)
    }
  }

  private func notifyDismiss() {
    guard !didNotify else { return }
    didNotify = true
    if let timeObserver, let player {
      player.removeTimeObserver(timeObserver)
      self.timeObserver = nil
    }
    onDismiss?()
  }
}

#if canImport(MobileVLCKit)
/// Full-screen chrome host that lets taps through empty space to the video.
final class PlayerChromeView: UIView {
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let hit = super.hitTest(point, with: event)
    return hit === self ? nil : hit
  }
}

final class VLCPlayerViewController: UIViewController, VLCMediaPlayerDelegate {
  private let mediaPlayer = VLCMediaPlayer()
  private let url: URL
  private let titleText: String?
  private let playbackContext: PlaybackContext
  var onDismiss: (() -> Void)?
  private var didNotifyDismiss = false

  private let videoHost = UIView()
  /// Full-screen overlay that only intercepts hits on real controls (bars / pills).
  private let chrome = PlayerChromeView()
  private let topBar = UIStackView()
  private let bottomBar = UIStackView()
  private let titleLabel = UILabel()
  private let closeButton = UIButton(type: .system)
  private let nextEpisodeButton = UIButton(type: .system)
  private let playPauseButton = UIButton(type: .system)
  private let skipBack10Button = UIButton(type: .system)
  private let skipForward10Button = UIButton(type: .system)
  private let skipBack5Button = UIButton(type: .system)
  private let skipForward5Button = UIButton(type: .system)
  private let timeLabel = UILabel()
  private let durationLabel = UILabel()
  private let scrubber = UISlider()
  private let volumeButton = UIButton(type: .system)
  private let volumeSlider = UISlider()
  private let volumePanel = UIView()
  private let volumeValueLabel = UILabel()
  private var volumePanelVisible = false
  private var volumeBeforeMute: Float = 100
  private let speedButton = UIButton(type: .system)
  private let audioButton = UIButton(type: .system)
  private let subsButton = UIButton(type: .system)
  private let qualityButton = UIButton(type: .system)
  private let chipsScroll = UIScrollView()
  private let settingsRow = UIStackView()
  private let transportRow = UIStackView()
  private let seekRow = UIStackView()
  private let statsWrap = UIView()
  private let chipsAndVolumeRow = UIStackView()
  private let landscapeTopRow = UIStackView()
  private var bottomBlurView: UIView?
  private var lastLandscape: Bool?
  private let bufferingLabel = UILabel()
  private let torrentStatsLabel = UILabel()
  private let skipSegmentButton = UIButton(type: .system)
  private var statsTimer: Timer?
  private var isTorrentStream = false

  private var hideChromeWorkItem: DispatchWorkItem?
  private var isSeeking = false
  private var chromeVisible = true
  private var hasAppeared = false
  private let rates: [Float] = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0]
  private var rateIndex = 1
  private var didAutoSkipOp = false
  private var didAutoSkipEd = false
  private var activeSkipKind: String? // "op" | "ed"

  /// Warm gold matching web `--primary` / `--player-accent`.
  private let accent = UIColor(red: 0.91, green: 0.77, blue: 0.47, alpha: 1)

  init(url: URL, titleText: String?, context: PlaybackContext) {
    self.url = url
    self.titleText = titleText
    self.playbackContext = context
    self.isTorrentStream = url.host == "127.0.0.1" || url.host == "localhost"
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) { fatalError() }

  override var prefersStatusBarHidden: Bool { true }
  override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    configurePlayer()
    configureChrome()
    scheduleHideChrome()
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    hasAppeared = true
    startTorrentStatsPolling()
    applyOrientationChrome()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    applyOrientationChrome()
    centerChipsIfNeeded()
  }

  override func viewWillTransition(to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator) {
    super.viewWillTransition(to: size, with: coordinator)
    coordinator.animate(alongsideTransition: { _ in
      self.applyOrientationChrome()
    }, completion: { _ in
      self.centerChipsIfNeeded()
    })
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    // Do NOT stop/purge in viewWillDisappear — that raced presentation and
    // killed the loopback HTTP server while VLC was still on screen (slash icon).
    guard hasAppeared, isBeingDismissed || presentingViewController == nil else { return }
    hideChromeWorkItem?.cancel()
    stopTorrentStatsPolling()
    mediaPlayer.stop()
    notifyDismiss()
  }

  // MARK: - Setup

  private func configurePlayer() {
    videoHost.translatesAutoresizingMaskIntoConstraints = false
    videoHost.backgroundColor = .black
    view.insertSubview(videoHost, at: 0)
    NSLayoutConstraint.activate([
      videoHost.topAnchor.constraint(equalTo: view.topAnchor),
      videoHost.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      videoHost.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      videoHost.bottomAnchor.constraint(equalTo: view.bottomAnchor)
    ])

    mediaPlayer.delegate = self
    mediaPlayer.drawable = videoHost

    let media = VLCMedia(url: url)
    media.addOption(":network-caching=2500")
    media.addOption(":file-caching=2500")
    media.addOption(":http-reconnect")
    media.addOption(":http-seek-method=1")
    mediaPlayer.media = media
    mediaPlayer.audio?.volume = Int32(100)
    mediaPlayer.play()
    NSLog("[Saizen] VLCMediaPlayer play → %@", url.absoluteString)
  }

  private func configureChrome() {
    chrome.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(chrome)

    // Only the video surface toggles chrome — never steal button/slider taps.
    let videoTap = UITapGestureRecognizer(target: self, action: #selector(toggleChrome))
    videoHost.isUserInteractionEnabled = true
    videoHost.addGestureRecognizer(videoTap)

    styleChromeBars()

    NSLayoutConstraint.activate([
      chrome.topAnchor.constraint(equalTo: view.topAnchor),
      chrome.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      chrome.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      chrome.bottomAnchor.constraint(equalTo: view.bottomAnchor)
    ])
  }

  private func styleChromeBars() {
    topBar.axis = .horizontal
    topBar.alignment = .center
    topBar.spacing = 12
    topBar.translatesAutoresizingMaskIntoConstraints = false
    topBar.isLayoutMarginsRelativeArrangement = true
    topBar.layoutMargins = UIEdgeInsets(top: 6, left: 14, bottom: 8, right: 14)

    closeButton.setImage(UIImage(systemName: "xmark"), for: .normal)
    closeButton.tintColor = .white.withAlphaComponent(0.92)
    closeButton.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
    closeButton.accessibilityLabel = "Close"
    closeButton.widthAnchor.constraint(equalToConstant: 32).isActive = true
    closeButton.heightAnchor.constraint(equalToConstant: 32).isActive = true

    titleLabel.text = titleText ?? "Saizen"
    titleLabel.textColor = .white
    titleLabel.font = .systemFont(ofSize: 17, weight: .semibold)
    titleLabel.numberOfLines = 1
    titleLabel.lineBreakMode = .byTruncatingTail

    configureChip(nextEpisodeButton, title: "Next")
    nextEpisodeButton.addTarget(self, action: #selector(nextEpisodeTapped), for: .touchUpInside)
    nextEpisodeButton.isHidden = !playbackContext.options.hasNextEpisode
    nextEpisodeButton.accessibilityLabel = "Next episode"

    topBar.addArrangedSubview(closeButton)
    topBar.addArrangedSubview(titleLabel)
    topBar.addArrangedSubview(nextEpisodeButton)

    let topBlur = makeBlurContainer(embedding: topBar)
    chrome.addSubview(topBlur)

    // Transport
    playPauseButton.setImage(UIImage(systemName: "pause.fill"), for: .normal)
    playPauseButton.tintColor = .white
    playPauseButton.backgroundColor = accent.withAlphaComponent(0.95)
    playPauseButton.layer.cornerRadius = 26
    playPauseButton.clipsToBounds = true
    playPauseButton.addTarget(self, action: #selector(togglePlay), for: .touchUpInside)
    playPauseButton.accessibilityLabel = "Pause"

    configureSkipButton(skipBack5Button, systemName: "gobackward.5", action: #selector(skipBack5))
    configureSkipButton(skipBack10Button, systemName: "gobackward.10", action: #selector(skipBack10))
    configureSkipButton(skipForward10Button, systemName: "goforward.10", action: #selector(skipForward10))
    configureSkipButton(skipForward5Button, systemName: "goforward.5", action: #selector(skipForward5))

    playPauseButton.widthAnchor.constraint(equalToConstant: 52).isActive = true
    playPauseButton.heightAnchor.constraint(equalToConstant: 52).isActive = true

    timeLabel.font = .monospacedDigitSystemFont(ofSize: 12, weight: .medium)
    timeLabel.textColor = .white.withAlphaComponent(0.85)
    timeLabel.text = "0:00"
    timeLabel.setContentHuggingPriority(.required, for: .horizontal)

    durationLabel.font = .monospacedDigitSystemFont(ofSize: 12, weight: .medium)
    durationLabel.textColor = .white.withAlphaComponent(0.85)
    durationLabel.text = "0:00"
    durationLabel.setContentHuggingPriority(.required, for: .horizontal)

    scrubber.minimumValue = 0
    scrubber.maximumValue = 1
    scrubber.value = 0
    scrubber.minimumTrackTintColor = accent
    scrubber.maximumTrackTintColor = UIColor.white.withAlphaComponent(0.22)
    scrubber.addTarget(self, action: #selector(scrubBegan), for: .touchDown)
    scrubber.addTarget(self, action: #selector(scrubChanged), for: .valueChanged)
    scrubber.addTarget(self, action: #selector(scrubEnded), for: [.touchUpInside, .touchUpOutside, .touchCancel])

    seekRow.axis = .horizontal
    seekRow.alignment = .center
    seekRow.spacing = 8
    seekRow.arrangedSubviews.forEach { seekRow.removeArrangedSubview($0); $0.removeFromSuperview() }
    [timeLabel, scrubber, durationLabel].forEach { seekRow.addArrangedSubview($0) }

    configureChip(speedButton, title: "1×")
    speedButton.addTarget(self, action: #selector(pickSpeed), for: .touchUpInside)

    configureChip(audioButton, title: "Audio")
    audioButton.addTarget(self, action: #selector(pickAudio), for: .touchUpInside)

    configureChip(subsButton, title: "Subs")
    subsButton.addTarget(self, action: #selector(pickSubs), for: .touchUpInside)

    let qualityTitle: String = {
      if let res = playbackContext.options.resolution, !res.isEmpty { return res }
      return "Quality"
    }()
    configureChip(qualityButton, title: qualityTitle)
    qualityButton.addTarget(self, action: #selector(qualityTapped), for: .touchUpInside)

    configureChip(volumeButton, title: "Vol")
    volumeButton.addTarget(self, action: #selector(toggleVolumePanel), for: .touchUpInside)
    volumeButton.accessibilityLabel = "Volume"

    // Chips scroll; volume stays pinned so it never clips off in portrait.
    chipsScroll.showsHorizontalScrollIndicator = false
    chipsScroll.alwaysBounceHorizontal = true
    chipsScroll.delaysContentTouches = false
    chipsScroll.canCancelContentTouches = false
    chipsScroll.translatesAutoresizingMaskIntoConstraints = false

    settingsRow.axis = .horizontal
    settingsRow.alignment = .center
    settingsRow.spacing = 8
    settingsRow.translatesAutoresizingMaskIntoConstraints = false
    settingsRow.arrangedSubviews.forEach { settingsRow.removeArrangedSubview($0); $0.removeFromSuperview() }
    [speedButton, audioButton, subsButton, qualityButton].forEach {
      settingsRow.addArrangedSubview($0)
    }
    chipsScroll.subviews.forEach { $0.removeFromSuperview() }
    chipsScroll.addSubview(settingsRow)
    NSLayoutConstraint.activate([
      settingsRow.topAnchor.constraint(equalTo: chipsScroll.contentLayoutGuide.topAnchor),
      settingsRow.leadingAnchor.constraint(equalTo: chipsScroll.contentLayoutGuide.leadingAnchor),
      settingsRow.trailingAnchor.constraint(equalTo: chipsScroll.contentLayoutGuide.trailingAnchor),
      settingsRow.bottomAnchor.constraint(equalTo: chipsScroll.contentLayoutGuide.bottomAnchor),
      settingsRow.heightAnchor.constraint(equalTo: chipsScroll.frameLayoutGuide.heightAnchor)
    ])
    chipsScroll.heightAnchor.constraint(equalToConstant: 36).isActive = true

    chipsAndVolumeRow.axis = .horizontal
    chipsAndVolumeRow.alignment = .center
    chipsAndVolumeRow.spacing = 8
    chipsAndVolumeRow.arrangedSubviews.forEach { chipsAndVolumeRow.removeArrangedSubview($0); $0.removeFromSuperview() }
    chipsAndVolumeRow.addArrangedSubview(chipsScroll)
    chipsAndVolumeRow.addArrangedSubview(volumeButton)
    chipsScroll.setContentHuggingPriority(.defaultLow, for: .horizontal)
    chipsScroll.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    volumeButton.setContentHuggingPriority(.required, for: .horizontal)
    volumeButton.setContentCompressionResistancePriority(.required, for: .horizontal)

    transportRow.axis = .horizontal
    transportRow.alignment = .center
    transportRow.spacing = 14
    transportRow.distribution = .equalCentering
    transportRow.arrangedSubviews.forEach { transportRow.removeArrangedSubview($0); $0.removeFromSuperview() }
    [skipBack5Button, skipBack10Button, playPauseButton, skipForward10Button, skipForward5Button].forEach {
      transportRow.addArrangedSubview($0)
    }

    torrentStatsLabel.text = ""
    torrentStatsLabel.textColor = .white.withAlphaComponent(0.78)
    torrentStatsLabel.font = .monospacedDigitSystemFont(ofSize: 11, weight: .medium)
    torrentStatsLabel.textAlignment = .center
    torrentStatsLabel.numberOfLines = 1
    torrentStatsLabel.isHidden = !isTorrentStream
    torrentStatsLabel.backgroundColor = UIColor.white.withAlphaComponent(0.08)
    torrentStatsLabel.layer.cornerRadius = 10
    torrentStatsLabel.clipsToBounds = true
    torrentStatsLabel.translatesAutoresizingMaskIntoConstraints = false
    statsWrap.subviews.forEach { $0.removeFromSuperview() }
    statsWrap.addSubview(torrentStatsLabel)
    NSLayoutConstraint.activate([
      torrentStatsLabel.topAnchor.constraint(equalTo: statsWrap.topAnchor),
      torrentStatsLabel.bottomAnchor.constraint(equalTo: statsWrap.bottomAnchor),
      torrentStatsLabel.leadingAnchor.constraint(equalTo: statsWrap.leadingAnchor),
      torrentStatsLabel.trailingAnchor.constraint(equalTo: statsWrap.trailingAnchor),
      torrentStatsLabel.heightAnchor.constraint(greaterThanOrEqualToConstant: 22)
    ])

    bottomBar.axis = .vertical
    bottomBar.spacing = 8
    bottomBar.translatesAutoresizingMaskIntoConstraints = false
    bottomBar.isLayoutMarginsRelativeArrangement = true
    bottomBar.layoutMargins = UIEdgeInsets(top: 8, left: 12, bottom: 8, right: 12)
    bottomBar.arrangedSubviews.forEach { bottomBar.removeArrangedSubview($0); $0.removeFromSuperview() }
    bottomBar.addArrangedSubview(seekRow)
    bottomBar.addArrangedSubview(transportRow)
    if isTorrentStream {
      bottomBar.addArrangedSubview(statsWrap)
    }
    bottomBar.addArrangedSubview(chipsAndVolumeRow)

    let bottomBlur = makeBlurContainer(embedding: bottomBar)
    bottomBlurView = bottomBlur
    chrome.addSubview(bottomBlur)

    configureVolumePanel(above: bottomBlur)

    bufferingLabel.text = isTorrentStream ? "Buffering stream…" : "Buffering…"
    bufferingLabel.textColor = .white.withAlphaComponent(0.92)
    bufferingLabel.font = .systemFont(ofSize: 15, weight: .semibold)
    bufferingLabel.textAlignment = .center
    bufferingLabel.translatesAutoresizingMaskIntoConstraints = false
    bufferingLabel.isHidden = false
    chrome.addSubview(bufferingLabel)

    skipSegmentButton.addTarget(self, action: #selector(skipSegmentTapped), for: .touchUpInside)
    skipSegmentButton.translatesAutoresizingMaskIntoConstraints = false
    skipSegmentButton.isHidden = true
    chrome.addSubview(skipSegmentButton)
    skipSegmentButton.configuration = {
      var cfg = UIButton.Configuration.filled()
      cfg.baseBackgroundColor = accent
      cfg.baseForegroundColor = UIColor(white: 0.12, alpha: 1)
      cfg.cornerStyle = .capsule
      cfg.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16)
      cfg.title = "Skip Opening"
      cfg.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
        var out = incoming
        out.font = .systemFont(ofSize: 14, weight: .semibold)
        return out
      }
      return cfg
    }()

    NSLayoutConstraint.activate([
      // Sit flush under the notch / status area — no empty safe-area band above the bar.
      topBlur.topAnchor.constraint(equalTo: chrome.safeAreaLayoutGuide.topAnchor),
      topBlur.leadingAnchor.constraint(equalTo: chrome.leadingAnchor),
      topBlur.trailingAnchor.constraint(equalTo: chrome.trailingAnchor),

      bottomBlur.leadingAnchor.constraint(equalTo: chrome.leadingAnchor),
      bottomBlur.trailingAnchor.constraint(equalTo: chrome.trailingAnchor),
      bottomBlur.bottomAnchor.constraint(equalTo: chrome.bottomAnchor),

      bufferingLabel.centerXAnchor.constraint(equalTo: chrome.centerXAnchor),
      bufferingLabel.bottomAnchor.constraint(equalTo: bottomBlur.topAnchor, constant: -16),
      bufferingLabel.leadingAnchor.constraint(greaterThanOrEqualTo: chrome.leadingAnchor, constant: 24),
      bufferingLabel.trailingAnchor.constraint(lessThanOrEqualTo: chrome.trailingAnchor, constant: -24),

      skipSegmentButton.centerXAnchor.constraint(equalTo: chrome.centerXAnchor),
      skipSegmentButton.bottomAnchor.constraint(equalTo: bottomBlur.topAnchor, constant: -12)
    ])

    applyOrientationChrome()
  }

  private func applyOrientationChrome() {
    let landscape = view.bounds.width > view.bounds.height
    let bottomInset = max(view.safeAreaInsets.bottom, landscape ? 6 : 10)

    // Keep top chrome tight — only a few points of padding inside the bar.
    topBar.layoutMargins = UIEdgeInsets(
      top: 6,
      left: landscape ? 20 : 14,
      bottom: 8,
      right: landscape ? 20 : 14
    )
    bottomBar.spacing = landscape ? 4 : 8
    bottomBar.layoutMargins = UIEdgeInsets(
      top: landscape ? 6 : 10,
      left: landscape ? 20 : 12,
      bottom: bottomInset,
      right: landscape ? 20 : 12
    )
    transportRow.spacing = landscape ? 18 : 14

    let playSize: CGFloat = landscape ? 40 : 52
    for c in playPauseButton.constraints where c.firstAttribute == .width || c.firstAttribute == .height {
      c.constant = playSize
    }
    playPauseButton.layer.cornerRadius = playSize / 2

    torrentStatsLabel.font = .monospacedDigitSystemFont(ofSize: landscape ? 10 : 11, weight: .medium)

    // Rebuild bottom stack only when orientation actually flips.
    if lastLandscape != landscape {
      lastLandscape = landscape
      bottomBar.arrangedSubviews.forEach {
        bottomBar.removeArrangedSubview($0)
        $0.removeFromSuperview()
      }
      landscapeTopRow.arrangedSubviews.forEach {
        landscapeTopRow.removeArrangedSubview($0)
        $0.removeFromSuperview()
      }

      if landscape {
        // Seek + transport share one row → much shorter chrome band.
        landscapeTopRow.axis = .horizontal
        landscapeTopRow.alignment = .center
        landscapeTopRow.spacing = 16
        landscapeTopRow.addArrangedSubview(seekRow)
        landscapeTopRow.addArrangedSubview(transportRow)
        seekRow.setContentHuggingPriority(.defaultLow, for: .horizontal)
        seekRow.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        transportRow.setContentHuggingPriority(.required, for: .horizontal)
        transportRow.setContentCompressionResistancePriority(.required, for: .horizontal)
        bottomBar.addArrangedSubview(landscapeTopRow)
        if isTorrentStream {
          bottomBar.addArrangedSubview(statsWrap)
        }
        bottomBar.addArrangedSubview(chipsAndVolumeRow)
      } else {
        bottomBar.addArrangedSubview(seekRow)
        bottomBar.addArrangedSubview(transportRow)
        if isTorrentStream {
          bottomBar.addArrangedSubview(statsWrap)
        }
        bottomBar.addArrangedSubview(chipsAndVolumeRow)
      }
    }
  }

  private func centerChipsIfNeeded() {
    chipsScroll.layoutIfNeeded()
    settingsRow.layoutIfNeeded()
    let contentW = settingsRow.bounds.width
    let scrollW = chipsScroll.bounds.width
    guard scrollW > 0 else { return }
    if contentW > 0, contentW < scrollW - 1 {
      let inset = (scrollW - contentW) / 2
      chipsScroll.contentInset = UIEdgeInsets(top: 0, left: inset, bottom: 0, right: inset)
      chipsScroll.contentOffset = CGPoint(x: -inset, y: 0)
    } else {
      chipsScroll.contentInset = .zero
    }
  }

  private func configureSkipButton(_ button: UIButton, systemName: String, action: Selector) {
    button.setImage(UIImage(systemName: systemName), for: .normal)
    button.tintColor = .white
    button.addTarget(self, action: action, for: .touchUpInside)
    button.contentVerticalAlignment = .fill
    button.contentHorizontalAlignment = .fill
    button.widthAnchor.constraint(equalToConstant: 34).isActive = true
    button.heightAnchor.constraint(equalToConstant: 34).isActive = true
  }

  private func configureVolumePanel(above bottomBlur: UIView) {
    volumePanel.translatesAutoresizingMaskIntoConstraints = false
    volumePanel.backgroundColor = UIColor(white: 0.08, alpha: 0.92)
    volumePanel.layer.cornerRadius = 18
    volumePanel.layer.borderWidth = 1
    volumePanel.layer.borderColor = UIColor.white.withAlphaComponent(0.16).cgColor
    volumePanel.clipsToBounds = true
    volumePanel.isHidden = true
    volumePanel.alpha = 0
    chrome.addSubview(volumePanel)

    volumeValueLabel.translatesAutoresizingMaskIntoConstraints = false
    volumeValueLabel.textColor = .white
    volumeValueLabel.font = .monospacedDigitSystemFont(ofSize: 13, weight: .semibold)
    volumeValueLabel.textAlignment = .center
    volumeValueLabel.text = "100%"
    volumePanel.addSubview(volumeValueLabel)

    let sliderHost = UIView()
    sliderHost.translatesAutoresizingMaskIntoConstraints = false
    volumePanel.addSubview(sliderHost)

    volumeSlider.minimumValue = 0
    volumeSlider.maximumValue = 200
    volumeSlider.value = 100
    volumeSlider.minimumTrackTintColor = accent
    volumeSlider.maximumTrackTintColor = UIColor.white.withAlphaComponent(0.25)
    volumeSlider.isContinuous = true
    volumeSlider.addTarget(self, action: #selector(volumeChanged), for: .valueChanged)
    volumeSlider.translatesAutoresizingMaskIntoConstraints = false
    // Rotate so drag is vertical with a tall touch target.
    volumeSlider.transform = CGAffineTransform(rotationAngle: -.pi / 2)
    sliderHost.addSubview(volumeSlider)

    let muteBtn = UIButton(type: .system)
    muteBtn.translatesAutoresizingMaskIntoConstraints = false
    muteBtn.setImage(UIImage(systemName: "speaker.slash.fill"), for: .normal)
    muteBtn.tintColor = .white.withAlphaComponent(0.9)
    muteBtn.addTarget(self, action: #selector(muteTapped), for: .touchUpInside)
    muteBtn.accessibilityLabel = "Mute"
    volumePanel.addSubview(muteBtn)

    NSLayoutConstraint.activate([
      volumePanel.widthAnchor.constraint(equalToConstant: 56),
      volumePanel.heightAnchor.constraint(equalToConstant: 220),
      volumePanel.trailingAnchor.constraint(equalTo: chrome.safeAreaLayoutGuide.trailingAnchor, constant: -14),
      volumePanel.bottomAnchor.constraint(equalTo: bottomBlur.topAnchor, constant: -12),

      volumeValueLabel.topAnchor.constraint(equalTo: volumePanel.topAnchor, constant: 12),
      volumeValueLabel.leadingAnchor.constraint(equalTo: volumePanel.leadingAnchor, constant: 4),
      volumeValueLabel.trailingAnchor.constraint(equalTo: volumePanel.trailingAnchor, constant: -4),

      muteBtn.bottomAnchor.constraint(equalTo: volumePanel.bottomAnchor, constant: -10),
      muteBtn.centerXAnchor.constraint(equalTo: volumePanel.centerXAnchor),
      muteBtn.widthAnchor.constraint(equalToConstant: 28),
      muteBtn.heightAnchor.constraint(equalToConstant: 28),

      sliderHost.topAnchor.constraint(equalTo: volumeValueLabel.bottomAnchor, constant: 6),
      sliderHost.bottomAnchor.constraint(equalTo: muteBtn.topAnchor, constant: -6),
      sliderHost.leadingAnchor.constraint(equalTo: volumePanel.leadingAnchor),
      sliderHost.trailingAnchor.constraint(equalTo: volumePanel.trailingAnchor),

      // Pre-rotation frame: wide short → becomes tall after -90°.
      volumeSlider.centerXAnchor.constraint(equalTo: sliderHost.centerXAnchor),
      volumeSlider.centerYAnchor.constraint(equalTo: sliderHost.centerYAnchor),
      volumeSlider.widthAnchor.constraint(equalToConstant: 140),
      volumeSlider.heightAnchor.constraint(equalToConstant: 36)
    ])

    refreshVolumeButtonTitle()
  }

  private func configureChip(_ button: UIButton, title: String) {
    // Prefer classic UIButton styling — UIButton.Configuration was compressing
    // chip widths and wrapping titles into a single vertical column.
    button.configuration = nil
    button.setTitle(title, for: .normal)
    button.titleLabel?.font = .systemFont(ofSize: 13, weight: .semibold)
    button.titleLabel?.lineBreakMode = .byClipping
    button.titleLabel?.numberOfLines = 1
    button.setTitleColor(.white, for: .normal)
    button.tintColor = .white
    button.backgroundColor = UIColor.white.withAlphaComponent(0.12)
    button.layer.cornerRadius = 16
    button.layer.borderWidth = 1
    button.layer.borderColor = UIColor.white.withAlphaComponent(0.14).cgColor
    button.clipsToBounds = true
      button.contentEdgeInsets = UIEdgeInsets(top: 8, left: 14, bottom: 8, right: 14)
    button.setContentHuggingPriority(.required, for: .horizontal)
    button.setContentCompressionResistancePriority(.required, for: .horizontal)
  }

  private func refreshVolumeButtonTitle() {
    let pct = Int(round(volumeSlider.value))
    let symbol = pct <= 0 ? "speaker.slash.fill" : "speaker.wave.2.fill"
    volumeButton.configuration = nil
    volumeButton.setImage(UIImage(systemName: symbol), for: .normal)
    volumeButton.setTitle(" \(pct)%", for: .normal)
    volumeButton.titleLabel?.font = .systemFont(ofSize: 13, weight: .semibold)
    volumeButton.titleLabel?.lineBreakMode = .byClipping
    volumeButton.titleLabel?.numberOfLines = 1
    volumeButton.setTitleColor(.white, for: .normal)
    volumeButton.tintColor = .white
    volumeButton.backgroundColor = UIColor.white.withAlphaComponent(0.12)
    volumeButton.layer.cornerRadius = 16
    volumeButton.layer.borderWidth = 1
    volumeButton.layer.borderColor = UIColor.white.withAlphaComponent(0.14).cgColor
    volumeButton.clipsToBounds = true
      volumeButton.contentEdgeInsets = UIEdgeInsets(top: 8, left: 12, bottom: 8, right: 14)
    volumeButton.setContentHuggingPriority(.required, for: .horizontal)
    volumeButton.setContentCompressionResistancePriority(.required, for: .horizontal)
  }

  @objc private func toggleVolumePanel() {
    if volumePanelVisible {
      hideVolumePanel()
      scheduleHideChrome()
    } else {
      showVolumePanel()
    }
  }

  private func showVolumePanel() {
    showChrome(persistent: true)
    volumePanelVisible = true
    volumePanel.isHidden = false
    UIView.animate(withDuration: 0.18) {
      self.volumePanel.alpha = 1
    }
  }

  private func hideVolumePanel() {
    guard volumePanelVisible || !volumePanel.isHidden else { return }
    volumePanelVisible = false
    UIView.animate(withDuration: 0.15, animations: {
      self.volumePanel.alpha = 0
    }, completion: { _ in
      if !self.volumePanelVisible {
        self.volumePanel.isHidden = true
      }
    })
  }

  private func makeBlurContainer(embedding content: UIView) -> UIView {
    let blur = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterialDark))
    blur.translatesAutoresizingMaskIntoConstraints = false
    content.translatesAutoresizingMaskIntoConstraints = false
    blur.contentView.addSubview(content)
    NSLayoutConstraint.activate([
      content.topAnchor.constraint(equalTo: blur.contentView.topAnchor),
      content.leadingAnchor.constraint(equalTo: blur.contentView.leadingAnchor),
      content.trailingAnchor.constraint(equalTo: blur.contentView.trailingAnchor),
      content.bottomAnchor.constraint(equalTo: blur.contentView.bottomAnchor)
    ])
    return blur
  }

  // MARK: - Actions

  @objc private func closeTapped() {
    hideChromeWorkItem?.cancel()
    stopTorrentStatsPolling()
    mediaPlayer.stop()
    dismiss(animated: true) { [weak self] in
      self?.notifyDismiss()
    }
  }

  private func notifyDismiss() {
    guard !didNotifyDismiss else { return }
    didNotifyDismiss = true
    stopTorrentStatsPolling()
    onDismiss?()
  }

  @objc private func nextEpisodeTapped() {
    emitActionAndClose("nextEpisode")
  }

  @objc private func qualityTapped() {
    let res = playbackContext.options.resolution ?? "Unknown"
    let label = playbackContext.options.sourceLabel
    let message = label.map { "\($0)\nCurrent: \(res)" } ?? "Current: \(res)"
    showChrome(persistent: true)
    let sheet = UIAlertController(title: "Quality", message: message, preferredStyle: .actionSheet)
    sheet.addAction(UIAlertAction(title: "OK", style: .cancel) { [weak self] _ in
      self?.scheduleHideChrome()
    })
    if let pop = sheet.popoverPresentationController {
      pop.sourceView = qualityButton
      pop.sourceRect = qualityButton.bounds
    }
    present(sheet, animated: true)
  }

  private func emitActionAndClose(_ action: String) {
    PlaybackProgressReporter.shared.emitPlayerAction(
      action,
      anilistId: playbackContext.anilistId,
      episode: playbackContext.episode
    )
    hideChromeWorkItem?.cancel()
    stopTorrentStatsPolling()
    mediaPlayer.stop()
    dismiss(animated: true) { [weak self] in
      self?.notifyDismiss()
    }
  }

  // MARK: - Torrent stats HUD

  private func startTorrentStatsPolling() {
    guard isTorrentStream else { return }
    stopTorrentStatsPolling()
    let timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
      self?.refreshTorrentStats()
    }
    RunLoop.main.add(timer, forMode: .common)
    statsTimer = timer
    refreshTorrentStats()
  }

  private func stopTorrentStatsPolling() {
    statsTimer?.invalidate()
    statsTimer = nil
  }

  private func refreshTorrentStats() {
    Task {
      let info = await SaizenPlayback.engine.torrentInfo(hash: "")
      await MainActor.run { [weak self] in
        self?.applyTorrentStats(info)
      }
    }
  }

  private func applyTorrentStats(_ info: [String: Any]) {
    let peersDict = info["peers"] as? [String: Any]
    let peers = Int(Self.intValue(peersDict, "wires") ?? Self.intValue(peersDict, "seeders") ?? 0)
    let speed = Self.intValue(info["speed"] as? [String: Any], "down") ?? 0
    let size = info["size"] as? [String: Any]
    let downloaded = Self.intValue(size, "downloaded") ?? 0
    let total = Self.intValue(size, "total") ?? 0
    let progress = info["progress"] as? Double ?? 0
    let pct = Int(min(1, max(0, progress)) * 100)

    let playing = mediaPlayer.isPlaying
    let state = mediaPlayer.state
    let waiting = !playing && (state == .buffering || state == .opening || state == .stopped)

    if waiting {
      bufferingLabel.isHidden = false
      bufferingLabel.text = peers > 0 ? "Buffering stream…" : "Connecting to peers…"
      showChrome(persistent: true)
    } else if playing {
      bufferingLabel.isHidden = true
    }

    torrentStatsLabel.isHidden = false
    torrentStatsLabel.alpha = waiting ? 1 : 0.85
    let line =
      "  \(peers) peers · \(Self.formatRate(speed)) · \(Self.formatBytes(downloaded))"
      + (total > 0 ? "/\(Self.formatBytes(total))" : "")
      + (pct > 0 ? " · \(pct)%  " : "  ")
    torrentStatsLabel.text = line
  }

  private static func intValue(_ dict: [String: Any]?, _ key: String) -> Int64? {
    guard let v = dict?[key] else { return nil }
    if let i = v as? Int64 { return i }
    if let i = v as? Int { return Int64(i) }
    if let d = v as? Double { return Int64(d) }
    if let n = v as? NSNumber { return n.int64Value }
    return nil
  }

  private static func formatBytes(_ n: Int64) -> String {
    if n >= 1024 * 1024 * 1024 {
      return String(format: "%.1f GB", Double(n) / (1024 * 1024 * 1024))
    }
    if n >= 1024 * 1024 {
      return String(format: "%.1f MB", Double(n) / (1024 * 1024))
    }
    if n >= 1024 {
      return String(format: "%.0f KB", Double(n) / 1024)
    }
    return "\(n) B"
  }

  private static func formatRate(_ bytesPerSec: Int64) -> String {
    if bytesPerSec <= 0 { return "0 KB/s" }
    if bytesPerSec >= 1024 * 1024 {
      return String(format: "%.1f MB/s", Double(bytesPerSec) / (1024 * 1024))
    }
    return String(format: "%.0f KB/s", Double(bytesPerSec) / 1024)
  }

  @objc private func togglePlay() {
    if mediaPlayer.isPlaying {
      mediaPlayer.pause()
      playPauseButton.setImage(UIImage(systemName: "play.fill"), for: .normal)
      playPauseButton.accessibilityLabel = "Play"
      showChrome(persistent: true)
    } else {
      mediaPlayer.play()
      playPauseButton.setImage(UIImage(systemName: "pause.fill"), for: .normal)
      playPauseButton.accessibilityLabel = "Pause"
      scheduleHideChrome()
    }
  }

  @objc private func skipBack5() { seekBy(seconds: -5) }
  @objc private func skipBack10() { seekBy(seconds: -10) }
  @objc private func skipForward5() { seekBy(seconds: 5) }
  @objc private func skipForward10() { seekBy(seconds: 10) }

  private func seekBy(seconds: Int32) {
    let current = mediaPlayer.time.intValue
    let length = mediaPlayer.media?.length.intValue ?? 0
    guard length > 0 else { return }
    let next = max(0, min(length, current + seconds * 1000))
    mediaPlayer.time = VLCTime(int: next)
    updateTimeLabels()
    scheduleHideChrome()
  }

  private func seekToSeconds(_ seconds: Double) {
    let length = mediaPlayer.media?.length.intValue ?? 0
    guard length > 0 else { return }
    let ms = Int32(max(0, min(Double(length), seconds * 1000)))
    mediaPlayer.time = VLCTime(int: ms)
    updateTimeLabels()
  }

  @objc private func skipSegmentTapped() {
    guard let kind = activeSkipKind else { return }
    let opts = playbackContext.options
    if kind == "op", let op = opts.op {
      seekToSeconds(op.end)
      didAutoSkipOp = true
    } else if kind == "ed", let ed = opts.ed {
      seekToSeconds(ed.end)
      didAutoSkipEd = true
    }
    skipSegmentButton.isHidden = true
    activeSkipKind = nil
    scheduleHideChrome()
  }

  @objc private func scrubBegan() {
    isSeeking = true
    hideChromeWorkItem?.cancel()
  }

  @objc private func scrubChanged() {
    let length = mediaPlayer.media?.length.intValue ?? 0
    if length > 0 {
      let ms = Int32(Float(length) * scrubber.value)
      timeLabel.text = Self.formatMs(ms)
    }
  }

  @objc private func scrubEnded() {
    mediaPlayer.position = scrubber.value
    isSeeking = false
    // Allow auto-skip again if user scrubbed before an interval.
    let t = Double(mediaPlayer.time.intValue) / 1000.0
    if let op = playbackContext.options.op, t < op.start { didAutoSkipOp = false }
    if let ed = playbackContext.options.ed, t < ed.start { didAutoSkipEd = false }
    scheduleHideChrome()
  }

  @objc private func volumeChanged() {
    mediaPlayer.audio?.volume = Int32(volumeSlider.value)
    volumeValueLabel.text = "\(Int(round(volumeSlider.value)))%"
    refreshVolumeButtonTitle()
    showChrome(persistent: true)
  }

  @objc private func muteTapped() {
    if volumeSlider.value > 0 {
      volumeBeforeMute = volumeSlider.value
      volumeSlider.value = 0
    } else {
      volumeSlider.value = volumeBeforeMute > 0 ? volumeBeforeMute : 100
    }
    volumeChanged()
  }

  @objc private func pickSpeed() {
    showChrome(persistent: true)
    let sheet = UIAlertController(title: "Playback speed", message: nil, preferredStyle: .actionSheet)
    for (i, rate) in rates.enumerated() {
      let label = rate == 1.0 ? "1×" : String(format: "%g×", rate)
      let mark = i == rateIndex ? " ✓" : ""
      sheet.addAction(UIAlertAction(title: label + mark, style: .default) { [weak self] _ in
        guard let self else { return }
        self.rateIndex = i
        self.mediaPlayer.rate = rate
        self.configureChip(self.speedButton, title: label)
        self.scheduleHideChrome()
      })
    }
    sheet.addAction(UIAlertAction(title: "Cancel", style: .cancel) { [weak self] _ in
      self?.scheduleHideChrome()
    })
    if let pop = sheet.popoverPresentationController {
      pop.sourceView = speedButton
      pop.sourceRect = speedButton.bounds
    }
    present(sheet, animated: true)
  }

  @objc private func pickAudio() {
    presentTrackPicker(
      title: "Audio track",
      indexes: mediaPlayer.audioTrackIndexes as? [NSNumber] ?? [],
      names: mediaPlayer.audioTrackNames as? [String] ?? [],
      current: mediaPlayer.currentAudioTrackIndex
    ) { [weak self] index in
      self?.mediaPlayer.currentAudioTrackIndex = Int32(index)
    }
  }

  @objc private func pickSubs() {
    var indexes = (mediaPlayer.videoSubTitlesIndexes as? [NSNumber] ?? []).map(\.intValue)
    var names = mediaPlayer.videoSubTitlesNames as? [String] ?? []
    // VLC uses -1 for "Disable"
    if !indexes.contains(-1) {
      indexes.insert(-1, at: 0)
      names.insert("Off", at: 0)
    }
    presentTrackPicker(
      title: "Subtitles",
      indexes: indexes.map { NSNumber(value: $0) },
      names: names,
      current: mediaPlayer.currentVideoSubTitleIndex
    ) { [weak self] index in
      self?.mediaPlayer.currentVideoSubTitleIndex = Int32(index)
    }
  }

  private func presentTrackPicker(
    title: String,
    indexes: [NSNumber],
    names: [String],
    current: Int32,
    onPick: @escaping (Int) -> Void
  ) {
    showChrome(persistent: true)
    let sheet = UIAlertController(title: title, message: nil, preferredStyle: .actionSheet)
    let count = min(indexes.count, names.count)
    if count == 0 {
      sheet.message = "No tracks available yet — wait for the stream to buffer."
    }
    for i in 0..<count {
      let idx = indexes[i].intValue
      let name = names[i].isEmpty ? "Track \(idx)" : names[i]
      let mark = idx == Int(current) ? " ✓" : ""
      sheet.addAction(UIAlertAction(title: name + mark, style: .default) { _ in
        onPick(idx)
        self.scheduleHideChrome()
      })
    }
    sheet.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in
      self.scheduleHideChrome()
    })
    if let pop = sheet.popoverPresentationController {
      pop.sourceView = chrome
      pop.sourceRect = CGRect(x: chrome.bounds.midX, y: chrome.bounds.maxY - 80, width: 1, height: 1)
    }
    present(sheet, animated: true)
  }

  @objc private func toggleChrome() {
    if chromeVisible {
      hideChrome()
    } else {
      showChrome(persistent: !mediaPlayer.isPlaying)
      if mediaPlayer.isPlaying { scheduleHideChrome() }
    }
  }

  private func showChrome(persistent: Bool) {
    hideChromeWorkItem?.cancel()
    chromeVisible = true
    chrome.isUserInteractionEnabled = true
    UIView.animate(withDuration: 0.2) {
      self.chrome.alpha = 1
    }
    if !persistent { scheduleHideChrome() }
  }

  private func hideChrome() {
    hideChromeWorkItem?.cancel()
    chromeVisible = false
    hideVolumePanel()
    UIView.animate(withDuration: 0.25) {
      self.chrome.alpha = 0
    } completion: { _ in
      if !self.chromeVisible {
        self.chrome.isUserInteractionEnabled = false
      }
    }
  }

  private func scheduleHideChrome() {
    hideChromeWorkItem?.cancel()
    guard mediaPlayer.isPlaying else { return }
    // Keep chrome up while adjusting volume.
    if volumePanelVisible { return }
    let work = DispatchWorkItem { [weak self] in
      guard let self else { return }
      if self.volumePanelVisible { return }
      self.hideChrome()
    }
    hideChromeWorkItem = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 4.5, execute: work)
  }

  private func updateTimeLabels() {
    let current = mediaPlayer.time.intValue
    let length = mediaPlayer.media?.length.intValue ?? 0
    timeLabel.text = Self.formatMs(current)
    durationLabel.text = Self.formatMs(length)
    if !isSeeking, length > 0 {
      scrubber.value = Float(current) / Float(length)
    }
    let t = Double(current) / 1000.0
    updateSkipUI(at: t)
    if playbackContext.isValid, length > 0 {
      PlaybackProgressReporter.shared.emit(
        anilistId: playbackContext.anilistId,
        episode: playbackContext.episode,
        idMal: playbackContext.idMal,
        positionSec: t,
        durationSec: Double(length) / 1000.0
      )
    }
  }

  private func setSkipPillTitle(_ title: String) {
    guard var cfg = skipSegmentButton.configuration else {
      skipSegmentButton.setTitle(title, for: .normal)
      return
    }
    cfg.title = title
    skipSegmentButton.configuration = cfg
  }

  private func updateSkipUI(at t: Double) {
    let opts = playbackContext.options
    if let op = opts.op, op.contains(t) {
      activeSkipKind = "op"
      setSkipPillTitle("Skip Opening")
      skipSegmentButton.isHidden = false
      if opts.autoSkipOpEd, !didAutoSkipOp {
        didAutoSkipOp = true
        seekToSeconds(op.end)
        skipSegmentButton.isHidden = true
        activeSkipKind = nil
      }
      return
    }
    if let ed = opts.ed, ed.contains(t) {
      activeSkipKind = "ed"
      setSkipPillTitle("Skip Ending")
      skipSegmentButton.isHidden = false
      if opts.autoSkipOpEd, !didAutoSkipEd {
        didAutoSkipEd = true
        seekToSeconds(ed.end)
        skipSegmentButton.isHidden = true
        activeSkipKind = nil
      }
      return
    }
    activeSkipKind = nil
    skipSegmentButton.isHidden = true
  }

  private static func formatMs(_ ms: Int32) -> String {
    let total = max(0, Int(ms) / 1000)
    let h = total / 3600
    let m = (total % 3600) / 60
    let s = total % 60
    if h > 0 {
      return String(format: "%d:%02d:%02d", h, m, s)
    }
    return String(format: "%d:%02d", m, s)
  }

  // MARK: - VLCMediaPlayerDelegate

  func mediaPlayerStateChanged(_ aNotification: Notification) {
    let state = mediaPlayer.state
    NSLog("[Saizen] VLC state → %d", state.rawValue)
    DispatchQueue.main.async {
      let playing = self.mediaPlayer.isPlaying
      self.playPauseButton.setImage(
        UIImage(systemName: playing ? "pause.fill" : "play.fill"),
        for: .normal
      )
      self.playPauseButton.accessibilityLabel = playing ? "Pause" : "Play"
      let buffering = state == .buffering || state == .opening
      if self.isTorrentStream {
        // Torrent HUD owns visibility via applyTorrentStats; keep chrome up while waiting.
        if playing {
          self.bufferingLabel.isHidden = true
          self.scheduleHideChrome()
        } else {
          self.showChrome(persistent: true)
          if buffering || state == .stopped {
            self.bufferingLabel.isHidden = false
          }
        }
      } else {
        self.bufferingLabel.isHidden = !buffering || playing
        if playing {
          self.scheduleHideChrome()
        } else {
          self.showChrome(persistent: true)
        }
      }
      self.refreshTrackButtons()
    }
  }

  func mediaPlayerTimeChanged(_ aNotification: Notification) {
    DispatchQueue.main.async {
      self.updateTimeLabels()
    }
  }

  private func refreshTrackButtons() {
    let audioCount = (mediaPlayer.audioTrackIndexes as? [Any])?.count ?? 0
    let subCount = (mediaPlayer.videoSubTitlesIndexes as? [Any])?.count ?? 0
    audioButton.isEnabled = audioCount > 0
    audioButton.alpha = audioCount > 0 ? 1 : 0.4
    subsButton.isEnabled = subCount > 0
    subsButton.alpha = subCount > 0 ? 1 : 0.4
  }
}
#endif
