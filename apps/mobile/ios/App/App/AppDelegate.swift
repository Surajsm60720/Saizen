import UIKit
import WebKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        window?.backgroundColor = Self.saizenBackground
        // WebView exists after Capacitor finishes launching — configure on next runloop + when active.
        DispatchQueue.main.async { [weak self] in
            self?.configureWebViewAppearance()
        }
        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        configureWebViewAppearance()
    }

    func applicationWillResignActive(_ application: UIApplication) {}

    func applicationDidEnterBackground(_ application: UIApplication) {}

    func applicationWillEnterForeground(_ application: UIApplication) {}

    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
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

        guard let root = keyWindow?.rootViewController?.view,
              let webView = findWebView(in: root)
        else { return }

        let bg = Self.saizenBackground
        window?.backgroundColor = bg
        root.backgroundColor = bg
        webView.isOpaque = true
        webView.backgroundColor = bg
        webView.scrollView.backgroundColor = bg
        webView.scrollView.bounces = false
        webView.scrollView.alwaysBounceVertical = false
        webView.scrollView.alwaysBounceHorizontal = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
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
