import {
  fetchViewerAnimeList,
  fetchGenrePopular,
  derivePrequelsSequels,
  deriveTopGenres,
  continueEntriesFromList,
  peekViewerListCache,
  type AnimeMedia
} from '@/lib/anilist'
import { isAnilistConnected, isMalConnected } from '@/lib/auth/tokens'
import { whenBridgeReady } from '@/lib/native/ready'
import { isIncognitoMode } from '@/lib/privacy/incognito'
import { mergeContinueWatching } from '@/lib/watch/continue'
import { readHomeSnapshot, writeHomeSnapshot } from './store'

export type HomePersonalizationResult = {
  anilistOn: boolean
  continueWatching: ReturnType<typeof mergeContinueWatching>
  related: Array<{ media: AnimeMedia; relationType: string }>
  topGenres: string[]
  genrePicks: AnimeMedia[]
}

let inflight: Promise<HomePersonalizationResult> | null = null
let inflightForce = false

function emptyResult(anilistOn: boolean): HomePersonalizationResult {
  return {
    anilistOn,
    continueWatching: mergeContinueWatching([]),
    related: [],
    topGenres: [],
    genrePicks: []
  }
}

function resultFromEntries(
  entries: NonNullable<ReturnType<typeof peekViewerListCache>>,
  genrePicksFallback?: AnimeMedia[],
  listOn = true
): HomePersonalizationResult {
  const cont = mergeContinueWatching(continueEntriesFromList(entries))
  const related = derivePrequelsSequels(entries)
  const topGenres = deriveTopGenres(entries, 3)
  return {
    anilistOn: listOn,
    continueWatching: cont,
    related,
    topGenres,
    genrePicks: genrePicksFallback ?? []
  }
}

async function listProviderOn(): Promise<boolean> {
  const [al, mal] = await Promise.all([isAnilistConnected(), isMalConnected()])
  // AniList list when connected; MAL covers outages and MAL-only accounts.
  return Boolean(al || mal)
}

async function loadPersonalization(force: boolean): Promise<HomePersonalizationResult> {
  await whenBridgeReady()

  if (isIncognitoMode()) {
    const on = await listProviderOn()
    const empty = emptyResult(on)
    writeHomeSnapshot({
      anilistOn: on,
      related: [],
      topGenres: [],
      genrePicks: []
    })
    return empty
  }

  const connected = await listProviderOn()
  if (!connected) {
    const empty = emptyResult(false)
    writeHomeSnapshot({
      anilistOn: false,
      related: [],
      topGenres: [],
      genrePicks: []
    })
    return empty
  }

  // Soft path: paint from disk cache instantly (even if TTL expired).
  if (!force) {
    const cached = peekViewerListCache({ allowStale: true })
    if (cached?.length) {
      const snap = readHomeSnapshot()
      const result = resultFromEntries(
        cached,
        snap.genrePicks.length ? snap.genrePicks : undefined,
        true
      )
      if (!result.genrePicks.length && result.topGenres.length) {
        const onList = new Set(cached.map((e) => e.media.id))
        result.genrePicks = (await fetchGenrePopular(result.topGenres, 24))
          .filter((m) => !onList.has(m.id))
          .slice(0, 18)
      }
      writeHomeSnapshot({
        continueWatching: result.continueWatching,
        related: result.related,
        topGenres: result.topGenres,
        genrePicks: result.genrePicks,
        anilistOn: true
      })
      return result
    }
  }

  const entries = await fetchViewerAnimeList(
    ['CURRENT', 'REPEATING', 'COMPLETED', 'PAUSED'],
    { force }
  )
  const base = resultFromEntries(entries, undefined, true)
  if (base.topGenres.length) {
    const onList = new Set(entries.map((e) => e.media.id))
    base.genrePicks = (await fetchGenrePopular(base.topGenres, 24))
      .filter((m) => !onList.has(m.id))
      .slice(0, 18)
  }

  writeHomeSnapshot({
    continueWatching: base.continueWatching,
    related: base.related,
    topGenres: base.topGenres,
    genrePicks: base.genrePicks,
    anilistOn: true
  })
  return base
}

/**
 * Load list-backed Home rails (continue merge, prequels/sequels, genre picks).
 * Concurrent callers share one in-flight request (force wins over soft).
 */
export async function refreshHomePersonalization(opts?: {
  force?: boolean
}): Promise<HomePersonalizationResult> {
  const force = opts?.force ?? false
  if (inflight) {
    if (!force || inflightForce) return inflight
    try {
      await inflight
    } catch {
      /* continue to force */
    }
  }

  inflightForce = force
  inflight = loadPersonalization(force).finally(() => {
    inflight = null
    inflightForce = false
  })
  return inflight
}

/**
 * Instant cache paint, then one background network refresh.
 */
export async function refreshHomePersonalizationSWR(): Promise<HomePersonalizationResult> {
  const soft = await refreshHomePersonalization({ force: false })
  if (soft.anilistOn) {
    void refreshHomePersonalization({ force: true }).catch((e) => {
      console.warn('[saizen] list background refresh failed', e)
    })
  }
  return soft
}
