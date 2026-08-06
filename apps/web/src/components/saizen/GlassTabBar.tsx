'use client'

import Link from 'next/link'
import {
  Home,
  Search,
  CalendarDays,
  MoreHorizontal,
  type LucideIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'

type TabItem = {
  href: string
  label: string
  icon: LucideIcon
  match: (pathname: string) => boolean
}

export const GLASS_TAB_ITEMS: readonly TabItem[] = [
  { href: '/', label: 'Home', icon: Home, match: (p) => p === '/' },
  {
    href: '/app/search/',
    label: 'Search',
    icon: Search,
    match: (p) => p.startsWith('/app/search')
  },
  {
    href: '/app/schedule/',
    label: 'Schedule',
    icon: CalendarDays,
    match: (p) => p.startsWith('/app/schedule')
  },
  {
    href: '/app/settings/',
    label: 'More',
    icon: MoreHorizontal,
    match: (p) =>
      p.startsWith('/app/settings') ||
      p.startsWith('/app/appearance') ||
      p.startsWith('/app/changelog') ||
      p.startsWith('/app/downloads') ||
      p.startsWith('/app/extensions')
  }
] as const

export function GlassTabBar({
  pathname,
  hidden
}: {
  pathname: string
  hidden: boolean
}) {
  return (
    <nav
      className={cn(
        'saizen-tab-glass w-full max-w-[min(94vw,22.5rem)] overflow-hidden rounded-full',
        hidden ? 'pointer-events-none' : 'pointer-events-auto'
      )}
      aria-label="Primary"
    >
      <ul className="grid h-[3.85rem] grid-cols-4 items-center gap-0.5 px-1.5">
        {GLASS_TAB_ITEMS.map((item) => {
          const active = item.match(pathname)
          const Icon = item.icon
          return (
            <li key={item.href} className="min-w-0">
              <Link
                href={item.href}
                draggable={false}
                className={cn(
                  'relative flex h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-full',
                  'shadow-none ring-0 outline-none transition-colors duration-200',
                  'focus-visible:ring-2 focus-visible:ring-primary/50',
                  active
                    ? 'bg-white/[0.08] text-primary'
                    : 'text-muted-foreground active:bg-white/[0.05] active:text-foreground'
                )}
              >
                <Icon
                  className={cn(
                    'size-[1.2rem] transition-transform duration-200',
                    active &&
                      'scale-105 drop-shadow-[0_0_8px_rgba(232,196,120,0.45)]'
                  )}
                  strokeWidth={active ? 2.35 : 1.75}
                />
                <span
                  className={cn(
                    'max-w-full truncate px-0.5 text-[0.62rem] leading-none',
                    active && 'font-medium'
                  )}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
