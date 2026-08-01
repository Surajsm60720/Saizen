import type { NextConfig } from 'next'

/**
 * Static export for Capacitor WKWebView (webDir → out/).
 * trailingSlash keeps directory URLs stable with appStartPath: '/'.
 * Absolute /_next assets work with iosScheme: 'https' (see capacitor.config.ts).
 */
const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  // Transpile workspace package if it ships raw TS
  transpilePackages: ['@saizen/shared']
}

export default nextConfig
