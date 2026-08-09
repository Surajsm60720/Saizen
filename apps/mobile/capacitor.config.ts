import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.saizen',
  appName: 'Saizen',
  webDir: '../web/out',
  // Never print Cap bridge payloads (tokens / Keychain values) to the Xcode console.
  loggingBehavior: 'none',
  // Match deep-black chrome so WKWebView rubber-band never flashes another fill
  backgroundColor: '#050505',
  server: {
    androidScheme: 'https',
    // https scheme so absolute /_next assets resolve (capacitor:// often blanks WKWebView)
    iosScheme: 'https',
    // Trailing slash required so Capacitor loads a path, not bare origin
    // (avoids infinite WebView reload). https://github.com/ionic-team/capacitor/issues/7972
    appStartPath: '/'
  },
  ios: {
    // Safe areas handled in CSS via env(safe-area-inset-*)
    contentInset: 'never',
    allowsLinkPreview: false,
    backgroundColor: '#050505',
    scrollEnabled: true
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }
}

export default config
