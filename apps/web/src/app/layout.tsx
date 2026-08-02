import type { Metadata, Viewport } from 'next'
import { Instrument_Sans, Instrument_Serif } from 'next/font/google'
import './globals.css'
import { AppShell } from './AppShell'
import { cn } from '@/lib/utils'

const sans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap'
})

const display = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-heading',
  display: 'swap'
})

export const metadata: Metadata = {
  title: 'Saizen',
  description: 'Personal iOS anime client'
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#141416'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn('dark', sans.variable, display.variable)}>
      <body className="font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
