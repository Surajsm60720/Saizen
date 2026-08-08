import type { Metadata, Viewport } from 'next'
import { Puritan, Quando } from 'next/font/google'
import './globals.css'
import { AppShell } from './AppShell'
import { cn } from '@/lib/utils'

/** UI / body */
const sans = Puritan({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  weight: ['400', '700']
})

/** Display / headings — Quando ships 400 only; bold synthesizes for hierarchy */
const display = Quando({
  subsets: ['latin'],
  variable: '--font-heading',
  display: 'swap',
  weight: '400'
})

export const metadata: Metadata = {
  title: 'Saizen',
  description: 'Personal iOS anime client',
  // Static export → CSP via meta (defense-in-depth; extension loader still needs unsafe-eval).
  other: {
    'Content-Security-Policy': [
      "default-src 'self' capacitor: ionic:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https: http://127.0.0.1:* http://localhost:*",
      "connect-src 'self' https: http://127.0.0.1:* http://localhost:* capacitor: ionic: ws: wss:",
      "font-src 'self' data:",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'"
    ].join('; ')
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Native Cap shell: block iOS focus/pinch zoom so small inputs can't trap the UI zoomed-in
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#050505'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn('dark', sans.variable, display.variable)}>
      <body className="font-sans antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
