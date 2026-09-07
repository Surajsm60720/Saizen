import {
  enterCatalogFallback,
  isAniListOutageError,
  isCatalogFallback,
  leaveCatalogFallback,
  noteAniListProbeScheduled,
  shouldProbeAniList
} from './status'
import { isMalConnected } from '@/lib/auth/tokens'
import {
  fetchViewerAnimeList as alViewerList,
  fetchViewerListEntry as alViewerEntry,
  peekViewerListCache,
  type ViewerListEntryResult
} from '@/lib/anilist/viewer'
import { fetchMalAnimeList, fetchMalListEntry } from './malList'
import {
  fetchTrending as alTrending,
  fetchPopular as alPopular,
  fetchSeasonPopular as alSeason,
  fetchAllTimePopular as alAllTime,
  fetchAnime as alAnime,
  fetchMedia as alMedia,
  searchAnime as alSearch,
  fetchAniListGenres as alGenres,
  fetchCharacter as alCharacter,
  fetchStaff as alStaff,
  fetchMediaRelations as alRelations,
  type AniSeason,
  type SearchAnimeOpts
} from '@/lib/anilist/client'
import {
  fetchGenrePopular as alGenrePopular
} from '@/lib/anilist/viewer'
import {
  fetchWeekSchedule as alWeekSchedule,
  type WeekScheduleResult,
  type WeekScheduleMode
} from '@/lib/anilist/schedule'
import { withCatalogFallback, withCatalogFallbackNullable } from './fallback'
import {
  jikanFetchTrending,
  jikanFetchPopular,
  jikanFetchSeasonPopular,
  jikanFetchAllTimePopular,
  jikanFetchAnime,
  jikanFetchMedia,
  jikanSearchAnime,
  jikanFetchGenres,
  jikanFetchGenrePopular,
  jikanFetchCharacter,
  jikanFetchStaff,
  jikanFetchMediaRelations,
  jikanFetchWeekSchedule
} from './jikanCatalog'

export function fetchTrending(page = 1, perPage = 24) {
  return withCatalogFallback(
    () => alTrending(page, perPage),
    () => jikanFetchTrending(page, perPage),
    'trending'
  )
}

export function fetchPopular(page = 1, perPage = 24) {
  return withCatalogFallback(
    () => alPopular(page, perPage),
    () => jikanFetchPopular(page, perPage),
    'popular'
  )
}

export function fetchSeasonPopular(season?: AniSeason, year?: number, perPage = 24) {
  return withCatalogFallback(
    () => alSeason(season, year, perPage),
    () => jikanFetchSeasonPopular(season, year, perPage),
    'season'
  )
}

export function fetchAllTimePopular(page = 1, perPage = 24) {
  return withCatalogFallback(
    () => alAllTime(page, perPage),
    () => jikanFetchAllTimePopular(page, perPage),
    'allTime'
  )
}

export function fetchAnime(id: number) {
  return withCatalogFallbackNullable(
    () => alAnime(id),
    () => jikanFetchAnime(id),
    'anime'
  )
}

export function fetchMedia(id: number) {
  return withCatalogFallbackNullable(
    () => alMedia(id),
    () => jikanFetchMedia(id),
    'media'
  )
}

export function searchAnime(term: string, page = 1, opts?: SearchAnimeOpts) {
  return withCatalogFallback(
    () => alSearch(term, page, opts),
    () => jikanSearchAnime(term, page, opts),
    'search'
  )
}

export function fetchAniListGenres() {
  return withCatalogFallback(
    () => alGenres(),
    () => jikanFetchGenres(),
    'genres'
  )
}

export function fetchCharacter(id: number) {
  return withCatalogFallbackNullable(
    () => alCharacter(id),
    () => jikanFetchCharacter(id),
    'character'
  )
}

export function fetchStaff(id: number) {
  return withCatalogFallbackNullable(
    () => alStaff(id),
    () => jikanFetchStaff(id),
    'staff'
  )
}

export function fetchMediaRelations(id: number) {
  return withCatalogFallbackNullable(
    () => alRelations(id),
    () => jikanFetchMediaRelations(id),
    'relations'
  )
}

export function fetchGenrePopular(genres: string[], perPage = 24) {
  return withCatalogFallback(
    () => alGenrePopular(genres, perPage),
    () => jikanFetchGenrePopular(genres, perPage),
    'genrePopular'
  )
}

export async function fetchViewerAnimeList(
  statusIn: string[] = ['CURRENT', 'REPEATING', 'COMPLETED', 'PAUSED', 'PLANNING'],
  opts?: { force?: boolean }
) {
  const filter = (entries: Awaited<ReturnType<typeof alViewerList>>) => {
    if (!statusIn?.length) return entries
    const allow = new Set(statusIn)
    return entries.filter((e) => allow.has(e.status))
  }

  if (!isCatalogFallback() || shouldProbeAniList()) {
    try {
      const list = await alViewerList(statusIn, opts)
      if (isCatalogFallback()) leaveCatalogFallback()
      return list
    } catch (err) {
      if (isAniListOutageError(err)) {
        enterCatalogFallback(
          err instanceof Error ? err.message : 'AniList list unavailable'
        )
        noteAniListProbeScheduled()
      } else {
        const stale = peekViewerListCache({ allowStale: true })
        if (stale?.length) return filter(stale)
        if (!(await isMalConnected())) throw err
        enterCatalogFallback(
          err instanceof Error ? err.message : 'AniList list unavailable'
        )
      }
    }
  }

  if (await isMalConnected()) {
    return filter(await fetchMalAnimeList(opts))
  }

  const stale = peekViewerListCache({ allowStale: true })
  if (stale?.length) return filter(stale)
  return []
}

export async function fetchViewerListEntry(mediaId: number): Promise<ViewerListEntryResult> {
  if (!isCatalogFallback() || shouldProbeAniList()) {
    try {
      const result = await alViewerEntry(mediaId)
      if (isCatalogFallback() && result.status !== 'unavailable') leaveCatalogFallback()
      if (result.status !== 'unavailable') return result
      // unavailable may be outage — try MAL below
      if (!(await isMalConnected())) return result
    } catch (err) {
      if (isAniListOutageError(err)) {
        enterCatalogFallback(
          err instanceof Error ? err.message : 'AniList list entry unavailable'
        )
        noteAniListProbeScheduled()
      } else if (!(await isMalConnected())) {
        throw err
      }
    }
  }

  if (await isMalConnected()) {
    return fetchMalListEntry(mediaId)
  }
  return alViewerEntry(mediaId)
}

export async function fetchWeekSchedule(opts?: {
  force?: boolean
  mode?: WeekScheduleMode
}): Promise<WeekScheduleResult> {
  return withCatalogFallback(
    () => alWeekSchedule(opts),
    async () => {
      const mode: WeekScheduleMode = opts?.mode === 'watching' ? 'watching' : 'season'
      let mediaIds: number[] | null = null
      if (mode === 'watching') {
        const list = await fetchViewerAnimeList(['CURRENT', 'REPEATING'])
        mediaIds = [
          ...new Set(
            list
              .map((e) => e.media?.id)
              .filter((id): id is number => typeof id === 'number')
          )
        ]
        if (!mediaIds.length) {
          return { items: [], mode: 'watching', personalized: true }
        }
      }
      const items = await jikanFetchWeekSchedule({ mediaIds })
      return { items, mode, personalized: mode === 'watching' }
    },
    'schedule'
  )
}
