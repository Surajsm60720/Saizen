/**
 * Window scroll positions keyed by route. Lives outside React so keep-alive
 * panes and remounting pages can restore without racing Next's scroll-to-top.
 */

const positions = new Map<string, number>()
let lastKnown = 0

export function scrollKey(pathname: string, search = ''): string {
  const path = pathname.endsWith('/') || pathname === '/' ? pathname : `${pathname}/`
  if (path.startsWith('/app/anime')) {
    const id = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get(
      'id'
    )
    return id ? `/app/anime/?id=${id}` : path
  }
  return path
}

export function getScroll(key: string): number {
  return positions.get(key) ?? 0
}

export function setScroll(key: string, y: number): void {
  if (!Number.isFinite(y)) return
  positions.set(key, Math.max(0, y))
  lastKnown = Math.max(0, y)
}

/** Snapshot the current window scroll into memory for the active route. */
export function rememberCurrentScroll(pathname?: string, search?: string): void {
  if (typeof window === 'undefined') return
  const key = scrollKey(
    pathname ?? window.location.pathname,
    search ?? window.location.search
  )
  setScroll(key, window.scrollY)
}

export function restoreScroll(key: string): void {
  if (typeof window === 'undefined') return
  const y = getScroll(key)
  const apply = () => window.scrollTo(0, y)
  apply()
  requestAnimationFrame(apply)
}

export function noteScrollY(y: number): void {
  if (!Number.isFinite(y)) return
  lastKnown = Math.max(0, y)
}

export function takeLastKnownScroll(): number {
  return lastKnown
}
