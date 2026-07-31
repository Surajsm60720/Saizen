import Capacitor

/// Stub — AniList / MAL OAuth via ASWebAuthenticationSession (Phase 2).
@objc(SaizenAuthPlugin)
public class SaizenAuthPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "SaizenAuthPlugin"
  public let jsName = "SaizenAuth"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "authAnilist", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "authMAL", returnType: CAPPluginReturnPromise)
  ]

  @objc func authAnilist(_ call: CAPPluginCall) {
    call.reject("OAuth not implemented yet (Phase 2)")
  }

  @objc func authMAL(_ call: CAPPluginCall) {
    call.reject("OAuth not implemented yet (Phase 2)")
  }
}
