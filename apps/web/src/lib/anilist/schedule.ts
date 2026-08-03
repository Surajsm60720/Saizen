import { anilist, currentAniSeason, type AnimeCover, type AnimeTitle } from './client'
import { fetchViewerAnimeList } from './viewer'
import { localWeekWindowUnix } from '@/lib/time/airingLocal'
import { isAnilistConnected } from '@/lib/auth/tokens'

export type ScheduleMedia = {
  id: number
  idMal?: number | null
  status?: string | null
  season?: string | null
  seasonYear?: number | null
  format?: string | null
  episodes?: number | null
  title?: AnimeTitle
  coverImage?: AnimeCover | null
}

export type AiringScheduleItem = {
  id: number
  episode: number
  airingAt: number
  media: ScheduleMedia
}

type PageInfo = {
  hasNextPage?: boolean | null
  currentPage?: number | null
}

const QUERY = `
  query ($page: Int, $perPage: Int, $greater: Int, $lesser: Int, $mediaIds: [Int]) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        hasNextPage
        currentPage
      }
      airingSchedules(
        airingAt_greater: $greater
        airingAt_lesser: $lesser
        mediaId_in: $mediaIds
        sort: TIME
      ) {
        id
        episode
        airingAt
        media {
          id
          idMal
          status
          season
          seasonYear
          format
          episodes
          title { romaji english native userPreferred }
          coverImage { large medium }
        }
      }
    }
  }
`

const QUERY_ALL = `
  query ($page: Int, $perPage: Int, $greater: Int, $lesser: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        hasNextPage
        currentPage
      }
      airingSchedules(
        airingAt_greater: $greater
        airingAt_lesser: $lesser
        sort: TIME
      ) {
        id
        episode
        airingAt
        media {
          id
          idMal
          status
          season
          seasonYear
          format
          episodes
          title { romaji english native userPreferred }
          coverImage { large medium }
        }
      }
    }
  }
`

let weekCache:
  | {
      key: string
      at: number
      items: AiringScheduleItem[]
      mode: 'watching' | 'season'
    }
  | null = null

const CACHE_TTL_MS = 3 * 60 * 1000

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchAiringPage(opts: {
  greater: number
  lesser: number
  page: number
  perPage?: number
  mediaIds?: number[] | null
}): Promise<{ items: AiringScheduleItem[]; hasNext: boolean }> {
  const perPage = opts.perPage ?? 50
  const result = opts.mediaIds?.length
    ? await anilist
        .query(QUERY, {
          page: opts.page,
          perPage,
          greater: opts.greater,
          lesser: opts.lesser,
          mediaIds: opts.mediaIds
        })
        .toPromise()
    : await anilist
        .query(QUERY_ALL, {
          page: opts.page,
          perPage,
          greater: opts.greater,
          lesser: opts.lesser
        })
        .toPromise()

  if (result.error) throw result.error
  const page = result.data?.Page as
    | {
        pageInfo?: PageInfo
        airingSchedules?: AiringScheduleItem[] | null
      }
    | undefined
  const items = (page?.airingSchedules ?? []).filter(
    (s): s is AiringScheduleItem =>
      Boolean(s?.media?.id) && typeof s.airingAt === 'number' && typeof s.episode === 'number'
  )
  return {
    items,
    hasNext: Boolean(page?.pageInfo?.hasNextPage)
  }
}

/** Paginate a week window; optional mediaId filter (chunked). */
export async function fetchAiringSchedulesInRange(opts: {
  greater: number
  lesser: number
  mediaIds?: number[] | null
  maxPages?: number
}): Promise<AiringScheduleItem[]> {
  const maxPages = opts.maxPages ?? 12
  const out: AiringScheduleItem[] = []
  const seen = new Set<number>()

  const idChunks: Array<number[] | null> = opts.mediaIds?.length
    ? chunk(opts.mediaIds, 40)
    : [null]

  for (const chunkIds of idChunks) {
    let page = 1
    let pages = 0
    while (pages < maxPages) {
      const { items, hasNext } = await fetchAiringPage({
        greater: opts.greater,
        lesser: opts.lesser,
        page,
        mediaIds: chunkIds
      })
      for (const item of items) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        out.push(item)
      }
      pages++
      if (!hasNext) break
      page++
      await sleep(350)
    }
  }

  out.sort((a, b) => a.airingAt - b.airingAt)
  return out
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export type WeekScheduleMode = 'watching' | 'season'

export type WeekScheduleResult = {
  items: AiringScheduleItem[]
  mode: WeekScheduleMode
  personalized: boolean
}

/**
 * Week of airings in the device-local Monday–Sunday window.
 * `mode: 'watching'` — CURRENT + REPEATING (requires AniList).
 * `mode: 'season'` — current-season RELEASING titles.
 */
export async function fetchWeekSchedule(opts?: {
  force?: boolean
  mode?: WeekScheduleMode
}): Promise<WeekScheduleResult> {
  const { greater, lesser } = localWeekWindowUnix()
  const connected = await isAnilistConnected()
  const requested = opts?.mode
  const mode: WeekScheduleMode =
    requested === 'watching' || requested === 'season'
      ? requested
      : connected
        ? 'watching'
        : 'season'

  if (mode === 'watching' && !connected) {
    return { items: [], mode: 'watching', personalized: true }
  }

  const cacheKey = `${mode}:${greater}:${lesser}`

  if (
    !opts?.force &&
    weekCache &&
    weekCache.key === cacheKey &&
    Date.now() - weekCache.at < CACHE_TTL_MS
  ) {
    return {
      items: weekCache.items,
      mode: weekCache.mode,
      personalized: weekCache.mode === 'watching'
    }
  }

  let items: AiringScheduleItem[]

  if (mode === 'watching') {
    const list = await fetchViewerAnimeList(['CURRENT', 'REPEATING'])
    const mediaIds = [
      ...new Set(list.map((e) => e.media?.id).filter((id): id is number => typeof id === 'number'))
    ]
    if (!mediaIds.length) {
      items = []
    } else {
      items = await fetchAiringSchedulesInRange({ greater, lesser, mediaIds, maxPages: 6 })
    }
  } else {
    const { season, year } = currentAniSeason()
    const raw = await fetchAiringSchedulesInRange({
      greater,
      lesser,
      mediaIds: null,
      maxPages: 10
    })
    items = raw.filter((s) => {
      const m = s.media
      if (!m) return false
      if ((m.status || '').toUpperCase() !== 'RELEASING') return false
      if (m.seasonYear != null && m.seasonYear !== year) return false
      if (m.season && m.season.toUpperCase() !== season) return false
      return true
    })
  }

  weekCache = { key: cacheKey, at: Date.now(), items, mode }
  return { items, mode, personalized: mode === 'watching' }
}

export function clearWeekScheduleCache() {
  weekCache = null
}
