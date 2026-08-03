const KEY = 'saizen:watch-settings'

export interface WatchSettings {
  /** Mark episode complete when position/duration crosses this % (70–100). */
  markWatchedAtPercent: number
  /** Persist continue-watching rail entries. */
  continueWatchingEnabled: boolean
  /** When true, player seeks past AniSkip OP/ED intervals once on enter. */
  autoSkipOpEd: boolean
}

const DEFAULTS: WatchSettings = {
  markWatchedAtPercent: 90,
  continueWatchingEnabled: true,
  autoSkipOpEd: false
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return DEFAULTS.markWatchedAtPercent
  return Math.min(100, Math.max(70, Math.round(n)))
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
      autoSkipOpEd: parsed.autoSkipOpEd ?? DEFAULTS.autoSkipOpEd
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
  if (typeof window !== 'undefined') {
    localStorage.setItem(KEY, JSON.stringify(next))
  }
  return next
}
