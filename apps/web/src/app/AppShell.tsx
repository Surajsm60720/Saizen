'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { installSaizenBridge } from '@/lib/native/bridge'
import { refreshNative } from '@/lib/native'
import { markBridgeReady } from '@/lib/native/ready'
import { hydrateTokenMirrors, scrubLegacyCredentialSecrets, clearOAuthCredentialOverrides } from '@/lib/auth'
import { GlassTabBar, GLASS_TAB_ITEMS } from '@/components/saizen/GlassTabBar'
import { Toaster } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'
import HomePage from './page'
import SearchPage from './app/search/page'

const desktopNav = GLASS_TAB_ITEMS.map((item) => ({
  href: item.href,
  label: item.label === 'More' ? 'Settings' : item.label,
  match: item.match
}))

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isPlayer = pathname.startsWith('/app/player')
  const isHome = pathname === '/'
  const isSearch = pathname.startsWith('/app/search')
  const isAnime = pathname.startsWith('/app/anime')
  const hideBottomNav = isPlayer || isAnime
  const immersiveHeader = isHome || isAnime
  const [headerFaded, setHeaderFaded] = useState(false)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const homeScrollRef = useRef(0)
  const searchScrollRef = useRef(0)

  useEffect(() => {
    void (async () => {
      await installSaizenBridge()
      refreshNative()
      scrubLegacyCredentialSecrets()
      clearOAuthCredentialOverrides()
      await hydrateTokenMirrors()
      markBridgeReady()
    })()
  }, [])

  // Hide bottom nav while the soft keyboard is open (iOS visualViewport shrinks).
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      setKeyboardOpen(overlap > 100)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  // Remember Home / Search scroll while visible; restore when coming back (keep-alive).
  useEffect(() => {
    if (!isHome) return
    const onScroll = () => {
      homeScrollRef.current = window.scrollY
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [isHome])

  useEffect(() => {
    if (!isSearch) return
    const onScroll = () => {
      searchScrollRef.current = window.scrollY
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [isSearch])

  useEffect(() => {
    if (isHome) {
      const y = homeScrollRef.current
      requestAnimationFrame(() => window.scrollTo(0, y))
    } else if (isSearch) {
      const y = searchScrollRef.current
      requestAnimationFrame(() => window.scrollTo(0, y))
    } else {
      window.scrollTo(0, 0)
    }
  }, [isHome, isSearch, pathname])

  useEffect(() => {
    if (!immersiveHeader) {
      setHeaderFaded(false)
      return
    }
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(() => {
        setHeaderFaded(window.scrollY > (isAnime ? 90 : 56))
        ticking = false
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [pathname, immersiveHeader, isAnime])

  return (
    <div className="flex min-h-dvh flex-col bg-[#141416] text-foreground select-none">
      {!isPlayer ? (
        <header
          className={cn(
            'fixed inset-x-0 top-0 z-40 pt-[var(--safe-top)] transition-opacity duration-300',
            immersiveHeader
              ? 'bg-transparent'
              : 'border-b border-white/8 bg-[#141416]/50 backdrop-blur-xl supports-backdrop-filter:bg-[#141416]/35',
            immersiveHeader && headerFaded && 'pointer-events-none'
          )}
        >
          {immersiveHeader ? (
            <div
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-x-0 top-0 h-[calc(3.25rem+var(--safe-top))] bg-gradient-to-b from-[#141416]/55 via-[#141416]/20 to-transparent transition-opacity duration-300',
                headerFaded ? 'opacity-0' : 'opacity-100'
              )}
            />
          ) : null}
          <div
            className={cn(
              'relative mx-auto flex h-12 w-full max-w-5xl items-center justify-between px-4 transition-all duration-300 sm:h-14 sm:px-5',
              immersiveHeader && headerFaded && 'opacity-0 -translate-y-1'
            )}
          >
            <Link
              href="/"
              draggable={false}
              className="text-brand text-foreground transition-opacity hover:opacity-90"
              tabIndex={immersiveHeader && headerFaded ? -1 : undefined}
            >
              Saizen
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              {desktopNav.map((item) => {
                const active = item.match(pathname)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    draggable={false}
                    className={cn(
                      'rounded-lg px-3 py-2 text-sm transition-colors',
                      active
                        ? 'bg-white/10 text-foreground'
                        : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                    )}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>
        </header>
      ) : null}

      <main
        className={cn(
          'mx-auto w-full max-w-5xl flex-1',
          isPlayer
            ? 'max-w-none px-0 py-0'
            : isHome
              ? 'px-0 pb-24 md:pb-10'
              : isAnime
                ? 'px-4 pt-0 pb-[calc(1.25rem+var(--safe-bottom))] sm:px-5'
                : 'px-4 pt-[calc(3.25rem+var(--safe-top))] pb-24 sm:px-5 sm:pt-[calc(3.75rem+var(--safe-top))] md:pb-10'
        )}
      >
        {/* Keep Home mounted so back-nav doesn't remount / refetch / flash */}
        <div
          className={cn(!isHome && 'hidden')}
          aria-hidden={!isHome}
          {...(!isHome ? { inert: true } : {})}
        >
          <HomePage />
        </div>
        {/* Keep Search mounted so results + filters survive anime detail back-nav */}
        <div
          className={cn(!isSearch && 'hidden')}
          aria-hidden={!isSearch}
          {...(!isSearch ? { inert: true } : {})}
        >
          <SearchPage />
        </div>
        {!isHome && !isSearch ? children : null}
      </main>

      <div
        className={cn(
          'pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 md:hidden',
          'pb-[max(10px,calc(var(--safe-bottom)+8px))]',
          'transition-[transform,opacity] duration-300 ease-out',
          (hideBottomNav || keyboardOpen) && 'translate-y-[120%] opacity-0'
        )}
        aria-hidden={hideBottomNav || keyboardOpen}
      >
        <GlassTabBar
          pathname={pathname}
          hidden={hideBottomNav || keyboardOpen}
        />
      </div>

      <Toaster position="top-center" theme="dark" richColors closeButton />
    </div>
  )
}
