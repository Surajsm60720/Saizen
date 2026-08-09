import UIKit
import WebKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private var webViewConfigObserver: NSObjectProtocol?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        SaizenStorage.ensureDirectories()
        window?.backgroundColor = Self.saizenBackground
        webViewConfigObserver = NotificationCenter.default.addObserver(
            forName: .saizenConfigureWebView,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.configureWebViewAppearance()
        }
        // Fallback if scene connect is delayed (legacy path).
        DispatchQueue.main.async { [weak self] in
            self?.configureWebViewAppearance()
        }
        return true
    }

    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let config = UISceneConfiguration(
            name: "Default Configuration",
            sessionRole: connectingSceneSession.role
        )
        config.delegateClass = SceneDelegate.self
        return config
    }

    func application(_ application: UIApplication, didDiscardSceneSessions sceneSessions: Set<UISceneSession>) {}

    func application(
      _ application: UIApplication,
      handleEventsForBackgroundURLSession identifier: String,
      completionHandler: @escaping () -> Void
    ) {
      DownloadCoordinator.shared.handleBackgroundSession(
        identifier: identifier,
        completionHandler: completionHandler
      )
    }

    // Kept for Cap 7 / pre-scene cold starts; unused once UIApplicationSceneManifest is active.
    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        _ = AuthSession.handleIncomingURL(url)
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    /// Charcoal matching apps/web theme (`#141416`) — prevents black rubber-band bars.
    private static let saizenBackground = UIColor(red: 0.078, green: 0.078, blue: 0.086, alpha: 1)

    private func configureWebViewAppearance() {
        let keyWindow =
            window
            ?? UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }
            ?? UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first

        guard let root = keyWindow?.rootViewController?.view,
              let webView = findWebView(in: root)
        else { return }

        let bg = Self.saizenBackground
        keyWindow?.backgroundColor = bg
        window?.backgroundColor = bg
        root.backgroundColor = bg
        webView.isOpaque = true
        webView.backgroundColor = bg
        webView.scrollView.backgroundColor = bg
        webView.scrollView.bounces = false
        webView.scrollView.alwaysBounceVertical = false
        webView.scrollView.alwaysBounceHorizontal = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        // Prevent pinch / sticky focus-zoom trapping the UI at >1x scale
        webView.scrollView.minimumZoomScale = 1
        webView.scrollView.maximumZoomScale = 1
        webView.scrollView.pinchGestureRecognizer?.isEnabled = false
        if abs(webView.scrollView.zoomScale - 1) > 0.001 {
            webView.scrollView.setZoomScale(1, animated: false)
        }
        // Edge swipe ↔ history (SPA pushState entries) — replaces in-app Back buttons
        webView.allowsBackForwardNavigationGestures = true
        #if DEBUG
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        #endif
    }

    private func findWebView(in view: UIView) -> WKWebView? {
        if let webView = view as? WKWebView { return webView }
        for subview in view.subviews {
            if let found = findWebView(in: subview) { return found }
        }
        return nil
    }
}
