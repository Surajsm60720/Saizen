import UIKit
import Capacitor

/// UIScene lifecycle (required by newer Xcode / iOS). Capacitor 7 has no
/// SceneDelegateProxy — URL opens are forwarded to ApplicationDelegateProxy.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }

    let window = UIWindow(windowScene: windowScene)
    window.rootViewController = CAPBridgeViewController()
    window.makeKeyAndVisible()
    self.window = window

    if let appDelegate = UIApplication.shared.delegate as? AppDelegate {
      appDelegate.window = window
    }

    for context in connectionOptions.urlContexts {
      _ = AuthSession.handleIncomingURL(context.url)
      _ = ApplicationDelegateProxy.shared.application(
        UIApplication.shared,
        open: context.url,
        options: [:]
      )
    }
    if let activity = connectionOptions.userActivities.first(where: { $0.webpageURL != nil }) {
      _ = ApplicationDelegateProxy.shared.application(
        UIApplication.shared,
        continue: activity,
        restorationHandler: { _ in }
      )
    }

    DispatchQueue.main.async {
      NotificationCenter.default.post(name: .saizenConfigureWebView, object: nil)
    }
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    NotificationCenter.default.post(name: .saizenConfigureWebView, object: nil)
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      // AniList/MAL OAuth: `saizen://…#access_token=…` must be delivered here
      // (SFSafariViewController + custom scheme). Do this before Cap proxy.
      _ = AuthSession.handleIncomingURL(context.url)
      _ = ApplicationDelegateProxy.shared.application(
        UIApplication.shared,
        open: context.url,
        options: [:]
      )
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = ApplicationDelegateProxy.shared.application(
      UIApplication.shared,
      continue: userActivity,
      restorationHandler: { _ in }
    )
  }
}

extension Notification.Name {
  static let saizenConfigureWebView = Notification.Name("saizen.configureWebView")
}
