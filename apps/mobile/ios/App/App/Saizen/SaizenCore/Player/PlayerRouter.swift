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
final class VLCPlayerViewController: UIViewController, VLCMediaPlayerDelegate {
  private let mediaPlayer = VLCMediaPlayer()
  private let url: URL
  private let titleText: String?
  private let playbackContext: PlaybackContext
  var onDismiss: (() -> Void)?
  private var didNotifyDismiss = false

  private let videoHost = UIView()
  private let chrome = UIView()
  private let topBar = UIStackView()
  private let bottomBar = UIStackView()
  private let titleLabel = UILabel()
  private let closeButton = UIButton(type: .system)
  private let playPauseButton = UIButton(type: .system)
  private let skipBackButton = UIButton(type: .system)
  private let skipForwardButton = UIButton(type: .system)
  private let timeLabel = UILabel()
  private let durationLabel = UILabel()
  private let scrubber = UISlider()
  private let volumeSlider = UISlider()
  private let speedButton = UIButton(type: .system)
  private let audioButton = UIButton(type: .system)
  private let subsButton = UIButton(type: .system)
  private let bufferingLabel = UILabel()
  private let torrentStatsLabel = UILabel()
  private var statsTimer: Timer?
  private var isTorrentStream = false

  private var hideChromeWorkItem: DispatchWorkItem?
  private var isSeeking = false
  private var chromeVisible = true
  private var hasAppeared = false
  private let rates: [Float] = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0]
  private var rateIndex = 1

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

    let videoTap = UITapGestureRecognizer(target: self, action: #selector(toggleChrome))
    videoHost.isUserInteractionEnabled = true
    videoHost.addGestureRecognizer(videoTap)

    let chromeTap = UITapGestureRecognizer(target: self, action: #selector(toggleChrome))
    chromeTap.cancelsTouchesInView = false
    chrome.addGestureRecognizer(chromeTap)

    styleChromeBars()

    NSLayoutConstraint.activate([
      chrome.topAnchor.constraint(equalTo: view.topAnchor),
      chrome.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      chrome.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      chrome.bottomAnchor.constraint(equalTo: view.bottomAnchor)
    ])
  }

  private func styleChromeBars() {
    let accent = UIColor(red: 0.24, green: 0.61, blue: 0.94, alpha: 1) // --accent

    topBar.axis = .horizontal
    topBar.alignment = .center
    topBar.spacing = 12
    topBar.translatesAutoresizingMaskIntoConstraints = false
    topBar.isLayoutMarginsRelativeArrangement = true
    topBar.layoutMargins = UIEdgeInsets(top: 8, left: 16, bottom: 8, right: 16)

    titleLabel.text = titleText ?? "Saizen"
    titleLabel.textColor = .white
    titleLabel.font = .systemFont(ofSize: 16, weight: .semibold)
    titleLabel.numberOfLines = 1
    titleLabel.lineBreakMode = .byTruncatingTail

    closeButton.setImage(UIImage(systemName: "xmark.circle.fill"), for: .normal)
    closeButton.tintColor = .white.withAlphaComponent(0.9)
    closeButton.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
    closeButton.accessibilityLabel = "Close"

    topBar.addArrangedSubview(titleLabel)
    topBar.addArrangedSubview(closeButton)

    let topBlur = makeBlurContainer(embedding: topBar)
    chrome.addSubview(topBlur)

    // Transport row
    playPauseButton.setImage(UIImage(systemName: "pause.fill"), for: .normal)
    playPauseButton.tintColor = .white
    playPauseButton.addTarget(self, action: #selector(togglePlay), for: .touchUpInside)
    playPauseButton.accessibilityLabel = "Pause"

    skipBackButton.setImage(UIImage(systemName: "gobackward.10"), for: .normal)
    skipBackButton.tintColor = .white
    skipBackButton.addTarget(self, action: #selector(skipBack), for: .touchUpInside)

    skipForwardButton.setImage(UIImage(systemName: "goforward.10"), for: .normal)
    skipForwardButton.tintColor = .white
    skipForwardButton.addTarget(self, action: #selector(skipForward), for: .touchUpInside)

    [skipBackButton, skipForwardButton].forEach {
      $0.contentVerticalAlignment = .fill
      $0.contentHorizontalAlignment = .fill
      $0.widthAnchor.constraint(equalToConstant: 36).isActive = true
      $0.heightAnchor.constraint(equalToConstant: 36).isActive = true
    }
    playPauseButton.contentVerticalAlignment = .fill
    playPauseButton.contentHorizontalAlignment = .fill
    playPauseButton.widthAnchor.constraint(equalToConstant: 44).isActive = true
    playPauseButton.heightAnchor.constraint(equalToConstant: 44).isActive = true

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
    scrubber.maximumTrackTintColor = UIColor.white.withAlphaComponent(0.25)
    scrubber.addTarget(self, action: #selector(scrubBegan), for: .touchDown)
    scrubber.addTarget(self, action: #selector(scrubChanged), for: .valueChanged)
    scrubber.addTarget(self, action: #selector(scrubEnded), for: [.touchUpInside, .touchUpOutside, .touchCancel])

    let seekRow = UIStackView(arrangedSubviews: [timeLabel, scrubber, durationLabel])
    seekRow.axis = .horizontal
    seekRow.alignment = .center
    seekRow.spacing = 10

    configureChip(speedButton, title: "1×")
    speedButton.addTarget(self, action: #selector(cycleSpeed), for: .touchUpInside)

    configureChip(audioButton, title: "Audio")
    audioButton.addTarget(self, action: #selector(pickAudio), for: .touchUpInside)

    configureChip(subsButton, title: "Subs")
    subsButton.addTarget(self, action: #selector(pickSubs), for: .touchUpInside)

    let volumeIcon = UIImageView(image: UIImage(systemName: "speaker.wave.2.fill"))
    volumeIcon.tintColor = .white.withAlphaComponent(0.8)
    volumeIcon.contentMode = .scaleAspectFit
    volumeIcon.widthAnchor.constraint(equalToConstant: 18).isActive = true

    volumeSlider.minimumValue = 0
    volumeSlider.maximumValue = 200
    volumeSlider.value = 100
    volumeSlider.minimumTrackTintColor = accent
    volumeSlider.maximumTrackTintColor = UIColor.white.withAlphaComponent(0.25)
    volumeSlider.addTarget(self, action: #selector(volumeChanged), for: .valueChanged)
    volumeSlider.widthAnchor.constraint(greaterThanOrEqualToConstant: 80).isActive = true

    let settingsRow = UIStackView(arrangedSubviews: [
      speedButton, audioButton, subsButton, volumeIcon, volumeSlider
    ])
    settingsRow.axis = .horizontal
    settingsRow.alignment = .center
    settingsRow.spacing = 10
    settingsRow.distribution = .fill

    let transport = UIStackView(arrangedSubviews: [skipBackButton, playPauseButton, skipForwardButton])
    transport.axis = .horizontal
    transport.alignment = .center
    transport.spacing = 28
    transport.distribution = .equalCentering

    bottomBar.axis = .vertical
    bottomBar.spacing = 12
    bottomBar.translatesAutoresizingMaskIntoConstraints = false
    bottomBar.isLayoutMarginsRelativeArrangement = true
    bottomBar.layoutMargins = UIEdgeInsets(top: 12, left: 16, bottom: 12, right: 16)
    bottomBar.addArrangedSubview(seekRow)
    bottomBar.addArrangedSubview(transport)
    bottomBar.addArrangedSubview(settingsRow)

    let bottomBlur = makeBlurContainer(embedding: bottomBar)
    chrome.addSubview(bottomBlur)

    bufferingLabel.text = isTorrentStream ? "Buffering stream…" : "Buffering…"
    bufferingLabel.textColor = .white.withAlphaComponent(0.9)
    bufferingLabel.font = .systemFont(ofSize: 15, weight: .semibold)
    bufferingLabel.textAlignment = .center
    bufferingLabel.translatesAutoresizingMaskIntoConstraints = false
    bufferingLabel.isHidden = false
    chrome.addSubview(bufferingLabel)

    torrentStatsLabel.text = ""
    torrentStatsLabel.textColor = .white.withAlphaComponent(0.75)
    torrentStatsLabel.font = .monospacedDigitSystemFont(ofSize: 13, weight: .medium)
    torrentStatsLabel.textAlignment = .center
    torrentStatsLabel.numberOfLines = 2
    torrentStatsLabel.translatesAutoresizingMaskIntoConstraints = false
    torrentStatsLabel.isHidden = !isTorrentStream
    chrome.addSubview(torrentStatsLabel)

    NSLayoutConstraint.activate([
      topBlur.topAnchor.constraint(equalTo: chrome.safeAreaLayoutGuide.topAnchor),
      topBlur.leadingAnchor.constraint(equalTo: chrome.leadingAnchor),
      topBlur.trailingAnchor.constraint(equalTo: chrome.trailingAnchor),

      bottomBlur.leadingAnchor.constraint(equalTo: chrome.leadingAnchor),
      bottomBlur.trailingAnchor.constraint(equalTo: chrome.trailingAnchor),
      bottomBlur.bottomAnchor.constraint(equalTo: chrome.safeAreaLayoutGuide.bottomAnchor),

      bufferingLabel.centerXAnchor.constraint(equalTo: chrome.centerXAnchor),
      bufferingLabel.centerYAnchor.constraint(equalTo: chrome.centerYAnchor, constant: -12),
      bufferingLabel.leadingAnchor.constraint(greaterThanOrEqualTo: chrome.leadingAnchor, constant: 24),
      bufferingLabel.trailingAnchor.constraint(lessThanOrEqualTo: chrome.trailingAnchor, constant: -24),

      torrentStatsLabel.topAnchor.constraint(equalTo: bufferingLabel.bottomAnchor, constant: 10),
      torrentStatsLabel.centerXAnchor.constraint(equalTo: chrome.centerXAnchor),
      torrentStatsLabel.leadingAnchor.constraint(greaterThanOrEqualTo: chrome.leadingAnchor, constant: 24),
      torrentStatsLabel.trailingAnchor.constraint(lessThanOrEqualTo: chrome.trailingAnchor, constant: -24)
    ])
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

  private func configureChip(_ button: UIButton, title: String) {
    button.setTitle(title, for: .normal)
    button.titleLabel?.font = .systemFont(ofSize: 13, weight: .semibold)
    button.setTitleColor(.white, for: .normal)
    button.backgroundColor = UIColor.white.withAlphaComponent(0.12)
    button.layer.cornerRadius = 8
    button.clipsToBounds = true
    button.setContentHuggingPriority(.required, for: .horizontal)
    // Padding via constraints on intrinsic content size
    button.configuration = {
      var cfg = UIButton.Configuration.plain()
      cfg.contentInsets = NSDirectionalEdgeInsets(top: 6, leading: 10, bottom: 6, trailing: 10)
      cfg.baseForegroundColor = .white
      cfg.title = title
      cfg.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
        var out = incoming
        out.font = .systemFont(ofSize: 13, weight: .semibold)
        return out
      }
      return cfg
    }()
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
    torrentStatsLabel.alpha = waiting ? 1 : 0.7
    torrentStatsLabel.text =
      "\(peers) peers  ·  \(Self.formatRate(speed))  ·  \(Self.formatBytes(downloaded))"
      + (total > 0 ? " / \(Self.formatBytes(total))" : "")
      + (pct > 0 ? "  ·  \(pct)%" : "")
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

  @objc private func skipBack() {
    seekBy(seconds: -10)
  }

  @objc private func skipForward() {
    seekBy(seconds: 10)
  }

  private func seekBy(seconds: Int32) {
    let current = mediaPlayer.time.intValue
    let length = mediaPlayer.media?.length.intValue ?? 0
    guard length > 0 else { return }
    let next = max(0, min(length, current + seconds * 1000))
    mediaPlayer.time = VLCTime(int: next)
    updateTimeLabels()
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
    scheduleHideChrome()
  }

  @objc private func volumeChanged() {
    mediaPlayer.audio?.volume = Int32(volumeSlider.value)
    scheduleHideChrome()
  }

  @objc private func cycleSpeed() {
    rateIndex = (rateIndex + 1) % rates.count
    let rate = rates[rateIndex]
    mediaPlayer.rate = rate
    let label = rate == 1.0 ? "1×" : String(format: "%g×", rate)
    configureChip(speedButton, title: label)
    scheduleHideChrome()
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
    let work = DispatchWorkItem { [weak self] in
      self?.hideChrome()
    }
    hideChromeWorkItem = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 3.5, execute: work)
  }

  private func updateTimeLabels() {
    let current = mediaPlayer.time.intValue
    let length = mediaPlayer.media?.length.intValue ?? 0
    timeLabel.text = Self.formatMs(current)
    durationLabel.text = Self.formatMs(length)
    if !isSeeking, length > 0 {
      scrubber.value = Float(current) / Float(length)
    }
    if playbackContext.isValid, length > 0 {
      PlaybackProgressReporter.shared.emit(
        anilistId: playbackContext.anilistId,
        episode: playbackContext.episode,
        idMal: playbackContext.idMal,
        positionSec: Double(current) / 1000.0,
        durationSec: Double(length) / 1000.0
      )
    }
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
