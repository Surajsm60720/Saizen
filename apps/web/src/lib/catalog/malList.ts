import { saizenFetch } from '@/lib/extensions/fetch'
import { getMalToken } from '@/lib/auth/tokens'
import { refreshNative } from '@/lib/native'
import { whenBridgeReady } from '@/lib/native/ready'
import { getOAuthCredentials } from '@/lib/auth/credentials'
import type { MediaListEntry } from '@/lib/anilist/viewer'
import type { AnimeMedia } from '@/lib/anilist/client'
import { canonicalMediaId } from './idMap'
import { jikanGet } from './jikanHttp'
import { mapJikanAnime, type JikanAnime } from './jikanMap'

const MAL_LIST_CACHE_KEY = 'saizen:mal-list-cache'
const MAL_LIST_TTL_MS = 15 * 60 * 1000

type CacheBlob = { at: number; entries: MediaListEntry[] }

function storage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage
  } catch {
    return null
  }
}

function readCache(allowStale = false): MediaListEntry[] | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(MAL_LIST_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheBlob
    if (!parsed?.at || !Array.isArray(parsed.entries)) return null
    if (!allowStale && Date.now() - parsed.at > MAL_LIST_TTL_MS) return null
    return parsed.entries
  } catch {
    return null
  }
}

function writeCache(entries: MediaListEntry[]) {
  const store = storage()
  if (!store) return
  try {
    store.setItem(MAL_LIST_CACHE_KEY, JSON.stringify({ at: Date.now(), entries }))
  } catch {
    /* quota */
  }
}

function malStatusToAni(status?: string | null, isRewatching?: boolean): string {
  if (isRewatching) return 'REPEATING'
  switch ((status || '').toLowerCase()) {
    case 'watching':
      return 'CURRENT'
    case 'completed':
      return 'COMPLETED'
    case 'on_hold':
      return 'PAUSED'
    case 'dropped':
      return 'DROPPED'
    case 'plan_to_watch':
      return 'PLANNING'
    default:
      return 'PLANNING'
  }
}

async function refreshMalAccessToken(): Promise<string | null> {
  const existing = await getMalToken()
  if (!existing?.refreshToken) return null
  const { malClientId } = getOAuthCredentials()
  if (!malClientId) return null
  await whenBridgeReady()
  const native = refreshNative()
  if (native.isApp && native.refreshMalToken) {
    try {
      await native.refreshMalToken({
        clientId: malClientId,
        refreshToken: existing.refreshToken
      })
      const updated = await getMalToken()
      return updated?.accessToken ?? null
    } catch {
      return null
    }
  }
  return existing.accessToken
}

async function malAccess(): Promise<string | null> {
  let token = await getMalToken()
  if (!token?.accessToken) return null
  if (token.expiresAt && token.expiresAt < Date.now() + 60_000) {
    return (await refreshMalAccessToken()) ?? token.accessToken
  }
  return token.accessToken
}

type MalNode = {
  id: number
  title?: string
  main_picture?: { medium?: string; large?: string }
  num_episodes?: number
  mean?: number
  media_type?: string
  status?: string
  start_season?: { year?: number; season?: string }
  genres?: Array<{ id: number; name: string }>
  my_list_status?: {
    status?: string
    score?: number
    num_episodes_watched?: number
    is_rewatching?: boolean
    updated_at?: string
    num_times_rewatched?: number
  }
}

async function malGet(path: string, access: string): Promise<Response> {
  return saizenFetch(`https://api.myanimelist.net/v2${path}`, {
    headers: { Authorization: `Bearer ${access}` }
  })
}

/**
 * Pull the user's MAL anime list and shape it like AniList MediaListEntry[].
 * Relations are filled best-effort from Jikan for CURRENT titles only (rate limit).
 */
export async function fetchMalAnimeList(opts?: {
  force?: boolean
}): Promise<MediaListEntry[]> {
  if (!opts?.force) {
    const cached = readCache()
    if (cached) return cached
  }

  let access = await malAccess()
  if (!access) {
    return readCache(true) ?? []
  }

  const nodes: Array<{ node: MalNode; list_status?: MalNode['my_list_status'] }> = []
  let offset = 0
  const limit = 100

  for (let page = 0; page < 10; page++) {
    const fields =
      'list_status,num_episodes,mean,media_type,status,start_season,genres,main_picture'
    let res = await malGet(
      `/users/@me/animelist?fields=${fields}&limit=${limit}&offset=${offset}&nsfw=true`,
      access
    )
    if (res.status === 401) {
      const refreshed = await refreshMalAccessToken()
      if (!refreshed) break
      access = refreshed
      res = await malGet(
        `/users/@me/animelist?fields=${fields}&limit=${limit}&offset=${offset}&nsfw=true`,
        access
      )
    }
    if (!res.ok) break
    const json = (await res.json()) as {
      data?: Array<{ node: MalNode; list_status?: MalNode['my_list_status'] }>
      paging?: { next?: string }
    }
    const chunk = (json.data ?? []).filter((d) => d?.node?.id)
    nodes.push(...chunk)
    if (!json.paging?.next || chunk.length < limit) break
    offset += limit
  }

  const entries: MediaListEntry[] = []
  for (const row of nodes) {
    const node = row.node
    const list = row.list_status ?? node.my_list_status
    const id = await canonicalMediaId(node.id)
    const media: AnimeMedia = {
      id,
      idMal: node.id,
      episodes: node.num_episodes ?? null,
      duration: null,
      status: mapMalAiringStatus(node.status),
      format: mapMalMediaType(node.media_type),
      averageScore: node.mean != null ? Math.round(node.mean * 10) : null,
      description: null,
      title: {
        romaji: node.title ?? null,
        english: node.title ?? null,
        native: null,
        userPreferred: node.title ?? null
      },
      coverImage: {
        extraLarge: node.main_picture?.large ?? null,
        large: node.main_picture?.large ?? node.main_picture?.medium ?? null,
        medium: node.main_picture?.medium ?? null,
        color: null
      },
      season: node.start_season?.season
        ? node.start_season.season.toUpperCase()
        : null,
      seasonYear: node.start_season?.year ?? null,
      genres: (node.genres ?? []).map((g) => g.name),
      relations: { edges: [] }
    }

    const updatedAt = list?.updated_at ? Date.parse(list.updated_at) : Date.now()
    entries.push({
      id: node.id,
      status: malStatusToAni(list?.status, list?.is_rewatching),
      progress: list?.num_episodes_watched ?? 0,
      score: list?.score ?? 0,
      repeat: list?.num_times_rewatched ?? 0,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
      media
    })
  }

  // Enrich a few CURRENT entries with Jikan relations for prequel/sequel rail.
  const current = entries
    .filter((e) => e.status === 'CURRENT' || e.status === 'REPEATING')
    .slice(0, 8)
  for (const entry of current) {
    const malId = entry.media.idMal
    if (!malId) continue
    try {
      const full = await jikanGet<{ data?: JikanAnime }>(`/anime/${malId}/full`)
      if (!full.data) continue
      const mapped = await mapJikanAnime(full.data, {
        anilistId: entry.media.id,
        includeRelations: true
      })
      entry.media.relations = mapped.relations
      entry.media.genres = mapped.genres ?? entry.media.genres
    } catch {
      /* skip */
    }
  }

  writeCache(entries)
  return entries
}

function mapMalAiringStatus(status?: string | null): string | null {
  switch ((status || '').toLowerCase()) {
    case 'currently_airing':
      return 'RELEASING'
    case 'finished_airing':
      return 'FINISHED'
    case 'not_yet_aired':
      return 'NOT_YET_RELEASED'
    default:
      return status ? status.toUpperCase() : null
  }
}

function mapMalMediaType(t?: string | null): string | null {
  if (!t) return null
  const u = t.toUpperCase()
  if (u === 'TV' || u === 'MOVIE' || u === 'OVA' || u === 'ONA' || u === 'SPECIAL' || u === 'MUSIC')
    return u
  return u
}

export async function fetchMalListEntry(
  mediaId: number,
  idMal?: number | null
): Promise<
  | { status: 'found'; entry: MediaListEntry }
  | { status: 'missing' }
  | { status: 'unavailable'; entry: MediaListEntry | null }
> {
  const cached =
    readCache(true)?.find(
      (e) => e.media.id === mediaId || (idMal != null && e.media.idMal === idMal)
    ) ?? null

  const access = await malAccess()
  if (!access) {
    return cached
      ? { status: 'unavailable', entry: cached }
      : { status: 'unavailable', entry: null }
  }

  const malId = idMal || cached?.media.idMal
  if (!malId) {
    // Try refresh full list then look up
    try {
      const list = await fetchMalAnimeList({ force: true })
      const hit = list.find((e) => e.media.id === mediaId)
      if (hit) return { status: 'found', entry: hit }
      return { status: 'missing' }
    } catch {
      return cached
        ? { status: 'unavailable', entry: cached }
        : { status: 'unavailable', entry: null }
    }
  }

  try {
    let res = await malGet(
      `/anime/${malId}?fields=my_list_status,num_episodes,mean,media_type,status,start_season,genres,main_picture,title`,
      access
    )
    if (res.status === 401) {
      const refreshed = await refreshMalAccessToken()
      if (!refreshed) {
        return cached
          ? { status: 'unavailable', entry: cached }
          : { status: 'unavailable', entry: null }
      }
      res = await malGet(
        `/anime/${malId}?fields=my_list_status,num_episodes,mean,media_type,status,start_season,genres,main_picture,title`,
        refreshed
      )
    }
    if (!res.ok) {
      return cached
        ? { status: 'unavailable', entry: cached }
        : { status: 'unavailable', entry: null }
    }
    const node = (await res.json()) as MalNode & { title?: string }
    if (!node.my_list_status) return { status: 'missing' }
    const id = await canonicalMediaId(malId, mediaId)
    const entry: MediaListEntry = {
      id: malId,
      status: malStatusToAni(node.my_list_status.status, node.my_list_status.is_rewatching),
      progress: node.my_list_status.num_episodes_watched ?? 0,
      score: node.my_list_status.score ?? 0,
      repeat: node.my_list_status.num_times_rewatched ?? 0,
      updatedAt: node.my_list_status.updated_at
        ? Date.parse(node.my_list_status.updated_at)
        : Date.now(),
      media: {
        id,
        idMal: malId,
        episodes: node.num_episodes ?? null,
        title: {
          romaji: node.title ?? null,
          english: node.title ?? null,
          native: null,
          userPreferred: node.title ?? null
        },
        coverImage: {
          extraLarge: node.main_picture?.large ?? null,
          large: node.main_picture?.large ?? node.main_picture?.medium ?? null,
          medium: node.main_picture?.medium ?? null,
          color: null
        },
        averageScore: node.mean != null ? Math.round(node.mean * 10) : null,
        format: mapMalMediaType(node.media_type),
        status: mapMalAiringStatus(node.status),
        season: node.start_season?.season?.toUpperCase() ?? null,
        seasonYear: node.start_season?.year ?? null,
        genres: (node.genres ?? []).map((g) => g.name)
      }
    }
    const existing = readCache(true) ?? []
    writeCache([entry, ...existing.filter((e) => e.media.id !== entry.media.id)])
    return { status: 'found', entry }
  } catch {
    return cached
      ? { status: 'unavailable', entry: cached }
      : { status: 'unavailable', entry: null }
  }
}
