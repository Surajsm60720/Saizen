import type { AdultGenre, AdultHomeSection } from '@saizen/shared'

export type AdultHomeSnapshot = {
  moduleId: string
  primaryName: string
  sections: AdultHomeSection[]
  genres: AdultGenre[]
  ready: boolean
}

type CacheEntry = { snap: AdultHomeSnapshot; fetchedAt: number }

/** Per-provider cache so switching back is instant. */
const byModule = new Map<string, CacheEntry>()
let memory: AdultHomeSnapshot | null = null
let fetchedAt = 0

const FRESH_MS = 5 * 60 * 1000

type Listener = (snap: AdultHomeSnapshot) => void
const listeners = new Set<Listener>()

function emptySnapshot(): AdultHomeSnapshot {
  return {
    moduleId: '',
    primaryName: '',
    sections: [],
    genres: [],
    ready: false
  }
}

function hasItems(snap: AdultHomeSnapshot): boolean {
  return snap.sections.some((s) => Array.isArray(s.items) && s.items.length > 0)
}

export function markAdultHomeFetched(at = Date.now()) {
  fetchedAt = at
}

export function isAdultHomeFresh(moduleId: string | null | undefined): boolean {
  if (!moduleId) return false
  const entry = byModule.get(moduleId)
  if (!entry?.snap.ready || !hasItems(entry.snap)) return false
  return Date.now() - entry.fetchedAt < FRESH_MS
}

/** Any cached rails for this provider (even stale) — for instant paint while refreshing. */
export function readCachedAdultHome(moduleId: string | null | undefined): AdultHomeSnapshot | null {
  if (!moduleId) return null
  const entry = byModule.get(moduleId)
  if (!entry?.snap.ready || !hasItems(entry.snap)) return null
  return entry.snap
}

export function subscribeAdultHomeSnapshot(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emit(snap: AdultHomeSnapshot) {
  for (const listener of listeners) {
    try {
      listener(snap)
    } catch {
      /* ignore */
    }
  }
}

export function readAdultHomeSnapshot(): AdultHomeSnapshot {
  return memory ?? emptySnapshot()
}

export function writeAdultHomeSnapshot(patch: Partial<AdultHomeSnapshot>): AdultHomeSnapshot {
  const next: AdultHomeSnapshot = {
    ...(memory ?? emptySnapshot()),
    ...patch
  }
  memory = next
  if (next.ready) {
    const at = Date.now()
    markAdultHomeFetched(at)
    if (next.moduleId) {
      byModule.set(next.moduleId, { snap: next, fetchedAt: at })
    }
  }
  emit(next)
  return next
}

export function clearAdultHomeSnapshot(moduleId?: string | null) {
  if (moduleId) {
    byModule.delete(moduleId)
    if (memory?.moduleId === moduleId) {
      memory = null
      fetchedAt = 0
    }
    return
  }
  memory = null
  fetchedAt = 0
  byModule.clear()
}
