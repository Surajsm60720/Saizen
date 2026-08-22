import type { AnimeMedia } from '@/lib/anilist'
import {
  peekHomeRails,
  writeHomeRails,
  peekViewerListCache,
  derivePrequelsSequels,
  deriveTopGenres,
  continueEntriesFromList
} from '@/lib/anilist'
import { listContinueWatching, mergeContinueWatching, type ContinueEntry } from '@/lib/watch/continue'

export type HomeSnapshot = {
  trending: AnimeMedia[]
  seasonal: AnimeMedia[]
  allTime: AnimeMedia[]
  continueWatching: ContinueEntry[]
  related: Array<{ media: AnimeMedia; relationType: string }>
  genrePicks: AnimeMedia[]
  topGenres: string[]
  anilistOn: boolean
  /** True once public rails have been loaded at least once this session / from disk */
  ready: boolean
}

/** Survives route unmounts so Home doesn't flash skeletons on back-nav. */
let memory: HomeSnapshot | null = null
let fetchedAt = 0

type Listener = (snap: HomeSnapshot) => void
const listeners = new Set<Listener>()

const FRESH_MS = 5 * 60 * 1000

export function markHomeFetched(at = Date.now()) {
  fetchedAt = at
}

/** True when in-memory rails were fetched recently — skip public network on remount. */
export function isHomeFresh(): boolean {
  return Boolean(memory?.ready && fetchedAt && Date.now() - fetchedAt < FRESH_MS)
}

/** Subscribe to Home snapshot patches (delete / continue-watching updates). */
export function subscribeHomeSnapshot(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emitHomeSnapshot(snap: HomeSnapshot) {
  for (const listener of listeners) {
    try {
      listener(snap)
    } catch {
      /* ignore subscriber errors */
    }
  }
}

function emptySnapshot(): HomeSnapshot {
  return {
    trending: [],
    seasonal: [],
    allTime: [],
    continueWatching: [],
    related: [],
    genrePicks: [],
    topGenres: [],
    anilistOn: false,
    ready: false
  }
}

/** Sync hydrate for useState initializers (first paint = last known Home). */
export function readHomeSnapshot(): HomeSnapshot {
  if (memory?.ready) return memory

  const snap = emptySnapshot()
  snap.continueWatching = listContinueWatching()

  const rails = peekHomeRails()
  if (rails) {
    snap.trending = rails.trending
    snap.seasonal = rails.seasonal
    snap.allTime = rails.allTime
    snap.ready = rails.trending.length > 0 || rails.seasonal.length > 0
  }

  const list = peekViewerListCache({ allowStale: true })
  if (list?.length) {
    snap.anilistOn = true
    snap.continueWatching = mergeContinueWatching(continueEntriesFromList(list))
    snap.related = derivePrequelsSequels(list)
    snap.topGenres = deriveTopGenres(list, 3)
  }

  // Restore genre picks from disk so cold launch isn't empty while network runs.
  try {
    if (typeof window !== 'undefined') {
      let raw = localStorage.getItem('saizen:home-personal')
      if (!raw) {
        raw = sessionStorage.getItem('saizen:home-personal')
        if (raw) {
          localStorage.setItem('saizen:home-personal', raw)
          sessionStorage.removeItem('saizen:home-personal')
        }
      }
      if (raw) {
        const p = JSON.parse(raw) as {
          genrePicks?: AnimeMedia[]
          related?: HomeSnapshot['related']
          topGenres?: string[]
          anilistOn?: boolean
        }
        if (Array.isArray(p.genrePicks)) snap.genrePicks = p.genrePicks
        if (Array.isArray(p.related) && p.related.length) snap.related = p.related
        if (Array.isArray(p.topGenres) && p.topGenres.length) snap.topGenres = p.topGenres
        if (typeof p.anilistOn === 'boolean') snap.anilistOn = p.anilistOn
      }
    }
  } catch {
    /* ignore */
  }

  memory = snap
  return snap
}

export function writeHomeSnapshot(patch: Partial<HomeSnapshot>): HomeSnapshot {
  const prev = memory ?? readHomeSnapshot()
  const next: HomeSnapshot = {
    ...prev,
    ...patch,
    ready:
      patch.ready ??
      (prev.ready ||
        Boolean(
          (patch.trending ?? prev.trending).length ||
            (patch.seasonal ?? prev.seasonal).length
        ))
  }
  memory = next

  if (patch.trending || patch.seasonal || patch.allTime) {
    markHomeFetched()
  }

  if (next.trending.length || next.seasonal.length || next.allTime.length) {
    writeHomeRails({
      trending: next.trending,
      seasonal: next.seasonal,
      allTime: next.allTime
    })
  }

  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        'saizen:home-personal',
        JSON.stringify({
          genrePicks: next.genrePicks,
          related: next.related,
          topGenres: next.topGenres,
          anilistOn: next.anilistOn
        })
      )
    }
  } catch {
    /* ignore */
  }

  emitHomeSnapshot(next)
  return next
}
