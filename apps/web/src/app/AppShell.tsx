'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { installSaizenBridge } from '@/lib/native/bridge'
import { refreshNative } from '@/lib/native'
import { markBridgeReady } from '@/lib/native/ready'
import { hydrateTokenMirrors, scrubLegacyCredentialSecrets, clearOAuthCredentialOverrides } from '@/lib/auth'
import { GlassTabBar, GLASS_TAB_ITEMS } from '@/components/saizen/GlassTabBar'
import { PaneErrorBoundary } from '@/components/saizen/PaneErrorBoundary'
import { Toaster } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'
import { applyAppearance } from '@/lib/theme/appearance'
import { setDownloadSettings } from '@/lib/downloads/settings'
import {
  noteScrollY,
  rememberCurrentScroll,
  restoreScroll,
  scrollKey,
  setScroll,
  takeLastKnownScroll
} from '@/lib/nav/scrollMemory'
import HomePage from './page'
import SearchPage from './app/search/page'
import SchedulePage from './app/schedule/page'
import SettingsPage from './app/settings/page'

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
  const isSchedule = pathname.startsWith('/app/schedule')
  const isSettings = pathname.startsWith('/app/settings')
  const isAnime = pathname.startsWith('/app/anime')
  const keepAliveRoute = isHome || isSearch || isSchedule || isSettings
  const hideBottomNav = isPlayer || isAnime
  const immersiveHeader = isHome || isAnime
  const [headerFaded, setHeaderFaded] = useState(false)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const routeKeyRef = useRef(
    typeof window !== 'undefined'
      ? scrollKey(pathname, window.location.search)
      : scrollKey(pathname)
  )

  useEffect(() => {
    applyAppearance()
    void (async () => {
      await installSaizenBridge()
      refreshNative()
      scrubLegacyCredentialSecrets()
      clearOAuthCredentialOverrides()
      await hydrateTokenMirrors()
      markBridgeReady()
      setDownloadSettings({})
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

  // Track scroll for the active route; on leave, persist last known Y (not a
  // post-navigation window.scrollY, which Next often resets to 0 first).
  useEffect(() => {
    const key = scrollKey(pathname, window.location.search)
    routeKeyRef.current = key
    noteScrollY(window.scrollY)

    const onScroll = () => {
      const y = window.scrollY
      noteScrollY(y)
      setScroll(key, y)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      setScroll(key, takeLastKnownScroll())
      window.removeEventListener('scroll', onScroll)
    }
  }, [pathname])

  useEffect(() => {
    const key = scrollKey(pathname, window.location.search)
    routeKeyRef.current = key
    restoreScroll(key)
  }, [pathname])

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
    <div className="flex min-h-dvh flex-col bg-background text-foreground select-none">
      {!isPlayer ? (
        <header
          className={cn(
            'fixed inset-x-0 top-0 z-40 pt-[var(--safe-top)] transition-opacity duration-300',
            immersiveHeader ? 'bg-transparent' : 'saizen-top-glass',
            immersiveHeader && headerFaded && 'pointer-events-none'
          )}
        >
          {immersiveHeader ? (
            <div
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-x-0 top-0 h-[calc(2.75rem+var(--safe-top))] bg-gradient-to-b from-background/55 via-background/20 to-transparent transition-opacity duration-300',
                headerFaded ? 'opacity-0' : 'opacity-100'
              )}
            />
          ) : null}
          <div
            className={cn(
              'relative mx-auto flex h-11 w-full max-w-5xl items-center justify-between px-3.5 transition-all duration-300 sm:h-12 sm:px-5',
              immersiveHeader && headerFaded && 'opacity-0 -translate-y-1'
            )}
          >
            <Link
              href="/"
              replace
              scroll={false}
              draggable={false}
              onClick={() => rememberCurrentScroll()}
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
                    replace
                    scroll={false}
                    draggable={false}
                    onClick={() => rememberCurrentScroll()}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-[0.8125rem] transition-[color,background-color,transform] duration-200',
                      'active:scale-[0.97]',
                      active
                        ? 'bg-white/12 font-bold text-foreground'
                        : 'font-normal text-muted-foreground hover:bg-white/8 hover:text-foreground'
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
              ? 'px-0 pb-[calc(4.5rem+var(--safe-bottom))] md:pb-8'
              : isAnime
                ? 'px-3.5 pt-0 pb-[calc(1rem+var(--safe-bottom))] sm:px-5'
                : 'px-3.5 pt-[calc(2.75rem+var(--safe-top))] pb-[calc(4.5rem+var(--safe-bottom))] sm:px-5 sm:pt-[calc(3.25rem+var(--safe-top))] md:pb-8'
        )}
      >
        {/* Keep primary tabs mounted so tab switches don't remount / lose scroll */}
        <div
          className={cn(!isHome && 'hidden')}
          aria-hidden={!isHome}
          {...(!isHome ? { inert: true } : {})}
        >
          <PaneErrorBoundary name="Home">
            <HomePage />
          </PaneErrorBoundary>
        </div>
        <div
          className={cn(!isSearch && 'hidden')}
          aria-hidden={!isSearch}
          {...(!isSearch ? { inert: true } : {})}
        >
          <PaneErrorBoundary name="Search">
            <SearchPage />
          </PaneErrorBoundary>
        </div>
        <div
          className={cn(!isSchedule && 'hidden')}
          aria-hidden={!isSchedule}
          {...(!isSchedule ? { inert: true } : {})}
        >
          <PaneErrorBoundary name="Schedule">
            <SchedulePage />
          </PaneErrorBoundary>
        </div>
        <div
          className={cn(!isSettings && 'hidden')}
          aria-hidden={!isSettings}
          {...(!isSettings ? { inert: true } : {})}
        >
          <PaneErrorBoundary name="Settings">
            <SettingsPage />
          </PaneErrorBoundary>
        </div>
        {!keepAliveRoute ? children : null}
      </main>

      <div
        className={cn(
          'pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 md:hidden',
          'pb-[max(8px,calc(var(--safe-bottom)+4px))]',
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
