import AuthenticationServices
import UIKit
import WebKit

extension Notification.Name {
  /// Posted when the app is opened with a `saizen://` URL (OAuth redirect).
  static let saizenOAuthCallback = Notification.Name("saizen.oauth.callback")
}

/// OAuth host for Saizen.
///
/// AniList Authorization Code returns `?code=` on `saizen://…` (reliable).
/// Client secret stays in Keychain / AnilistSecret.local.swift — never on the JS bridge.
/// Access tokens are written to Keychain and omitted from Cap plugin resolves.
public enum AuthSession {
  private static var pendingExternal: PendingOAuth?
  private static var asSession: ASWebAuthenticationSession?
  private static var asPresenter: AuthPresentationContext?

  public static func start(
    url: URL,
    callbackScheme: String,
    from presenter: UIViewController?,
    completion: @escaping (Result<URL, Error>) -> Void
  ) {
    DispatchQueue.main.async {
      if let existing = pendingExternal {
        existing.cancel(with: .canceled)
      }
      asSession?.cancel()
      asSession = nil
      asPresenter = nil

      // Both AniList (`?code=`) and MAL (`?code=`) need ASWebAuthenticationSession.
      // In-app WKWebView often fails to hand off `saizen://…` and leaves a broken page.
      let hostName = (url.host ?? "").lowercased()
      if hostName.contains("anilist.co") || hostName.contains("myanimelist.net") {
        startASWeb(
          url: url,
          callbackScheme: callbackScheme,
          from: presenter,
          completion: completion
        )
      } else {
        startEmbeddedWeb(
          url: url,
          callbackScheme: callbackScheme,
          from: presenter,
          completion: completion
        )
      }
    }
  }

  @discardableResult
  public static func handleIncomingURL(_ url: URL) -> Bool {
    guard (url.scheme ?? "").lowercased() == "saizen" else { return false }
    NotificationCenter.default.post(
      name: .saizenOAuthCallback,
      object: nil,
      userInfo: ["url": url]
    )
    if let pendingExternal, pendingExternal.accept(url) {
      return true
    }
    return true
  }

  // MARK: - ASWebAuthenticationSession (AniList + MAL → saizen://?code=)

  private static func startASWeb(
    url: URL,
    callbackScheme: String,
    from presenter: UIViewController?,
    completion: @escaping (Result<URL, Error>) -> Void
  ) {
    guard let anchor = presentationAnchor(from: presenter) else {
      // Fall back to system Safari + deep link.
      startExternalBrowser(url: url, callbackScheme: callbackScheme, from: presenter, completion: completion)
      return
    }

    let context = AuthPresentationContext(anchor: anchor)
    asPresenter = context

    let session = ASWebAuthenticationSession(
      url: url,
      callbackURLScheme: callbackScheme
    ) { callbackURL, error in
      asSession = nil
      asPresenter = nil
      if let error {
        let ns = error as NSError
        if ns.domain == ASWebAuthenticationSessionErrorDomain,
           ns.code == ASWebAuthenticationSessionError.canceledLogin.rawValue
        {
          completion(.failure(AuthSessionError.canceled))
        } else {
          completion(.failure(error))
        }
        return
      }
      guard let callbackURL else {
        completion(.failure(AuthSessionError.missingCallback))
        return
      }
      completion(.success(callbackURL))
    }
    session.presentationContextProvider = context
    session.prefersEphemeralWebBrowserSession = false
    asSession = session

    if !session.start() {
      asSession = nil
      asPresenter = nil
      startExternalBrowser(
        url: url,
        callbackScheme: callbackScheme,
        from: presenter,
        completion: completion
      )
    }
  }

  private static func startExternalBrowser(
    url: URL,
    callbackScheme: String,
    from presenter: UIViewController?,
    completion: @escaping (Result<URL, Error>) -> Void
  ) {
    guard let host = topViewController(from: presenter) else {
      completion(.failure(AuthSessionError.noPresentationWindow))
      return
    }

    let pending = PendingOAuth(callbackScheme: callbackScheme, completion: completion)
    pendingExternal = pending

    let alert = UIAlertController(
      title: "Continue in Safari",
      message:
        "After Approve, Safari should open Saizen with the login code.\n"
        + "Redirect URL must stay: saizen://anilist/callback",
      preferredStyle: .alert
    )
    alert.addAction(
      UIAlertAction(title: "Cancel", style: .cancel) { _ in
        pending.cancel(with: .canceled)
        if pendingExternal === pending { pendingExternal = nil }
      }
    )
    alert.addAction(
      UIAlertAction(title: "Open Safari", style: .default) { _ in
        UIApplication.shared.open(url, options: [:]) { ok in
          if !ok {
            pending.cancel(with: .failedToStart)
            if pendingExternal === pending { pendingExternal = nil }
          }
        }
      }
    )
    host.present(alert, animated: true)
  }

  // MARK: - MAL: embedded WKWebView

  private static func startEmbeddedWeb(
    url: URL,
    callbackScheme: String,
    from presenter: UIViewController?,
    completion: @escaping (Result<URL, Error>) -> Void
  ) {
    guard let host = topViewController(from: presenter) else {
      completion(.failure(AuthSessionError.noPresentationWindow))
      return
    }

    let controller = OAuthWebController(
      startURL: url,
      callbackScheme: callbackScheme,
      completion: completion
    )
    controller.modalPresentationStyle = .pageSheet
    if let sheet = controller.sheetPresentationController {
      sheet.detents = [.large()]
      sheet.prefersGrabberVisible = true
    }
    host.present(controller, animated: true)
  }

  private static func presentationAnchor(from presenter: UIViewController?) -> ASPresentationAnchor? {
    if let window = presenter?.view.window { return window }
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    if let key = scenes.flatMap(\.windows).first(where: \.isKeyWindow) { return key }
    return scenes.flatMap(\.windows).first
  }

  private static func topViewController(from presenter: UIViewController?) -> UIViewController? {
    var base = presenter
    if base == nil {
      let keyWindow =
        UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .flatMap(\.windows)
        .first(where: \.isKeyWindow)
        ?? UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .flatMap(\.windows)
        .first
      base = keyWindow?.rootViewController
    }
    if base == nil, let windowOpt = UIApplication.shared.delegate?.window, let window = windowOpt {
      base = window.rootViewController
    }
    guard var top = base else { return nil }
    while let presented = top.presentedViewController {
      top = presented
    }
    return top
  }

  fileprivate static func clearPendingExternal(_ pending: PendingOAuth) {
    if pendingExternal === pending {
      pendingExternal = nil
    }
  }
}

public enum AuthSessionError: LocalizedError {
  case missingCallback
  case failedToStart
  case missingToken
  case missingCode
  case canceled
  case noPresentationWindow

  public var errorDescription: String? {
    switch self {
    case .missingCallback: return "OAuth callback missing"
    case .failedToStart: return "Could not start sign-in"
    case .missingToken: return "Access token missing from callback"
    case .missingCode: return "Authorization code missing from callback"
    case .canceled: return "Sign-in was cancelled"
    case .noPresentationWindow:
      return "Could not present sign-in (no active window). Force-quit Saizen and try again."
    }
  }
}

// MARK: - ASWeb presentation

private final class AuthPresentationContext: NSObject, ASWebAuthenticationPresentationContextProviding {
  private let anchor: ASPresentationAnchor
  init(anchor: ASPresentationAnchor) { self.anchor = anchor }
  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    anchor
  }
}

// MARK: - Pending external OAuth

private final class PendingOAuth {
  private let callbackScheme: String
  private let completion: (Result<URL, Error>) -> Void
  private var observer: NSObjectProtocol?
  private var settled = false

  init(callbackScheme: String, completion: @escaping (Result<URL, Error>) -> Void) {
    self.callbackScheme = callbackScheme.lowercased()
    self.completion = completion
    observer = NotificationCenter.default.addObserver(
      forName: .saizenOAuthCallback,
      object: nil,
      queue: .main
    ) { [weak self] note in
      guard let self, let url = note.userInfo?["url"] as? URL else { return }
      _ = self.accept(url)
    }
  }

  deinit {
    if let observer { NotificationCenter.default.removeObserver(observer) }
  }

  @discardableResult
  func accept(_ url: URL) -> Bool {
    guard !settled else { return false }
    guard (url.scheme ?? "").lowercased() == callbackScheme else { return false }
    settled = true
    teardown()
    AuthSession.clearPendingExternal(self)
    completion(.success(url))
    return true
  }

  func cancel(with error: AuthSessionError) {
    guard !settled else { return }
    settled = true
    teardown()
    AuthSession.clearPendingExternal(self)
    completion(.failure(error))
  }

  private func teardown() {
    if let observer {
      NotificationCenter.default.removeObserver(observer)
      self.observer = nil
    }
  }
}

// MARK: - Embedded WKWebView (MAL)

private final class OAuthWebController: UIViewController, WKNavigationDelegate, WKUIDelegate {
  private let startURL: URL
  private let callbackScheme: String
  private let completion: (Result<URL, Error>) -> Void
  private var webView: WKWebView!
  private var settled = false
  private var deepLinkObserver: NSObjectProtocol?

  init(
    startURL: URL,
    callbackScheme: String,
    completion: @escaping (Result<URL, Error>) -> Void
  ) {
    self.startURL = startURL
    self.callbackScheme = callbackScheme.lowercased()
    self.completion = completion
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { nil }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = UIColor(red: 0.078, green: 0.078, blue: 0.086, alpha: 1)

    let header = UIView()
    header.translatesAutoresizingMaskIntoConstraints = false
    header.backgroundColor = UIColor(red: 0.078, green: 0.078, blue: 0.086, alpha: 1)
    view.addSubview(header)

    let cancel = UIButton(type: .system)
    cancel.setTitle("Cancel", for: .normal)
    cancel.setTitleColor(UIColor(red: 0.91, green: 0.77, blue: 0.47, alpha: 1), for: .normal)
    cancel.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
    cancel.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
    cancel.translatesAutoresizingMaskIntoConstraints = false
    header.addSubview(cancel)

    let title = UILabel()
    title.text = "Sign in"
    title.textColor = .white
    title.font = .systemFont(ofSize: 17, weight: .semibold)
    title.translatesAutoresizingMaskIntoConstraints = false
    header.addSubview(title)

    let config = WKWebViewConfiguration()
    config.defaultWebpagePreferences.allowsContentJavaScript = true
    config.websiteDataStore = .default()

    let webView = WKWebView(frame: .zero, configuration: config)
    webView.navigationDelegate = self
    webView.uiDelegate = self
    webView.allowsBackForwardNavigationGestures = true
    webView.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(webView)
    self.webView = webView

    NSLayoutConstraint.activate([
      header.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      header.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      header.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
      header.heightAnchor.constraint(equalToConstant: 52),
      cancel.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: 16),
      cancel.centerYAnchor.constraint(equalTo: header.centerYAnchor),
      title.centerXAnchor.constraint(equalTo: header.centerXAnchor),
      title.centerYAnchor.constraint(equalTo: header.centerYAnchor),
      webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      webView.topAnchor.constraint(equalTo: header.bottomAnchor),
      webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
    ])

    deepLinkObserver = NotificationCenter.default.addObserver(
      forName: .saizenOAuthCallback,
      object: nil,
      queue: .main
    ) { [weak self] note in
      guard let self, let url = note.userInfo?["url"] as? URL else { return }
      self.consider(url)
    }

    webView.load(URLRequest(url: startURL))
  }

  deinit {
    if let deepLinkObserver {
      NotificationCenter.default.removeObserver(deepLinkObserver)
    }
  }

  @objc private func cancelTapped() {
    finish(.failure(AuthSessionError.canceled))
  }

  private func finish(_ result: Result<URL, Error>) {
    guard !settled else { return }
    settled = true
    if let deepLinkObserver {
      NotificationCenter.default.removeObserver(deepLinkObserver)
      self.deepLinkObserver = nil
    }
    dismiss(animated: true) { self.completion(result) }
  }

  @discardableResult
  private func consider(_ url: URL?) -> Bool {
    guard let url, !settled else { return false }
    let scheme = (url.scheme ?? "").lowercased()
    let abs = url.absoluteString
    if scheme == callbackScheme || abs.contains("code=") {
      finish(.success(url))
      return true
    }
    return false
  }

  private func failingURL(from error: Error) -> URL? {
    let ns = error as NSError
    if let s = ns.userInfo[NSURLErrorFailingURLStringErrorKey] as? String, let u = URL(string: s) {
      return u
    }
    return ns.userInfo[NSURLErrorFailingURLErrorKey] as? URL ?? webView.url
  }

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    if let url = navigationAction.request.url, consider(url) {
      decisionHandler(.cancel)
      return
    }
    decisionHandler(.allow)
  }

  func webView(
    _ webView: WKWebView,
    didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) {
    if let url = failingURL(from: error) { _ = consider(url) }
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    if let url = failingURL(from: error) { _ = consider(url) }
  }

  func webView(
    _ webView: WKWebView,
    createWebViewWith configuration: WKWebViewConfiguration,
    for navigationAction: WKNavigationAction,
    windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
      webView.load(URLRequest(url: url))
    }
    return nil
  }
}
