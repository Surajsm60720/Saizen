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
    title: String?
  ) {
    NSLog("[Saizen] PlayerRouter present hint=%@ url=%@", hint.rawValue, url.absoluteString)

    #if canImport(MobileVLCKit)
    let vlcAvailable = true
    #else
    let vlcAvailable = false
    #endif

    switch hint {
    case .avplayer:
      presentAVPlayer(from: presenter, url: url, title: title)
    case .vlc:
      if vlcAvailable {
        #if canImport(MobileVLCKit)
        presentVLC(from: presenter, url: url, title: title)
        #endif
      } else {
        NSLog("[Saizen] MobileVLCKit not linked — cannot play MKV/ASS via AVPlayer")
        presentMissingVLCAlert(from: presenter, url: url, title: title)
      }
    }
  }

  private static func presentMissingVLCAlert(
    from presenter: UIViewController,
    url: URL,
    title: String?
  ) {
    let alert = UIAlertController(
      title: "VLC player required",
      message:
        "This stream is likely MKV (anime fansubs). AVPlayer cannot play it.\n\n"
        + "Add MobileVLCKit to the Podfile and run `pod install`, then rebuild.",
      preferredStyle: .alert
    )
    alert.addAction(UIAlertAction(title: "Dismiss", style: .cancel))
    // Still open AVPlayer so logs show the decode failure if someone insists.
    alert.addAction(UIAlertAction(title: "Try AVPlayer anyway", style: .default) { _ in
      presentAVPlayer(from: presenter, url: url, title: title)
    })
    presenter.present(alert, animated: true)
  }

  private static func presentAVPlayer(from presenter: UIViewController, url: URL, title: String?) {
    let asset = AVURLAsset(url: url)
    let item = AVPlayerItem(asset: asset)
    let player = AVPlayer(playerItem: item)
    let vc = AVPlayerViewController()
    vc.player = player
    vc.title = title

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

    presenter.present(vc, animated: true)
  }

  #if canImport(MobileVLCKit)
  private static func presentVLC(from presenter: UIViewController, url: URL, title: String?) {
    let vc = VLCPlayerViewController(url: url, titleText: title)
    vc.modalPresentationStyle = .fullScreen
    presenter.present(vc, animated: true)
  }
  #endif
}

#if canImport(MobileVLCKit)
final class VLCPlayerViewController: UIViewController, VLCMediaPlayerDelegate {
  private let mediaPlayer = VLCMediaPlayer()
  private let url: URL
  private let titleText: String?

  init(url: URL, titleText: String?) {
    self.url = url
    self.titleText = titleText
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) { fatalError() }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    mediaPlayer.delegate = self
    mediaPlayer.drawable = view

    let media = VLCMedia(url: url)
    // Seekable HTTP + enough cache for torrent stalls. Avoid http-continuous /
    // forced avformat — they fought our previous short 206 responses.
    media.addOption(":network-caching=8000")
    media.addOption(":file-caching=8000")
    media.addOption(":http-reconnect")
    media.addOption(":http-seek-method=1")
    mediaPlayer.media = media
    mediaPlayer.play()
    NSLog("[Saizen] VLCMediaPlayer play → %@", url.absoluteString)

    let close = UIButton(type: .close)
    close.translatesAutoresizingMaskIntoConstraints = false
    close.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
    view.addSubview(close)
    NSLayoutConstraint.activate([
      close.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
      close.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16)
    ])
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    if isBeingDismissed || isMovingFromParent {
      mediaPlayer.stop()
    }
  }

  @objc private func closeTapped() {
    mediaPlayer.stop()
    dismiss(animated: true)
  }

  func mediaPlayerStateChanged(_ aNotification: Notification) {
    NSLog("[Saizen] VLC state → %d", mediaPlayer.state.rawValue)
  }
}
#endif
