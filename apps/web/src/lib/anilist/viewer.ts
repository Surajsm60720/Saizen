import { getAnilistToken } from '@/lib/auth/tokens'
import type { AnimeMedia, AnimeRelationEdge } from './client'
import { displayTitle } from './client'

const LIST_MEDIA = `
  id
  idMal
  episodes
  duration
  status
  format
  averageScore
  seasonYear
  genres
  bannerImage
  title { romaji english native userPreferred }
  coverImage { large medium }
  relations {
    edges {
      relationType
      node {
        id
        type
        format
        status
        averageScore
        seasonYear
        title { romaji english native userPreferred }
        coverImage { large medium }
      }
    }
  }
`

export type MediaListEntry = {
  id: number
  status: string
  progress: number
  updatedAt: number
  media: AnimeMedia
}

export type ViewerProfile = {
  id: number
  name: string
}

const LIST_CACHE_KEY = 'saizen:anilist-list-cache'
const LIST_CACHE_TTL_MS = 5 * 60 * 1000

type ListCache = {
  at: number
  entries: MediaListEntry[]
}

function readListCache(): MediaListEntry[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(LIST_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ListCache
    if (!parsed?.at || Date.now() - parsed.at > LIST_CACHE_TTL_MS) return null
    return Array.isArray(parsed.entries) ? parsed.entries : null
  } catch {
    return null
  }
}

function writeListCache(entries: MediaListEntry[]) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(LIST_CACHE_KEY, JSON.stringify({ at: Date.now(), entries }))
  } catch {
    /* quota */
  }
}

export function clearViewerListCache() {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(LIST_CACHE_KEY)
}

/** Sync peek for Home first paint (avoids empty rails while network runs). */
export function peekViewerListCache(): MediaListEntry[] | null {
  return readListCache()
}

async function authedQuery<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const token = await getAnilistToken()
  if (!token?.accessToken) {
    throw new Error('AniList not connected')
  }
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token.accessToken}`
    },
    body: JSON.stringify({ query, variables })
  })
  if (!res.ok) throw new Error(`AniList HTTP ${res.status}`)
  const json = (await res.json()) as {
    data?: T
    errors?: Array<{ message?: string }>
  }
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message || 'AniList query error')
  }
  if (!json.data) throw new Error('AniList empty response')
  return json.data
}

export async function fetchViewer(): Promise<ViewerProfile | null> {
  const token = await getAnilistToken()
  if (!token?.accessToken) return null
  const data = await authedQuery<{ Viewer: ViewerProfile | null }>(`
    query {
      Viewer { id name }
    }
  `)
  return data.Viewer
}

/** Pull anime list entries for the signed-in viewer. */
export async function fetchViewerAnimeList(
  statusIn: string[] = ['CURRENT', 'REPEATING', 'COMPLETED', 'PAUSED', 'PLANNING'],
  opts?: { force?: boolean }
): Promise<MediaListEntry[]> {
  if (!opts?.force) {
    const cached = readListCache()
    if (cached) return cached
  }

  const viewer = await fetchViewer()
  if (!viewer) return []

  const data = await authedQuery<{
    MediaListCollection: {
      lists?: Array<{
        entries?: Array<{
          id: number
          status?: string | null
          progress?: number | null
          updatedAt?: number | null
          media?: AnimeMedia | null
        } | null> | null
      } | null> | null
    } | null
  }>(
    `
    query ($userId: Int, $status_in: [MediaListStatus]) {
      MediaListCollection(userId: $userId, type: ANIME, status_in: $status_in) {
        lists {
          entries {
            id
            status
            progress
            updatedAt
            media {
              ${LIST_MEDIA}
            }
          }
        }
      }
    }
  `,
    { userId: viewer.id, status_in: statusIn }
  )

  const out: MediaListEntry[] = []
  const seen = new Set<number>()
  for (const list of data.MediaListCollection?.lists ?? []) {
    for (const entry of list?.entries ?? []) {
      if (!entry?.media?.id) continue
      if (seen.has(entry.media.id)) continue
      seen.add(entry.media.id)
      out.push({
        id: entry.id,
        status: entry.status ?? 'CURRENT',
        progress: entry.progress ?? 0,
        updatedAt: (entry.updatedAt ?? 0) * 1000,
        media: entry.media
      })
    }
  }
  writeListCache(out)
  return out
}

export async function fetchGenrePopular(
  genres: string[],
  perPage = 24
): Promise<AnimeMedia[]> {
  if (!genres.length) return []
  const query = `
    query ($genre_in: [String], $perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(
          type: ANIME
          genre_in: $genre_in
          sort: POPULARITY_DESC
          isAdult: false
        ) {
          id
          idMal
          episodes
          format
          averageScore
          seasonYear
          genres
          title { romaji english native userPreferred }
          coverImage { large medium }
        }
      }
    }
  `
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      query,
      variables: { genre_in: genres.slice(0, 3), perPage }
    })
  })
  if (!res.ok) throw new Error(`AniList HTTP ${res.status}`)
  const json = (await res.json()) as {
    data?: { Page?: { media?: AnimeMedia[] } }
    errors?: Array<{ message?: string }>
  }
  if (json.errors?.length) throw new Error(json.errors[0]?.message || 'AniList error')
  return json.data?.Page?.media ?? []
}

const RELATED = new Set(['PREQUEL', 'SEQUEL', 'PARENT', 'SIDE_STORY', 'SPIN_OFF'])
const SOURCE_TYPES = new Set(['SOURCE', 'ADAPTATION'])

export function derivePrequelsSequels(
  entries: MediaListEntry[],
  limit = 18
): Array<{ media: AnimeMedia; relationType: string }> {
  const onList = new Set(entries.map((e) => e.media.id))
  const out: Array<{ media: AnimeMedia; relationType: string }> = []
  const seen = new Set<number>()

  const ordered = [...entries].sort((a, b) => {
    const rank = (s: string) =>
      s === 'CURRENT' || s === 'REPEATING' ? 0 : s === 'COMPLETED' ? 1 : 2
    const r = rank(a.status) - rank(b.status)
    if (r !== 0) return r
    return b.updatedAt - a.updatedAt
  })

  for (const entry of ordered) {
    const edges = (entry.media.relations?.edges ?? []) as AnimeRelationEdge[]
    for (const edge of edges) {
      const node = edge.node
      const type = edge.relationType ?? ''
      if (!node?.id || !RELATED.has(type)) continue
      if (onList.has(node.id) || seen.has(node.id)) continue
      seen.add(node.id)
      out.push({ media: node as AnimeMedia, relationType: type })
      if (out.length >= limit) return out
    }
  }
  return out
}

export function deriveSourceMaterials(
  media: AnimeMedia
): Array<{ media: AnimeMedia; relationType: string }> {
  const edges = media.relations?.edges ?? []
  const out: Array<{ media: AnimeMedia; relationType: string }> = []
  const seen = new Set<number>()
  for (const edge of edges) {
    const node = edge.node as (AnimeMedia & { type?: string }) | null | undefined
    const rel = edge.relationType ?? ''
    if (!node?.id || seen.has(node.id)) continue
    const isMangaLike =
      node.type === 'MANGA' ||
      node.format === 'MANGA' ||
      node.format === 'NOVEL' ||
      node.format === 'ONE_SHOT'
    // AniList: SOURCE → manga/LN; also surface any manga/novel parent-style edge
    const keep =
      rel === 'SOURCE' ||
      (isMangaLike && (rel === 'PARENT' || rel === 'ALTERNATIVE' || SOURCE_TYPES.has(rel)))
    if (!keep) continue
    seen.add(node.id)
    out.push({ media: node, relationType: rel || 'SOURCE' })
  }
  return out
}

export function deriveTopGenres(entries: MediaListEntry[], limit = 3): string[] {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    const w = entry.status === 'CURRENT' || entry.status === 'REPEATING' ? 3 : 1
    for (const g of entry.media.genres ?? []) {
      if (!g) continue
      counts.set(g, (counts.get(g) ?? 0) + w)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([g]) => g)
}

export function continueEntriesFromList(entries: MediaListEntry[]) {
  return entries
    .filter((e) => e.status === 'CURRENT' || e.status === 'REPEATING')
    .filter((e) => {
      const total = e.media.episodes
      if (total != null && total > 0 && e.progress >= total) return false
      return true
    })
    .map((e) => {
      const next = Math.max(1, (e.progress ?? 0) + 1)
      return {
        anilistId: e.media.id,
        title: displayTitle(e.media),
        cover: e.media.coverImage?.large ?? e.media.coverImage?.medium,
        episode: next,
        updatedAt: e.updatedAt || Date.now()
      }
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
}
