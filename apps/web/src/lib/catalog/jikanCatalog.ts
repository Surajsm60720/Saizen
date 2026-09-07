import type {
  AnimeMedia,
  AnimeSearchFilters,
  SearchAnimeOpts,
  SearchAnimeResult,
  AniSeason,
  AniCharacter,
  AniStaff,
  AnimeRelationNode,
  AnimeRelationEdge,
  MediaFormat,
  MediaStatusFilter,
  MediaSortOption
} from '@/lib/anilist/client'
import { currentAniSeason } from '@/lib/anilist/client'
import type { AiringScheduleItem } from '@/lib/anilist/schedule'
import { localWeekWindowUnix } from '@/lib/time/airingLocal'
import { jikanGet } from './jikanHttp'
import { anilistToMalId, canonicalMediaId } from './idMap'
import {
  mapJikanAnime,
  mapJikanCharacters,
  mapJikanStaff,
  mapJikanRecommendations,
  mapJikanCharacterDetail,
  mapJikanPersonDetail,
  type JikanAnime
} from './jikanMap'

type PageResp<T> = {
  data?: T
  pagination?: { has_next_page?: boolean; current_page?: number }
}

const genreNameToId = new Map<string, number>()
const genreNames: string[] = []

async function ensureGenreMap() {
  if (genreNameToId.size) return
  const json = await jikanGet<{ data?: Array<{ mal_id: number; name: string }> }>(
    '/genres/anime'
  )
  genreNames.length = 0
  for (const g of json.data ?? []) {
    if (g?.name && g.mal_id) {
      genreNameToId.set(g.name.toLowerCase(), g.mal_id)
      genreNames.push(g.name)
    }
  }
}

async function mapList(rows: JikanAnime[]): Promise<AnimeMedia[]> {
  const out: AnimeMedia[] = []
  for (const row of rows) {
    out.push(await mapJikanAnime(row))
  }
  return out
}

export async function jikanFetchTrending(page = 1, perPage = 24): Promise<AnimeMedia[]> {
  const limit = Math.min(perPage, 25)
  const paths = [
    `/top/anime?filter=airing&page=${page}&limit=${limit}`,
    `/top/anime?filter=bypopularity&page=${page}&limit=${limit}`,
    `/top/anime?page=${page}&limit=${limit}`,
    `/seasons/now?page=${page}&limit=${limit}`
  ]
  let lastErr: unknown
  for (const path of paths) {
    try {
      const json = await jikanGet<PageResp<JikanAnime[]>>(path)
      const rows = json.data ?? []
      if (rows.length) return mapList(rows)
    } catch (e) {
      lastErr = e
    }
  }
  if (lastErr) throw lastErr
  return []
}

export async function jikanFetchPopular(page = 1, perPage = 24): Promise<AnimeMedia[]> {
  const json = await jikanGet<PageResp<JikanAnime[]>>(
    `/top/anime?filter=bypopularity&page=${page}&limit=${Math.min(perPage, 25)}`
  )
  return mapList(json.data ?? [])
}

export async function jikanFetchSeasonPopular(
  season?: AniSeason,
  year?: number,
  perPage = 24
): Promise<AnimeMedia[]> {
  const cur = currentAniSeason()
  const s = (season ?? cur.season).toLowerCase()
  const y = year ?? cur.year
  try {
    const json = await jikanGet<PageResp<JikanAnime[]>>(
      `/seasons/${y}/${s}?limit=${Math.min(perPage, 25)}`
    )
    return mapList(json.data ?? [])
  } catch {
    // seasons/now sometimes 504 when MAL is flaky; fall back to airing top
    return jikanFetchTrending(1, perPage)
  }
}

export async function jikanFetchAllTimePopular(
  page = 1,
  perPage = 24
): Promise<AnimeMedia[]> {
  const json = await jikanGet<PageResp<JikanAnime[]>>(
    `/top/anime?page=${page}&limit=${Math.min(perPage, 25)}`
  )
  return mapList(json.data ?? [])
}

export async function jikanFetchAnime(id: number): Promise<AnimeMedia | null> {
  const malId = (await anilistToMalId(id)) ?? id
  try {
    const full = await jikanGet<{ data?: JikanAnime }>(`/anime/${malId}/full`)
    if (!full.data) return null
    const media = await mapJikanAnime(full.data, {
      anilistId: id !== malId ? id : undefined,
      includeRelations: true
    })

    const [chars, staff, recs] = await Promise.all([
      jikanGet<{ data?: Parameters<typeof mapJikanCharacters>[0] }>(
        `/anime/${malId}/characters`
      ).catch(() => ({ data: [] as Parameters<typeof mapJikanCharacters>[0] })),
      jikanGet<{ data?: Parameters<typeof mapJikanStaff>[0] }>(
        `/anime/${malId}/staff`
      ).catch(() => ({ data: [] as Parameters<typeof mapJikanStaff>[0] })),
      jikanGet<PageResp<Array<{ entry?: JikanAnime }>>>(`/anime/${malId}/recommendations`).catch(
        () => ({ data: [] as Array<{ entry?: JikanAnime }> })
      )
    ])

    media.characters = { edges: await mapJikanCharacters(chars.data ?? []) }
    media.staff = { edges: await mapJikanStaff(staff.data ?? []) }
    media.recommendations = {
      nodes: await mapJikanRecommendations(recs.data ?? [])
    }
    return media
  } catch {
    return null
  }
}

export async function jikanFetchMedia(id: number): Promise<AnimeMedia | null> {
  return jikanFetchAnime(id)
}

function malType(format?: MediaFormat | null): string | undefined {
  if (!format) return undefined
  if (format === 'TV_SHORT') return 'tv'
  if (format === 'SPECIAL') return 'special'
  return format.toLowerCase()
}

function malStatus(status?: MediaStatusFilter | null): string | undefined {
  if (!status) return undefined
  switch (status) {
    case 'RELEASING':
      return 'airing'
    case 'FINISHED':
      return 'complete'
    case 'NOT_YET_RELEASED':
      return 'upcoming'
    default:
      return undefined
  }
}

function malOrder(sort?: MediaSortOption | MediaSortOption[] | null): {
  order_by?: string
  sort?: string
} {
  const s = Array.isArray(sort) ? sort[0] : sort
  switch (s) {
    case 'SCORE_DESC':
      return { order_by: 'score', sort: 'desc' }
    case 'POPULARITY_DESC':
      return { order_by: 'members', sort: 'desc' }
    case 'TRENDING_DESC':
      return { order_by: 'members', sort: 'desc' }
    case 'START_DATE_DESC':
      return { order_by: 'start_date', sort: 'desc' }
    case 'START_DATE':
      return { order_by: 'start_date', sort: 'asc' }
    case 'TITLE_ROMAJI':
    case 'TITLE_ENGLISH':
      return { order_by: 'title', sort: 'asc' }
    default:
      return { order_by: 'members', sort: 'desc' }
  }
}

export async function jikanSearchAnime(
  term: string,
  page = 1,
  opts?: SearchAnimeOpts
): Promise<SearchAnimeResult> {
  await ensureGenreMap()
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('limit', '24')
  const q = term.trim()
  if (q) params.set('q', q)
  if (!opts?.includeAdult) params.set('sfw', 'true')
  const type = malType(opts?.format ?? null)
  if (type) params.set('type', type)
  const st = malStatus(opts?.status ?? null)
  if (st) params.set('status', st)
  if (opts?.season) params.set('season', opts.season.toLowerCase())
  if (opts?.seasonYear) params.set('start_date', `${opts.seasonYear}-01-01`)
  const genres = (opts?.genres ?? [])
    .map((g) => genreNameToId.get(g.toLowerCase()))
    .filter((id): id is number => typeof id === 'number')
  if (genres.length) params.set('genres', genres.join(','))
  const order = malOrder(opts?.sort ?? null)
  if (!q && order.order_by) {
    params.set('order_by', order.order_by)
    if (order.sort) params.set('sort', order.sort)
  } else if (q) {
    // default relevance when searching
  } else if (order.order_by) {
    params.set('order_by', order.order_by)
    if (order.sort) params.set('sort', order.sort)
  }

  const json = await jikanGet<PageResp<JikanAnime[]>>(`/anime?${params.toString()}`)
  const media = await mapList(json.data ?? [])
  return {
    media,
    hasNextPage: Boolean(json.pagination?.has_next_page),
    currentPage: Number(json.pagination?.current_page ?? page)
  }
}

export async function jikanFetchGenres(): Promise<string[]> {
  await ensureGenreMap()
  return [...genreNames].sort((a, b) => a.localeCompare(b))
}

export async function jikanFetchGenrePopular(
  genres: string[],
  perPage = 24
): Promise<AnimeMedia[]> {
  if (!genres.length) return []
  const result = await jikanSearchAnime('', 1, {
    genres: genres.slice(0, 3),
    sort: 'POPULARITY_DESC',
    includeAdult: false
  })
  return result.media.slice(0, perPage)
}

export async function jikanFetchCharacter(id: number): Promise<AniCharacter | null> {
  try {
    const json = await jikanGet<{ data?: Parameters<typeof mapJikanCharacterDetail>[0] }>(
      `/characters/${id}/full`
    )
    if (!json.data) return null
    return mapJikanCharacterDetail(json.data)
  } catch {
    return null
  }
}

export async function jikanFetchStaff(id: number): Promise<AniStaff | null> {
  try {
    const json = await jikanGet<{ data?: Parameters<typeof mapJikanPersonDetail>[0] }>(
      `/people/${id}/full`
    )
    if (!json.data) return null
    return mapJikanPersonDetail(json.data)
  } catch {
    return null
  }
}

export async function jikanFetchMediaRelations(
  id: number
): Promise<
  | (AnimeRelationNode & { relations?: { edges?: AnimeRelationEdge[] | null } | null })
  | null
> {
  const media = await jikanFetchAnime(id)
  if (!media) return null
  return {
    id: media.id,
    type: 'ANIME',
    format: media.format,
    status: media.status,
    averageScore: media.averageScore,
    seasonYear: media.seasonYear,
    startDate: media.startDate,
    endDate: media.endDate,
    title: media.title,
    coverImage: media.coverImage,
    relations: media.relations
  }
}

const DAY_FILTERS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday'
] as const

/**
 * Broadcast day string → Mon=0…Sun=6.
 * Accepts "Mondays", "Monday", "mondays", etc.
 */
function broadcastDayIndex(day?: string | null): number | null {
  if (!day) return null
  const d = day.toLowerCase().replace(/s$/, '')
  const idx = DAY_FILTERS.indexOf(d as (typeof DAY_FILTERS)[number])
  return idx >= 0 ? idx : null
}

/**
 * Interpret MAL broadcast time as Asia/Tokyo wall clock for this local week day.
 * Falls back to device-local clock if timezone parsing fails.
 */
function airingAtForBroadcast(
  weekdayIndex: number,
  timeHHmm?: string | null,
  timezone?: string | null
): number {
  const [hh, mm] = (timeHHmm || '12:00').split(':').map((x) => Number(x) || 0)
  const tz = timezone || 'Asia/Tokyo'

  // Anchor to this week's local Monday, then add weekday offset.
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const monOffset = (startOfToday.getDay() + 6) % 7
  const monday = new Date(startOfToday)
  monday.setDate(monday.getDate() - monOffset)
  const localDay = new Date(monday)
  localDay.setDate(monday.getDate() + weekdayIndex)

  try {
    // Build a UTC instant that is hh:mm on `tz` for the local calendar date.
    const y = localDay.getFullYear()
    const mo = localDay.getMonth()
    const da = localDay.getDate()
    // Rough: format the intended local date in tz via iterative offset.
    const guess = new Date(Date.UTC(y, mo, da, hh, mm, 0))
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    })
    const parts = Object.fromEntries(
      fmt.formatToParts(guess).map((p) => [p.type, p.value])
    )
    const asTz = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      0
    )
    const delta = guess.getTime() - asTz
    let ms = guess.getTime() + delta
    // If still before earlier this week window start, leave as-is; caller filters.
    if (ms < now.getTime() - 7 * 86400_000) ms += 7 * 86400_000
    return Math.floor(ms / 1000)
  } catch {
    localDay.setHours(hh, mm, 0, 0)
    return Math.floor(localDay.getTime() / 1000)
  }
}

export async function jikanFetchWeekSchedule(opts?: {
  mediaIds?: number[] | null
}): Promise<AiringScheduleItem[]> {
  const { greater, lesser } = localWeekWindowUnix()
  const allow = opts?.mediaIds?.length ? new Set(opts.mediaIds) : null
  const items: AiringScheduleItem[] = []
  let syntheticId = 1

  for (let i = 0; i < DAY_FILTERS.length; i++) {
    const day = DAY_FILTERS[i]!
    try {
      // Tenrai: /schedules?filter=monday — Jikan accepts the same query.
      // (Legacy /schedules/mondays 404s on Tenrai.)
      const rows: JikanAnime[] = []
      for (let page = 1; page <= 3; page++) {
        const json = await jikanGet<PageResp<JikanAnime[]>>(
          `/schedules?filter=${day}&sfw=true&page=${page}`
        )
        const chunk = json.data ?? []
        if (!chunk.length) break
        rows.push(...chunk)
        if (!json.pagination?.has_next_page) break
      }

      for (const row of rows) {
        const dayIdx = broadcastDayIndex(row.broadcast?.day) ?? i
        const media = await mapJikanAnime(row)
        if (allow) {
          let hit =
            allow.has(media.id) ||
            (media.idMal != null && allow.has(media.idMal))
          if (!hit && media.idMal) {
            const canon = await canonicalMediaId(media.idMal)
            hit = allow.has(canon)
          }
          if (!hit) continue
        }
        const airingAt = airingAtForBroadcast(
          dayIdx,
          row.broadcast?.time,
          row.broadcast?.timezone
        )
        if (airingAt < greater || airingAt > lesser) continue
        items.push({
          id: syntheticId++,
          episode: 0,
          airingAt,
          media: {
            id: media.id,
            idMal: media.idMal,
            status: media.status,
            season: media.season as string | null,
            seasonYear: media.seasonYear,
            format: media.format,
            episodes: media.episodes,
            title: media.title,
            coverImage: media.coverImage
          }
        })
      }
    } catch {
      /* day miss ok */
    }
  }

  items.sort((a, b) => a.airingAt - b.airingAt)
  return items
}

/** Helper for search filters sheet when already in fallback — unused filters type keep. */
export type { AnimeSearchFilters }
