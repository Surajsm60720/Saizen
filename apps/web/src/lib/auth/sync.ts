import {
  saveAniListProgress,
  saveAniListEntry,
  deleteAniListEntry,
  type AniListEntryInput,
  type AniListStatus
} from './anilist-sync'
import { saveMalProgress, saveMalEntry, deleteMalEntry } from './mal-sync'
import { isAnilistConnected, isMalConnected } from './tokens'
import { markProgressSynced } from '@/lib/watch/progress'
import {
  peekViewerListCache,
  removeViewerListCacheEntry,
  upsertViewerListCacheEntry,
  type MediaListEntry
} from '@/lib/anilist'

export type SyncListOpts = {
  anilistId: number
  idMal?: number | null
  episode: number
  totalEpisodes?: number | null
}

export type SyncListEntryOpts = {
  anilistId: number
  idMal?: number | null
  status: AniListStatus
  progress: number
  score: number
  repeat: number
  /** Existing AniList list-entry id when known */
  entryId?: number | null
}

type SyncStatus = 'ok' | 'skip' | 'error'

function patchProgressInCache(
  anilistId: number,
  episode: number,
  status: 'CURRENT' | 'COMPLETED'
) {
  const cached = peekViewerListCache()?.find((e) => e.media.id === anilistId)
  if (!cached) return
  const next: MediaListEntry = {
    ...cached,
    progress: episode,
    status,
    updatedAt: Date.now()
  }
  upsertViewerListCacheEntry(next)
}

/**
 * Push local episode completion to connected list services in parallel.
 * Failures are independent — one provider failing does not block the other.
 */
export async function syncListProgress(opts: SyncListOpts): Promise<{
  anilist: SyncStatus
  mal: SyncStatus
  errors: string[]
}> {
  const errors: string[] = []
  const result: { anilist: SyncStatus; mal: SyncStatus } = {
    anilist: 'skip',
    mal: 'skip'
  }

  const [alOn, malOn] = await Promise.all([isAnilistConnected(), isMalConnected()])

  const completed =
    opts.totalEpisodes != null &&
    opts.totalEpisodes > 0 &&
    opts.episode >= opts.totalEpisodes
  const nextStatus = completed ? 'COMPLETED' : 'CURRENT'

  const tasks: Promise<void>[] = []

  if (alOn) {
    tasks.push(
      saveAniListProgress({
        mediaId: opts.anilistId,
        episode: opts.episode,
        totalEpisodes: opts.totalEpisodes
      })
        .then(() => {
          result.anilist = 'ok'
        })
        .catch((e) => {
          result.anilist = 'error'
          errors.push(e instanceof Error ? e.message : String(e))
        })
    )
  }

  if (malOn && opts.idMal) {
    tasks.push(
      saveMalProgress({
        idMal: opts.idMal,
        episode: opts.episode,
        totalEpisodes: opts.totalEpisodes
      })
        .then(() => {
          result.mal = 'ok'
        })
        .catch((e) => {
          result.mal = 'error'
          errors.push(e instanceof Error ? e.message : String(e))
        })
    )
  }

  await Promise.all(tasks)

  if (result.anilist === 'ok' || result.mal === 'ok') {
    markProgressSynced(opts.anilistId, opts.episode)
    // Patch cache in place — do NOT clear (Home rails / genres need the list).
    patchProgressInCache(opts.anilistId, opts.episode, nextStatus)
  }

  return { ...result, errors }
}

/** Manual list editor save → AniList + MAL. Requires explicit user values only. */
export async function syncListEntry(opts: SyncListEntryOpts): Promise<{
  anilist: SyncStatus
  mal: SyncStatus
  errors: string[]
  entryId?: number
}> {
  const errors: string[] = []
  const result: { anilist: SyncStatus; mal: SyncStatus; entryId?: number } = {
    anilist: 'skip',
    mal: 'skip'
  }

  const [alOn, malOn] = await Promise.all([isAnilistConnected(), isMalConnected()])
  if (!alOn && !(malOn && opts.idMal)) {
    throw new Error('Connect AniList or MAL in Settings to update your list')
  }

  const payload: AniListEntryInput = {
    mediaId: opts.anilistId,
    status: opts.status,
    progress: opts.progress,
    score: opts.score,
    repeat: opts.repeat
  }

  const tasks: Promise<void>[] = []

  if (alOn) {
    tasks.push(
      saveAniListEntry(payload)
        .then((e) => {
          result.anilist = 'ok'
          result.entryId = e.id
        })
        .catch((e) => {
          result.anilist = 'error'
          errors.push(e instanceof Error ? e.message : String(e))
        })
    )
  }

  if (malOn && opts.idMal) {
    tasks.push(
      saveMalEntry({
        idMal: opts.idMal,
        status: opts.status,
        progress: opts.progress,
        score: opts.score,
        repeat: opts.repeat
      })
        .then(() => {
          result.mal = 'ok'
        })
        .catch((e) => {
          result.mal = 'error'
          errors.push(e instanceof Error ? e.message : String(e))
        })
    )
  }

  await Promise.all(tasks)

  if (result.anilist === 'ok' || result.mal === 'ok') {
    const cached = peekViewerListCache()?.find((e) => e.media.id === opts.anilistId)
    if (cached) {
      upsertViewerListCacheEntry({
        ...cached,
        id: result.entryId ?? opts.entryId ?? cached.id,
        status: opts.status,
        progress: opts.progress,
        score: opts.score,
        repeat: opts.repeat,
        updatedAt: Date.now()
      })
    }
  }

  return { ...result, errors }
}

export async function syncDeleteListEntry(opts: {
  anilistEntryId?: number | null
  anilistMediaId?: number | null
  idMal?: number | null
}): Promise<{ anilist: SyncStatus; mal: SyncStatus; errors: string[] }> {
  const errors: string[] = []
  const result: { anilist: SyncStatus; mal: SyncStatus } = {
    anilist: 'skip',
    mal: 'skip'
  }
  const [alOn, malOn] = await Promise.all([isAnilistConnected(), isMalConnected()])
  const tasks: Promise<void>[] = []

  if (alOn && opts.anilistEntryId) {
    tasks.push(
      deleteAniListEntry(opts.anilistEntryId)
        .then(() => {
          result.anilist = 'ok'
        })
        .catch((e) => {
          result.anilist = 'error'
          errors.push(e instanceof Error ? e.message : String(e))
        })
    )
  }

  if (malOn && opts.idMal) {
    tasks.push(
      deleteMalEntry(opts.idMal)
        .then(() => {
          result.mal = 'ok'
        })
        .catch((e) => {
          result.mal = 'error'
          errors.push(e instanceof Error ? e.message : String(e))
        })
    )
  }

  await Promise.all(tasks)
  if ((result.anilist === 'ok' || result.mal === 'ok') && opts.anilistMediaId) {
    removeViewerListCacheEntry(opts.anilistMediaId)
  }
  return { ...result, errors }
}

export type { AniListStatus }
