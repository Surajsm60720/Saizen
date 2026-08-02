import type { AnimeMedia } from './client'

const KEY = 'saizen:home-rails'
const TTL_MS = 20 * 60 * 1000

export type HomeRailsCache = {
  at: number
  trending: AnimeMedia[]
  seasonal: AnimeMedia[]
  allTime: AnimeMedia[]
}

export function peekHomeRails(): HomeRailsCache | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as HomeRailsCache
    if (!parsed?.at || Date.now() - parsed.at > TTL_MS) return null
    if (!Array.isArray(parsed.trending)) return null
    return parsed
  } catch {
    return null
  }
}

export function writeHomeRails(data: Omit<HomeRailsCache, 'at'>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ ...data, at: Date.now() } satisfies HomeRailsCache)
    )
  } catch {
    /* quota */
  }
}
