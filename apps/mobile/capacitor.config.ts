import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.saizen',
  appName: 'Saizen',
  webDir: '../web/build',
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
    // Trailing slash required for SvelteKit hash router on iOS —
    // without it Capacitor loads capacitor://localhost (no path) and
    // the WebView infinitely reloads ("⚡️ WebView loaded" spam).
    // https://github.com/ionic-team/capacitor/issues/7972
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
