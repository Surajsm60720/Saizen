const KEY = 'saizen:watch-settings'

export interface WatchSettings {
  /** Mark episode complete when position/duration crosses this % (70–100). */
  markWatchedAtPercent: number
  /** Persist continue-watching rail entries. */
  continueWatchingEnabled: boolean
  /** When true, player seeks past AniSkip OP/ED intervals once on enter. */
  autoSkipOpEd: boolean
  /** Left/right double & triple tap seek on the video surface. */
  gestureSeekEnabled: boolean
  /** Seconds per double-tap seek (5–30). */
  doubleTapSeekSec: number
  /** Seconds per triple-tap seek (10–90). 0 disables triple tap. */
  tripleTapSeekSec: number
  /** When an episode ends, open the next episode’s source sheet. */
  autoplayNext: boolean
}

const DEFAULTS: WatchSettings = {
  markWatchedAtPercent: 90,
  continueWatchingEnabled: true,
  autoSkipOpEd: false,
  gestureSeekEnabled: true,
  doubleTapSeekSec: 10,
  tripleTapSeekSec: 30,
  autoplayNext: false
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return DEFAULTS.markWatchedAtPercent
  return Math.min(100, Math.max(70, Math.round(n)))
}

function clampDoubleTap(n: number): number {
  if (!Number.isFinite(n)) return DEFAULTS.doubleTapSeekSec
  return Math.min(30, Math.max(5, Math.round(n)))
}

function clampTripleTap(n: number): number {
  if (!Number.isFinite(n)) return DEFAULTS.tripleTapSeekSec
  const rounded = Math.round(n)
  if (rounded <= 0) return 0
  return Math.min(90, Math.max(10, rounded))
}

export function getWatchSettings(): WatchSettings {
  if (typeof window === 'undefined') return { ...DEFAULTS }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<WatchSettings>
    return {
      markWatchedAtPercent: clampPercent(
        parsed.markWatchedAtPercent ?? DEFAULTS.markWatchedAtPercent
      ),
      continueWatchingEnabled:
        parsed.continueWatchingEnabled ?? DEFAULTS.continueWatchingEnabled,
      autoSkipOpEd: parsed.autoSkipOpEd ?? DEFAULTS.autoSkipOpEd,
      gestureSeekEnabled: parsed.gestureSeekEnabled ?? DEFAULTS.gestureSeekEnabled,
      doubleTapSeekSec: clampDoubleTap(parsed.doubleTapSeekSec ?? DEFAULTS.doubleTapSeekSec),
      tripleTapSeekSec: clampTripleTap(parsed.tripleTapSeekSec ?? DEFAULTS.tripleTapSeekSec),
      autoplayNext: parsed.autoplayNext ?? DEFAULTS.autoplayNext
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function setWatchSettings(patch: Partial<WatchSettings>): WatchSettings {
  const next: WatchSettings = {
    ...getWatchSettings(),
    ...patch
  }
  next.markWatchedAtPercent = clampPercent(next.markWatchedAtPercent)
  next.doubleTapSeekSec = clampDoubleTap(next.doubleTapSeekSec)
  next.tripleTapSeekSec = clampTripleTap(next.tripleTapSeekSec)
  if (typeof window !== 'undefined') {
    localStorage.setItem(KEY, JSON.stringify(next))
  }
  return next
}
