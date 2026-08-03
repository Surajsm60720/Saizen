'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  Home,
  Search,
  Puzzle,
  CalendarDays,
  MoreHorizontal
} from 'lucide-react'
import { installSaizenBridge } from '@/lib/native/bridge'
import { refreshNative } from '@/lib/native'
import { markBridgeReady } from '@/lib/native/ready'
import { hydrateTokenMirrors, scrubLegacyCredentialSecrets, clearOAuthCredentialOverrides } from '@/lib/auth'
import { Toaster } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'
import HomePage from './page'

const primaryNav = [
  { href: '/', label: 'Home', icon: Home, match: (p: string) => p === '/' },
  {
    href: '/app/search/',
    label: 'Search',
    icon: Search,
    match: (p: string) => p.startsWith('/app/search')
  },
  {
    href: '/app/schedule/',
    label: 'Schedule',
    icon: CalendarDays,
    match: (p: string) => p.startsWith('/app/schedule')
  },
  {
    href: '/app/extensions/',
    label: 'Extensions',
    icon: Puzzle,
    match: (p: string) => p.startsWith('/app/extensions')
  },
  {
    href: '/app/settings/',
    label: 'More',
    icon: MoreHorizontal,
    match: (p: string) =>
      p.startsWith('/app/settings') || p.startsWith('/app/changelog')
  }
] as const

const desktopNav = [
  { href: '/', label: 'Home', match: (p: string) => p === '/' },
  {
    href: '/app/search/',
    label: 'Search',
    match: (p: string) => p.startsWith('/app/search')
  },
  {
    href: '/app/schedule/',
    label: 'Schedule',
    match: (p: string) => p.startsWith('/app/schedule')
  },
  {
    href: '/app/extensions/',
    label: 'Extensions',
    match: (p: string) => p.startsWith('/app/extensions')
  },
  {
    href: '/app/settings/',
    label: 'Settings',
    match: (p: string) => p.startsWith('/app/settings')
  }
] as const

const navEase = 'cubic-bezier(0.32, 0.72, 0, 1)'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isPlayer = pathname.startsWith('/app/player')
  const isHome = pathname === '/'
  const isAnime = pathname.startsWith('/app/anime')
  const hideBottomNav = isPlayer || isAnime
  const immersiveHeader = isHome || isAnime
  const [navCompact, setNavCompact] = useState(false)
  const [headerFaded, setHeaderFaded] = useState(false)
  const homeScrollRef = useRef(0)

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

  // Remember Home scroll while visible; restore when coming back (keep-alive).
  useEffect(() => {
    if (!isHome) return
    const onScroll = () => {
      homeScrollRef.current = window.scrollY
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [isHome])

  useEffect(() => {
    if (isHome) {
      const y = homeScrollRef.current
      requestAnimationFrame(() => window.scrollTo(0, y))
    } else {
      window.scrollTo(0, 0)
    }
  }, [isHome])

  useEffect(() => {
    if (hideBottomNav) {
      setNavCompact(false)
    }
    if (!immersiveHeader) {
      setHeaderFaded(false)
    }
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(() => {
        const y = window.scrollY
        if (!hideBottomNav) setNavCompact(y > 40)
        if (immersiveHeader) setHeaderFaded(y > (isAnime ? 90 : 56))
        ticking = false
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [hideBottomNav, pathname, immersiveHeader, isAnime])

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
        {!isHome ? children : null}
      </main>

      <div
        className={cn(
          'pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center md:hidden',
          'transition-[padding,transform,opacity] duration-500',
          hideBottomNav && 'translate-y-[120%] opacity-0',
          navCompact
            ? 'px-3 pb-[max(8px,calc(var(--safe-bottom)*0.45+4px))]'
            : 'px-0 pb-0'
        )}
        style={{ transitionTimingFunction: navEase }}
      >
        <nav
          className={cn(
            'pointer-events-auto will-change-transform',
            'transition-[width,max-width,border-radius,background-color,box-shadow,border-color,padding,transform] duration-500',
            navCompact
              ? 'mb-0 w-auto max-w-[min(92vw,20.5rem)] scale-100 rounded-full border border-white/14 bg-[#141416]/62 px-1.5 shadow-[0_10px_28px_rgba(0,0,0,0.4)] backdrop-blur-xl'
              : 'w-full max-w-none scale-100 rounded-none border border-transparent border-t-white/10 bg-[#141416]/72 shadow-none backdrop-blur-xl'
          )}
          style={{ transitionTimingFunction: navEase }}
          aria-label="Primary"
        >
          <ul
            className={cn(
              'grid grid-cols-5 transition-[height,padding] duration-500',
              navCompact
                ? 'h-11 items-center gap-0 px-0.5 py-0'
                : 'mx-auto h-[4.35rem] max-w-lg pt-1 pb-[max(2px,var(--safe-bottom))]'
            )}
            style={{ transitionTimingFunction: navEase }}
          >
            {primaryNav.map((item) => {
              const active = item.match(pathname)
              const Icon = item.icon
              return (
                <li key={item.href} className="min-w-0">
                  <Link
                    href={item.href}
                    draggable={false}
                    className={cn(
                      'flex h-full flex-col items-center justify-center bg-transparent transition-all duration-500',
                      'shadow-none ring-0 outline-none focus-visible:ring-0',
                      navCompact ? 'gap-0 px-2.5' : 'gap-0.5 pt-0.5',
                      active
                        ? 'text-primary'
                        : 'text-muted-foreground active:text-foreground'
                    )}
                    style={{ transitionTimingFunction: navEase }}
                  >
                    <Icon
                      className={cn(
                        'transition-[transform,filter] duration-500',
                        navCompact ? 'size-[1.3rem]' : 'size-5',
                        active && (navCompact ? 'scale-110' : 'scale-105'),
                        active &&
                          navCompact &&
                          'drop-shadow-[0_0_7px_rgba(232,196,120,0.55)]'
                      )}
                      strokeWidth={active ? 2.35 : 1.75}
                    />
                    <span
                      className={cn(
                        'origin-bottom text-[0.65rem] transition-all duration-500',
                        active && 'font-medium',
                        navCompact
                          ? 'pointer-events-none max-h-0 translate-y-1 scale-75 overflow-hidden opacity-0'
                          : 'max-h-4 translate-y-0 scale-100 opacity-100'
                      )}
                      style={{ transitionTimingFunction: navEase }}
                    >
                      {item.label}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>

      <Toaster position="top-center" theme="dark" richColors closeButton />
    </div>
  )
}
