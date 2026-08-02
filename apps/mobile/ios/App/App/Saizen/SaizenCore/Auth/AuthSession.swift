import AuthenticationServices
import UIKit

/// Presents ASWebAuthenticationSession and returns the callback URL.
public enum AuthSession {
  private static var session: ASWebAuthenticationSession?
  private static var anchor: AuthPresentationAnchor?

  public static func start(
    url: URL,
    callbackScheme: String,
    from presenter: UIViewController?,
    completion: @escaping (Result<URL, Error>) -> Void
  ) {
    session?.cancel()
    let anchor = AuthPresentationAnchor(presenter: presenter)
    self.anchor = anchor

    let sess = ASWebAuthenticationSession(
      url: url,
      callbackURLScheme: callbackScheme
    ) { callbackURL, error in
      self.session = nil
      self.anchor = nil
      if let error {
        completion(.failure(error))
        return
      }
      guard let callbackURL else {
        completion(.failure(AuthSessionError.missingCallback))
        return
      }
      completion(.success(callbackURL))
    }
    sess.presentationContextProvider = anchor
    sess.prefersEphemeralWebBrowserSession = false
    session = sess
    if !sess.start() {
      self.session = nil
      self.anchor = nil
      completion(.failure(AuthSessionError.failedToStart))
    }
  }
}

public enum AuthSessionError: LocalizedError {
  case missingCallback
  case failedToStart
  case missingToken
  case missingCode

  public var errorDescription: String? {
    switch self {
    case .missingCallback: return "OAuth callback missing"
    case .failedToStart: return "Could not start auth session"
    case .missingToken: return "Access token missing from callback"
    case .missingCode: return "Authorization code missing from callback"
    }
  }
}

private final class AuthPresentationAnchor: NSObject, ASWebAuthenticationPresentationContextProviding {
  private weak var presenter: UIViewController?

  init(presenter: UIViewController?) {
    self.presenter = presenter
  }

  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    if let window = presenter?.view.window {
      return window
    }
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    if let window = scenes.flatMap(\.windows).first(where: \.isKeyWindow) {
      return window
    }
    return scenes.flatMap(\.windows).first ?? ASPresentationAnchor()
  }
}
