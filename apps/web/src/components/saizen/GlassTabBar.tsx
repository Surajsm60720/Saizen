'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react'
import {
  Home,
  Search,
  CalendarDays,
  MoreHorizontal,
  type LucideIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { hapticPress } from '@/lib/haptics'
import { rememberCurrentScroll } from '@/lib/nav/scrollMemory'

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

type Indicator = { x: number; w: number; ready: boolean }

const DRAG_THRESHOLD_PX = 5
const PILL_INSET = 3

export function GlassTabBar({
  pathname,
  hidden
}: {
  pathname: string
  hidden: boolean
}) {
  const router = useRouter()
  const listRef = useRef<HTMLUListElement>(null)
  const itemRefs = useRef<(HTMLLIElement | null)[]>([])
  const [indicator, setIndicator] = useState<Indicator>({
    x: 0,
    w: 0,
    ready: false
  })
  /** Highlight / navigation target while press-drag or optimistic tap. */
  const [scrubIndex, setScrubIndex] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)

  const pointerIdRef = useRef<number | null>(null)
  const startXRef = useRef(0)
  const didDragRef = useRef(false)
  const scrubIndexRef = useRef(0)
  const suppressClickRef = useRef(false)

  const routeIndex = GLASS_TAB_ITEMS.findIndex((item) => item.match(pathname))
  const settledIndex = routeIndex >= 0 ? routeIndex : 0
  const activeIndex = scrubIndex ?? settledIndex

  useEffect(() => {
    // Route caught up — drop scrub highlight unless a gesture is live
    if (pointerIdRef.current == null) setScrubIndex(null)
  }, [pathname])

  const pillForIndex = useCallback((index: number): Indicator | null => {
    const item = itemRefs.current[index]
    if (!item) return null
    return {
      x: item.offsetLeft + PILL_INSET,
      w: Math.max(0, item.offsetWidth - PILL_INSET * 2),
      ready: true
    }
  }, [])

  const indexFromClientX = useCallback((clientX: number) => {
    const list = listRef.current
    if (!list) return 0
    const rect = list.getBoundingClientRect()
    const x = clientX - rect.left
    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < GLASS_TAB_ITEMS.length; i++) {
      const el = itemRefs.current[i]
      if (!el) continue
      const center = el.offsetLeft + el.offsetWidth / 2
      const dist = Math.abs(x - center)
      if (dist < bestDist) {
        bestDist = dist
        best = i
      }
    }
    return best
  }, [])

  /** 1:1 finger tracking — pill centers under the pointer, clamped to the track. */
  const pillFromClientX = useCallback((clientX: number): Indicator | null => {
    const list = listRef.current
    const sample = itemRefs.current[0]
    if (!list || !sample) return null
    const w = Math.max(0, sample.offsetWidth - PILL_INSET * 2)
    const rect = list.getBoundingClientRect()
    const localX = clientX - rect.left
    const minX = PILL_INSET
    const maxX = Math.max(minX, list.clientWidth - w - PILL_INSET)
    const x = Math.min(Math.max(localX - w / 2, minX), maxX)
    return { x, w, ready: true }
  }, [])

  const snapToIndex = useCallback(
    (index: number) => {
      const next = pillForIndex(index)
      if (next) setIndicator(next)
    },
    [pillForIndex]
  )

  const measure = useCallback(() => {
    if (pointerIdRef.current != null) return
    snapToIndex(activeIndex)
  }, [activeIndex, snapToIndex])

  useLayoutEffect(() => {
    measure()
  }, [measure, hidden])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const ro = new ResizeObserver(() => measure())
    ro.observe(list)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  const commitIndex = useCallback(
    (index: number) => {
      const item = GLASS_TAB_ITEMS[index]
      if (!item) return
      setScrubIndex(index)
      scrubIndexRef.current = index
      snapToIndex(index)
      if (!item.match(pathname)) {
        // Lateral tab moves replace history so edge-swipe doesn't hop across tabs.
        rememberCurrentScroll()
        router.replace(item.href, { scroll: false })
      }
    },
    [pathname, router, snapToIndex]
  )

  const onPointerDown = (e: React.PointerEvent<HTMLUListElement>) => {
    if (e.button !== 0) return
    const list = listRef.current
    if (!list) return

    pointerIdRef.current = e.pointerId
    startXRef.current = e.clientX
    didDragRef.current = false
    suppressClickRef.current = false
    list.setPointerCapture(e.pointerId)

    const index = indexFromClientX(e.clientX)
    scrubIndexRef.current = index
    setScrubIndex(index)
    if (index !== settledIndex) hapticPress('selection')

    const pill = pillFromClientX(e.clientX) ?? pillForIndex(index)
    if (pill) setIndicator(pill)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLUListElement>) => {
    if (pointerIdRef.current !== e.pointerId) return

    const dx = Math.abs(e.clientX - startXRef.current)
    if (!didDragRef.current && dx >= DRAG_THRESHOLD_PX) {
      didDragRef.current = true
      setDragging(true)
    }

    const pill = pillFromClientX(e.clientX)
    if (pill) setIndicator(pill)

    const index = indexFromClientX(e.clientX)
    if (index !== scrubIndexRef.current) {
      scrubIndexRef.current = index
      setScrubIndex(index)
      hapticPress('selection')
    }
  }

  const endPointer = (e: React.PointerEvent<HTMLUListElement>) => {
    if (pointerIdRef.current !== e.pointerId) return
    const list = listRef.current
    try {
      list?.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
    pointerIdRef.current = null

    const index = indexFromClientX(e.clientX)
    const dragged = didDragRef.current
    setDragging(false)
    didDragRef.current = false

    if (dragged) {
      suppressClickRef.current = true
      commitIndex(index)
    } else {
      // Tap: Link handles navigation; just optimistic snap
      scrubIndexRef.current = index
      setScrubIndex(index)
      snapToIndex(index)
      if (index !== settledIndex) hapticPress('selection')
    }
  }

  return (
    <nav
      className={cn(
        'saizen-tab-glass w-full max-w-[min(88vw,17.5rem)] overflow-hidden rounded-[1.55rem]',
        'transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        'touch-none',
        hidden
          ? 'pointer-events-none translate-y-2 opacity-0'
          : 'pointer-events-auto translate-y-0 opacity-100'
      )}
      aria-label="Primary"
    >
      <ul
        ref={listRef}
        className="relative z-10 grid h-[3.25rem] grid-cols-4 items-center gap-0.5 px-1"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <li
          aria-hidden
          className={cn(
            'saizen-tab-indicator pointer-events-none absolute top-1/2 left-0 z-0 h-[2.75rem] rounded-[1.15rem]',
            dragging && 'saizen-tab-indicator--dragging',
            !indicator.ready && 'opacity-0'
          )}
          style={{
            width: indicator.w,
            transform: `translate3d(${indicator.x}px, -50%, 0)`
          }}
        />
        {GLASS_TAB_ITEMS.map((item, index) => {
          const active = index === activeIndex
          const Icon = item.icon
          return (
            <li
              key={item.href}
              ref={(el) => {
                itemRefs.current[index] = el
              }}
              className="relative z-10 min-w-0"
            >
              <Link
                href={item.href}
                replace
                scroll={false}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                title={item.label}
                draggable={false}
                onClick={(e) => {
                  if (suppressClickRef.current) {
                    e.preventDefault()
                    suppressClickRef.current = false
                    return
                  }
                  rememberCurrentScroll()
                  setScrubIndex(index)
                  snapToIndex(index)
                }}
                className={cn(
                  'relative flex size-full min-h-[2.9rem] items-center justify-center rounded-[1.2rem]',
                  'shadow-none ring-0 outline-none',
                  'transition-[color,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
                  'active:scale-[0.94] motion-reduce:active:scale-100',
                  'focus-visible:ring-2 focus-visible:ring-primary/50',
                  active
                    ? 'text-primary'
                    : 'text-white/55 active:text-white/90'
                )}
              >
                <Icon
                  className={cn(
                    'size-[1.35rem] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
                    active && 'scale-[1.08]'
                  )}
                  strokeWidth={active ? 2.35 : 1.7}
                />
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
