import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.saizen',
  appName: 'Saizen',
  webDir: '../web/out',
  server: {
    androidScheme: 'https',
    // https scheme so absolute /_next assets resolve (capacitor:// often blanks WKWebView)
    iosScheme: 'https',
    // Trailing slash required so Capacitor loads a path, not bare origin
    // (avoids infinite WebView reload). https://github.com/ionic-team/capacitor/issues/7972
    appStartPath: '/'
  },
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }
}

export default config
