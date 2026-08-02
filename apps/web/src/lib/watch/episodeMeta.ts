const KEY = 'saizen:episode-meta'

export interface EpisodeMetaEntry {
  anilistId: number
  episode: number
  /** Probed media duration in seconds */
  durationSec: number
  updatedAt: number
}

function storageKey(anilistId: number, episode: number) {
  return `${anilistId}:${episode}`
}

function readMap(): Record<string, EpisodeMetaEntry> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, EpisodeMetaEntry>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeMap(map: Record<string, EpisodeMetaEntry>) {
  if (typeof window === 'undefined') return
  try {
    const entries = Object.entries(map)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, 400)
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    /* quota / private mode */
  }
}

export function getProbedDurationSec(
  anilistId: number,
  episode: number
): number | null {
  const entry = readMap()[storageKey(anilistId, episode)]
  if (!entry?.durationSec || !Number.isFinite(entry.durationSec)) return null
  if (entry.durationSec < 30) return null
  return entry.durationSec
}

export function recordProbedDuration(
  anilistId: number,
  episode: number,
  durationSec: number
) {
  if (!anilistId || !episode || !Number.isFinite(durationSec) || durationSec < 30) return
  const map = readMap()
  map[storageKey(anilistId, episode)] = {
    anilistId,
    episode,
    durationSec: Math.round(durationSec),
    updatedAt: Date.now()
  }
  writeMap(map)
}

/** Format seconds → "24 min" (exact / probed). */
export function formatExactMinutes(durationSec: number): string {
  const mins = Math.max(1, Math.round(durationSec / 60))
  return `${mins} min`
}

/** Format AniList average minutes → "~24 min". */
export function formatAvgMinutes(durationMin: number): string {
  return `~${durationMin} min`
}
