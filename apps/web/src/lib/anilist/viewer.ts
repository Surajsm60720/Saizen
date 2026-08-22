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
  /** Normalized 0–10 score (from score(format: POINT_10)) */
  score: number
  repeat: number
  updatedAt: number
  media: AnimeMedia
}

export type ViewerProfile = {
  id: number
  name: string
}

const LIST_CACHE_KEY = 'saizen:anilist-list-cache'
const VIEWER_ID_KEY = 'saizen:anilist-viewer-id'
/** Fresh window for soft reads; stale entries still usable for instant Home paint. */
const LIST_CACHE_TTL_MS = 15 * 60 * 1000

type ListCache = {
  at: number
  entries: MediaListEntry[]
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage
  } catch {
    return null
  }
}

function readListCache(opts?: { allowStale?: boolean }): MediaListEntry[] | null {
  const store = storage()
  if (!store) return null
  try {
    // Prefer localStorage; fall back to legacy sessionStorage once.
    let raw = store.getItem(LIST_CACHE_KEY)
    if (!raw) {
      try {
        raw = sessionStorage.getItem(LIST_CACHE_KEY)
        if (raw) {
          store.setItem(LIST_CACHE_KEY, raw)
          sessionStorage.removeItem(LIST_CACHE_KEY)
        }
      } catch {
        /* ignore */
      }
    }
    if (!raw) return null
    const parsed = JSON.parse(raw) as ListCache
    if (!parsed?.at || !Array.isArray(parsed.entries)) return null
    if (!opts?.allowStale && Date.now() - parsed.at > LIST_CACHE_TTL_MS) return null
    return parsed.entries
  } catch {
    return null
  }
}

function writeListCache(entries: MediaListEntry[]) {
  const store = storage()
  if (!store) return
  try {
    store.setItem(LIST_CACHE_KEY, JSON.stringify({ at: Date.now(), entries }))
  } catch {
    /* quota */
  }
}

function readCachedViewerId(): number | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(VIEWER_ID_KEY)
    if (!raw) return null
    const id = Number(raw)
    return Number.isFinite(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

function writeCachedViewerId(id: number) {
  const store = storage()
  if (!store) return
  try {
    store.setItem(VIEWER_ID_KEY, String(id))
  } catch {
    /* ignore */
  }
}

export function clearViewerListCache() {
  const store = storage()
  if (!store) return
  try {
    store.removeItem(LIST_CACHE_KEY)
    store.removeItem(VIEWER_ID_KEY)
    sessionStorage.removeItem(LIST_CACHE_KEY)
  } catch {
    /* ignore */
  }
}

function normalizeEntry(partial: {
  id: number
  status?: string | null
  progress?: number | null
  score?: number | null
  repeat?: number | null
  /** AniList unix seconds */
  updatedAt?: number | null
  media: AnimeMedia
}): MediaListEntry {
  const rawScore = partial.score ?? 0
  // POINT_10 should already be 0–10; if a 100-point value slips through, scale it.
  const score =
    rawScore > 10 ? Math.round(rawScore / 10) : Math.round(rawScore)

  return {
    id: partial.id,
    status: partial.status ?? 'CURRENT',
    progress: partial.progress ?? 0,
    score,
    repeat: partial.repeat ?? 0,
    updatedAt: (partial.updatedAt ?? 0) * 1000,
    media: partial.media
  }
}

/** Patch one entry in the session list cache (keeps Home rails warm). */
export function upsertViewerListCacheEntry(entry: MediaListEntry) {
  const existing = readListCache() ?? []
  const next = [entry, ...existing.filter((e) => e.media.id !== entry.media.id)]
  writeListCache(next)
}

export function removeViewerListCacheEntry(mediaId: number) {
  const existing = readListCache({ allowStale: true })
  if (!existing) return
  writeListCache(existing.filter((e) => e.media.id !== mediaId))
}

/** Sync peek for Home first paint (avoids empty rails while network runs). */
export function peekViewerListCache(opts?: { allowStale?: boolean }): MediaListEntry[] | null {
  return readListCache({ allowStale: opts?.allowStale ?? true })
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
  const json = (await res.json().catch(() => null)) as {
    data?: T
    errors?: Array<{ message?: string; status?: number }>
  } | null

  // AniList returns HTTP 404 + MediaList:null when the entry is not on the list.
  if (!res.ok) {
    const msg = json?.errors?.[0]?.message || `AniList HTTP ${res.status}`
    throw new Error(msg)
  }
  if (json?.errors?.length) {
    throw new Error(json.errors[0]?.message || 'AniList query error')
  }
  if (!json?.data) throw new Error('AniList empty response')
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
  if (data.Viewer?.id) writeCachedViewerId(data.Viewer.id)
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

  try {
    let userId = readCachedViewerId()
    if (userId == null) {
      const viewer = await fetchViewer()
      if (!viewer) return readListCache({ allowStale: true }) ?? []
      userId = viewer.id
    }

    const data = await authedQuery<{
      MediaListCollection: {
        lists?: Array<{
          entries?: Array<{
            id: number
            status?: string | null
            progress?: number | null
            score?: number | null
            repeat?: number | null
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
            score(format: POINT_10)
            repeat
            updatedAt
            media {
              ${LIST_MEDIA}
            }
          }
        }
      }
    }
  `,
      { userId, status_in: statusIn }
    )

    const out: MediaListEntry[] = []
    const seen = new Set<number>()
    for (const list of data.MediaListCollection?.lists ?? []) {
      for (const entry of list?.entries ?? []) {
        if (!entry?.media?.id) continue
        if (seen.has(entry.media.id)) continue
        seen.add(entry.media.id)
        out.push(
          normalizeEntry({
            id: entry.id,
            status: entry.status,
            progress: entry.progress,
            score: entry.score,
            repeat: entry.repeat,
            updatedAt: entry.updatedAt,
            media: entry.media
          })
        )
      }
    }
    writeListCache(out)
    return out
  } catch (e) {
    // Cached viewer id may be wrong after account switch — clear and retry once via Viewer.
    if (readCachedViewerId() != null && !opts?.force) {
      try {
        const store = storage()
        store?.removeItem(VIEWER_ID_KEY)
      } catch {
        /* ignore */
      }
    }
    const stale = readListCache({ allowStale: true })
    if (stale?.length) return stale
    throw e
  }
}

export type ViewerListEntryResult =
  | { status: 'found'; entry: MediaListEntry }
  | { status: 'missing' }
  | { status: 'unavailable'; entry: MediaListEntry | null }

function isMediaListMissingError(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('not found') ||
    m.includes('no media list') ||
    m.includes('http 404') ||
    (m.includes('medialist') && m.includes('null'))
  )
}

/**
 * Fetch a single list entry. Distinguishes:
 * - found: server returned the entry (use these values strictly)
 * - missing: confirmed not on the user's AniList
 * - unavailable: network/rate-limit/auth — keep any cached entry; do not invent defaults
 */
export async function fetchViewerListEntry(
  mediaId: number
): Promise<ViewerListEntryResult> {
  const cached = readListCache({ allowStale: true })?.find((e) => e.media.id === mediaId) ?? null
  const token = await getAnilistToken()
  if (!token?.accessToken) {
    return cached
      ? { status: 'unavailable', entry: cached }
      : { status: 'unavailable', entry: null }
  }

  const viewer = await fetchViewer().catch(() => null)
  if (!viewer) {
    return cached
      ? { status: 'unavailable', entry: cached }
      : { status: 'unavailable', entry: null }
  }

  try {
    const data = await authedQuery<{
      MediaList: {
        id: number
        status?: string | null
        progress?: number | null
        score?: number | null
        repeat?: number | null
        updatedAt?: number | null
        media?: AnimeMedia | null
      } | null
    }>(
      `
      query ($userId: Int, $mediaId: Int) {
        MediaList(userId: $userId, mediaId: $mediaId) {
          id
          status
          progress
          score(format: POINT_10)
          repeat
          updatedAt
          media {
            ${LIST_MEDIA}
          }
        }
      }
    `,
      { userId: viewer.id, mediaId }
    )

    const raw = data.MediaList
    if (!raw?.media?.id) {
      if (cached) removeViewerListCacheEntry(mediaId)
      return { status: 'missing' }
    }

    const entry = normalizeEntry({
      id: raw.id,
      status: raw.status,
      progress: raw.progress,
      score: raw.score,
      repeat: raw.repeat,
      updatedAt: raw.updatedAt,
      media: raw.media
    })
    upsertViewerListCacheEntry(entry)
    return { status: 'found', entry }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (isMediaListMissingError(message)) {
      if (cached) removeViewerListCacheEntry(mediaId)
      return { status: 'missing' }
    }
    return { status: 'unavailable', entry: cached }
  }
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
