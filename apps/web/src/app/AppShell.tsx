'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { installSaizenBridge } from '@/lib/native/bridge'
import { refreshNative } from '@/lib/native'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  useEffect(() => {
    void (async () => {
      await installSaizenBridge()
      refreshNative()
    })()
  }, [])

  const homeActive = pathname === '/'
  const searchActive = pathname.startsWith('/app/search')

  return (
    <>
      <header className="top">
        <Link className="brand" href="/">
          Saizen
        </Link>
        <nav>
          <Link href="/" className={homeActive ? 'active' : undefined}>
              Home
            </Link>
            <Link href="/app/search/" className={searchActive ? 'active' : undefined}>
              Search
            </Link>
            <Link
              href="/app/extensions/"
              className={pathname.startsWith('/app/extensions') ? 'active' : undefined}
            >
              Extensions
            </Link>
        </nav>
      </header>
      <main className="container">{children}</main>
    </>
  )
}
