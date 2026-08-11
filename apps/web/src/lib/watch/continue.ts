import type { AnimeMedia } from '@/lib/anilist'
import { displayTitle } from '@/lib/anilist'

import { getWatchSettings } from './settings'
import {
  getIncognitoSessionContinueKey,
  isIncognitoMode
} from '@/lib/privacy/incognito'

const KEY = 'saizen:continue'

export interface ContinueEntry {
  anilistId: number
  title: string
  cover?: string | null
  episode: number
  updatedAt: number
}

type ContinueListener = (entries: ContinueEntry[]) => void
const listeners = new Set<ContinueListener>()

function read(): ContinueEntry[] {
  if (typeof window === 'undefined') return []
  try {
    if (isIncognitoMode()) {
      const raw = sessionStorage.getItem(getIncognitoSessionContinueKey())
      if (!raw) return []
      const parsed = JSON.parse(raw) as ContinueEntry[]
      return Array.isArray(parsed) ? parsed : []
    }
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
  const next = entries.slice(0, 24)
  try {
    if (isIncognitoMode()) {
      sessionStorage.setItem(getIncognitoSessionContinueKey(), JSON.stringify(next))
    } else {
      localStorage.setItem(KEY, JSON.stringify(next))
    }
  } catch {
    /* quota / private mode */
  }
  for (const listener of listeners) {
    try {
      listener(next)
    } catch {
      /* ignore */
    }
  }
}

/** Live updates when continue rail changes (delete / playback). */
export function subscribeContinueWatching(listener: ContinueListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function listContinueWatching(): ContinueEntry[] {
  if (isIncognitoMode()) {
    return read().sort((a, b) => b.updatedAt - a.updatedAt)
  }
  if (!getWatchSettings().continueWatchingEnabled) return []
  return read().sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Merge AniList CURRENT entries with local continue rail (newer wins per title). */
export function mergeContinueWatching(remote: ContinueEntry[]): ContinueEntry[] {
  if (isIncognitoMode()) return listContinueWatching()
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

/**
 * Replace the continue rail with remote CURRENT entries only (drops local-only
 * titles that were deleted from the list).
 */
export function replaceContinueWatching(remote: ContinueEntry[]): ContinueEntry[] {
  if (!getWatchSettings().continueWatchingEnabled) {
    write([])
    return []
  }
  const sorted = [...remote].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 24)
  write(sorted)
  return sorted
}

export function recordContinueWatching(
  media: Pick<AnimeMedia, 'id' | 'title' | 'coverImage'>,
  episode: number
) {
  // Incognito writes only to the ephemeral session rail (never main Home).
  if (!isIncognitoMode() && !getWatchSettings().continueWatchingEnabled) return
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

/** Drop a title from the local continue-watching rail (e.g. after list delete). */
export function removeContinueWatching(anilistId: number) {
  if (!anilistId) return
  write(read().filter((e) => e.anilistId !== anilistId))
}
