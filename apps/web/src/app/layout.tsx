import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AppShell } from './AppShell'

export const metadata: Metadata = {
  title: 'Saizen',
  description: 'Personal iOS anime client'
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f1419'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
