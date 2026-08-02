import type { AnimeMedia } from '@/lib/anilist'
import { displayTitle } from '@/lib/anilist'

import { getWatchSettings } from './settings'

const KEY = 'saizen:continue'

export interface ContinueEntry {
  anilistId: number
  title: string
  cover?: string | null
  episode: number
  updatedAt: number
}

function read(): ContinueEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ContinueEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function write(entries: ContinueEntry[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, 24)))
  } catch {
    /* quota / private mode */
  }
}

export function listContinueWatching(): ContinueEntry[] {
  if (!getWatchSettings().continueWatchingEnabled) return []
  return read().sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Merge AniList CURRENT entries with local continue rail (newer wins per title). */
export function mergeContinueWatching(remote: ContinueEntry[]): ContinueEntry[] {
  if (!getWatchSettings().continueWatchingEnabled) return []
  const map = new Map<number, ContinueEntry>()
  for (const e of [...read(), ...remote]) {
    const prev = map.get(e.anilistId)
    if (!prev || e.updatedAt >= prev.updatedAt) map.set(e.anilistId, e)
  }
  const merged = [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  write(merged)
  return merged.slice(0, 24)
}

export function recordContinueWatching(
  media: Pick<AnimeMedia, 'id' | 'title' | 'coverImage'>,
  episode: number
) {
  if (!getWatchSettings().continueWatchingEnabled) return
  const next: ContinueEntry = {
    anilistId: media.id,
    title: displayTitle(media as AnimeMedia),
    cover: media.coverImage?.large ?? media.coverImage?.medium,
    episode,
    updatedAt: Date.now()
  }
  const rest = read().filter((e) => e.anilistId !== media.id)
  write([next, ...rest])
}
