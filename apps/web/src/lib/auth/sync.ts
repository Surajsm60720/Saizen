import { saveAniListProgress } from './anilist-sync'
import { saveMalProgress } from './mal-sync'
import { isAnilistConnected, isMalConnected } from './tokens'
import { markProgressSynced } from '@/lib/watch/progress'

export type SyncListOpts = {
  anilistId: number
  idMal?: number | null
  episode: number
  totalEpisodes?: number | null
}

type SyncStatus = 'ok' | 'skip' | 'error'

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
  }

  return { ...result, errors }
}
