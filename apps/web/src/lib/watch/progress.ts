import { getWatchSettings } from './settings'
import { recordProbedDuration } from './episodeMeta'

const KEY = 'saizen:watch-progress'

export interface WatchProgress {
  anilistId: number
  idMal?: number | null
  episode: number
  positionSec: number
  durationSec: number
  completed: boolean
  /** Last episode number successfully synced to AniList/MAL (Phase 3). */
  syncedEpisode?: number
  updatedAt: number
}

function storageKey(anilistId: number, episode: number) {
  return `${anilistId}:${episode}`
}

function readMap(): Record<string, WatchProgress> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, WatchProgress>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeMap(map: Record<string, WatchProgress>) {
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

export function getWatchProgress(
  anilistId: number,
  episode: number
): WatchProgress | null {
  return readMap()[storageKey(anilistId, episode)] ?? null
}

export type ProgressUpdateResult = {
  progress: WatchProgress
  /** True when this update newly crossed the mark-watched threshold. */
  justCompleted: boolean
}

export function markProgressSynced(anilistId: number, episode: number) {
  const key = storageKey(anilistId, episode)
  const map = readMap()
  const prev = map[key]
  if (!prev) return
  map[key] = { ...prev, syncedEpisode: episode, updatedAt: Date.now() }
  writeMap(map)
}

/**
 * Persist playback position. When position/duration crosses the user threshold,
 * marks the episode completed and triggers AniList/MAL sync if connected.
 */
export function updateWatchProgress(opts: {
  anilistId: number
  idMal?: number | null
  episode: number
  positionSec: number
  durationSec: number
  totalEpisodes?: number | null
}): ProgressUpdateResult | null {
  const { anilistId, episode, positionSec, durationSec } = opts
  if (!anilistId || !episode) return null
  if (!Number.isFinite(positionSec) || !Number.isFinite(durationSec)) return null
  if (durationSec < 30) return null

  recordProbedDuration(anilistId, episode, durationSec)

  const settings = getWatchSettings()
  const pct = (positionSec / durationSec) * 100
  const shouldComplete = pct >= settings.markWatchedAtPercent

  const key = storageKey(anilistId, episode)
  const map = readMap()
  const prev = map[key]
  const wasCompleted = Boolean(prev?.completed)
  const justCompleted = shouldComplete && !wasCompleted

  const progress: WatchProgress = {
    anilistId,
    idMal: opts.idMal ?? prev?.idMal ?? null,
    episode,
    positionSec: Math.max(0, positionSec),
    durationSec,
    completed: wasCompleted || shouldComplete,
    syncedEpisode: prev?.syncedEpisode,
    updatedAt: Date.now()
  }
  map[key] = progress
  writeMap(map)

  if (justCompleted) {
    void import('@/lib/auth/sync')
      .then(({ syncListProgress }) =>
        syncListProgress({
          anilistId,
          idMal: progress.idMal,
          episode,
          totalEpisodes: opts.totalEpisodes
        })
      )
      .catch(() => {})
  }

  return { progress, justCompleted }
}

/** Pending local completions not yet synced (Phase 3 consumer). */
export function listPendingSync(): WatchProgress[] {
  return Object.values(readMap()).filter(
    (p) => p.completed && (p.syncedEpisode == null || p.syncedEpisode < p.episode)
  )
}

/** Episodes marked completed locally for a title. */
export function listWatchedEpisodes(anilistId: number): Set<number> {
  const out = new Set<number>()
  if (!anilistId) return out
  for (const p of Object.values(readMap())) {
    if (p.anilistId === anilistId && p.completed) out.add(p.episode)
  }
  return out
}

/** True if episode is completed locally or covered by AniList/MAL list progress. */
export function isEpisodeWatched(
  anilistId: number,
  episode: number,
  listProgress?: number | null
): boolean {
  if (listProgress != null && episode > 0 && episode <= listProgress) return true
  return Boolean(getWatchProgress(anilistId, episode)?.completed)
}
