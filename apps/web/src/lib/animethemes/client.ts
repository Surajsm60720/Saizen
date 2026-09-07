/** AnimeThemes.moe — public read API for OP/ED metadata. No auth required. */
/** MAL catalog (Tenrai / Jikan) used as fallback when AnimeThemes is down / flaky. */

const BASE = 'https://api.animethemes.moe'
const SITE = 'https://animethemes.moe'

export type ThemeKind = 'OP' | 'ED' | 'IN' | 'OTHER'

export type ThemeStreamSite = 'YouTube' | 'YouTube Music' | 'Spotify'

export interface AnimeThemeTrack {
  id: number
  kind: ThemeKind
  sequence: number | null
  slug: string
  /** Song title */
  title: string
  artists: string[]
  /** Best listen link: YouTube / Spotify resource, else YouTube search */
  streamUrl: string
  streamSite: ThemeStreamSite | 'YouTube Search'
  /** YouTube thumb when we have a watch URL; else null (UI may use anime cover) */
  thumbnailUrl: string | null
  animeSlug: string | null
  pageUrl: string | null
}

export class ThemesFetchError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ThemesFetchError'
    this.status = status
  }
}

type ApiResource = {
  id?: number
  link?: string | null
  site?: string | null
}

type ApiArtist = {
  id?: number
  name?: string | null
  slug?: string | null
  resources?: ApiResource[] | null
}

type ApiSong = {
  id?: number
  title?: string | null
  artists?: ApiArtist[] | null
  resources?: ApiResource[] | null
}

type ApiTheme = {
  id: number
  type?: string | null
  sequence?: number | null
  slug?: string | null
  song?: ApiSong | null
}

type ApiAnime = {
  id?: number
  name?: string
  slug?: string
  animethemes?: ApiTheme[] | null
}

const STREAM_PRIORITY: ThemeStreamSite[] = ['YouTube', 'YouTube Music', 'Spotify']

function mapKind(type?: string | null): ThemeKind {
  const t = (type || '').toUpperCase()
  if (t === 'OP' || t === 'ED' || t === 'IN') return t
  return 'OTHER'
}

function animePageUrl(animeSlug: string | null | undefined): string | null {
  const slug = animeSlug?.trim()
  if (!slug) return null
  return `${SITE}/anime/${encodeURIComponent(slug)}`
}

function youtubeVideoId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace(/^\//, '').split('/')[0]
      return id || null
    }
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v')
      if (v) return v
      const m = u.pathname.match(/\/(?:embed|shorts)\/([^/]+)/)
      return m?.[1] ?? null
    }
  } catch {
    /* ignore */
  }
  return null
}

function youtubeThumbnail(url: string): string | null {
  const id = youtubeVideoId(url)
  if (!id) return null
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
}

function pickStream(resources: ApiResource[]): {
  url: string
  site: ThemeStreamSite
} | null {
  const bySite = new Map<string, string>()
  for (const r of resources) {
    const site = (r.site || '').trim()
    const link = (r.link || '').trim()
    if (!site || !link || !/^https:\/\//i.test(link)) continue
    if (!bySite.has(site)) bySite.set(site, link)
  }
  for (const site of STREAM_PRIORITY) {
    const url = bySite.get(site)
    if (url) return { url, site }
  }
  return null
}

function youtubeSearchUrl(title: string, artists: string[], kind: ThemeKind): string {
  const parts = [title, ...artists.slice(0, 2), kind === 'ED' ? 'ending' : 'opening', 'anime']
  const q = parts.filter(Boolean).join(' ')
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function normalizeThemes(themes: ApiTheme[], animeSlug: string | null): AnimeThemeTrack[] {
  const pageUrl = animePageUrl(animeSlug)
  const out: AnimeThemeTrack[] = []
  for (const theme of themes) {
    const kind = mapKind(theme.type)
    const song = theme.song
    const title = song?.title?.trim() || theme.slug || 'Theme'
    const artists = (song?.artists ?? [])
      .map((a) => a.name?.trim())
      .filter((n): n is string => Boolean(n))
    const resources = [...(song?.resources ?? [])]
    for (const a of song?.artists ?? []) {
      for (const r of a.resources ?? []) resources.push(r)
    }
    const picked = pickStream(resources)
    const streamUrl = picked?.url ?? youtubeSearchUrl(title, artists, kind)
    const streamSite: AnimeThemeTrack['streamSite'] = picked?.site ?? 'YouTube Search'
    out.push({
      id: theme.id,
      kind,
      sequence: theme.sequence ?? null,
      slug: theme.slug || `${theme.type ?? 'T'}${theme.sequence ?? ''}`,
      title,
      artists,
      streamUrl,
      streamSite,
      thumbnailUrl: picked ? youtubeThumbnail(picked.url) : null,
      animeSlug,
      pageUrl
    })
  }
  const rank = (k: ThemeKind) => (k === 'OP' ? 0 : k === 'ED' ? 1 : k === 'IN' ? 2 : 3)
  return out.sort((a, b) => {
    const rk = rank(a.kind) - rank(b.kind)
    if (rk !== 0) return rk
    return (a.sequence ?? 999) - (b.sequence ?? 999)
  })
}

/** Parse Jikan theme lines like `1: "Idol" by YOASOBI (eps 1-11)`. */
function parseJikanThemeLine(
  line: string,
  kind: 'OP' | 'ED',
  index: number
): AnimeThemeTrack | null {
  const raw = line.trim()
  if (!raw) return null
  const m = raw.match(
    /^(?:(\d+)\s*:\s*)?(?:"([^"]+)"|“([^”]+)”|([^"“]+?))\s*(?:by\s+(.+?))?(?:\s*\(|$)/i
  )
  let sequence: number | null = null
  let title = raw
  let artists: string[] = []
  if (m) {
    sequence = m[1] ? Number(m[1]) : index + 1
    title = (m[2] || m[3] || m[4] || raw).trim()
    const by = m[5]?.trim()
    if (by) artists = [by.replace(/\s*\(.*$/, '').trim()].filter(Boolean)
  } else {
    sequence = index + 1
  }
  if (!title) return null
  const slug = `${kind}${sequence ?? index + 1}`
  return {
    id: kind === 'OP' ? -(index + 1) : -(1000 + index + 1),
    kind,
    sequence,
    slug,
    title,
    artists,
    streamUrl: youtubeSearchUrl(title, artists, kind),
    streamSite: 'YouTube Search',
    thumbnailUrl: null,
    animeSlug: null,
    pageUrl: null
  }
}

async function fetchThemesFromJikan(idMal: number): Promise<AnimeThemeTrack[]> {
  const { jikanGet } = await import('@/lib/catalog/jikanHttp')
  try {
    const json = await jikanGet<{
      data?: { openings?: string[]; endings?: string[] }
    }>(`/anime/${idMal}/themes`)
    const openings = json.data?.openings ?? []
    const endings = json.data?.endings ?? []
    const out: AnimeThemeTrack[] = []
    openings.forEach((line, i) => {
      const t = parseJikanThemeLine(line, 'OP', i)
      if (t) out.push(t)
    })
    endings.forEach((line, i) => {
      const t = parseJikanThemeLine(line, 'ED', i)
      if (t) out.push(t)
    })
    return out.slice(0, 24)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const statusMatch = msg.match(/HTTP (\d+)/i)
    const status = statusMatch ? Number(statusMatch[1]) : undefined
    if (status === 404) return []
    throw new ThemesFetchError(`MAL catalog themes ${msg}`, status)
  }
}

/** Official MAL API — works when Jikan's MAL upstream is 504. */
async function fetchThemesFromMalOfficial(idMal: number): Promise<AnimeThemeTrack[]> {
  const { getOAuthCredentials } = await import('@/lib/auth/credentials')
  const { malClientId } = getOAuthCredentials()
  if (!malClientId) return []

  const { saizenFetch } = await import('@/lib/extensions/fetch')
  const url = `https://api.myanimelist.net/v2/anime/${idMal}?fields=opening_themes,ending_themes`
  const res = await saizenFetch(url, {
    headers: {
      Accept: 'application/json',
      'X-MAL-CLIENT-ID': malClientId
    }
  })
  if (!res.ok) {
    if (res.status === 404) return []
    throw new ThemesFetchError(`MAL themes ${res.status}`, res.status)
  }
  const json = (await res.json()) as {
    opening_themes?: Array<{ id?: number; text?: string }>
    ending_themes?: Array<{ id?: number; text?: string }>
  }
  const out: AnimeThemeTrack[] = []
  ;(json.opening_themes ?? []).forEach((row, i) => {
    const t = parseJikanThemeLine(row.text || '', 'OP', i)
    if (t) {
      if (row.id) t.id = row.id
      out.push(t)
    }
  })
  ;(json.ending_themes ?? []).forEach((row, i) => {
    const t = parseJikanThemeLine(row.text || '', 'ED', i)
    if (t) {
      if (row.id) t.id = 100_000 + row.id
      out.push(t)
    }
  })
  return out.slice(0, 24)
}

async function fetchThemesFromAnimeThemesBySite(
  site: 'AniList' | 'MyAnimeList',
  externalId: number
): Promise<AnimeThemeTrack[]> {
  const params = new URLSearchParams()
  // filter[has]=resources is required — without it site/external_id filters are
  // ignored and the API returns the first anime alphabetically (.hack//…).
  params.set('filter[has]', 'resources')
  params.set('filter[site]', site)
  params.set('filter[external_id]', String(externalId))
  // Song title + artists only (UI is display-only; skip stream resources).
  params.set('include', 'animethemes.song.artists')
  params.set('page[size]', '1')

  const { saizenFetch } = await import('@/lib/extensions/fetch')
  const url = `${BASE}/anime?${params.toString()}`

  // Brief retry for transient CF blips; longer outages fall through to Jikan.
  let lastStatus = 0
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(600)
    const res = await saizenFetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      }
    })
    lastStatus = res.status
    if (res.ok) {
      const data = (await res.json()) as { anime?: ApiAnime[] }
      const anime = data.anime?.[0]
      if (!anime?.animethemes?.length) return []
      const animeSlug = anime.slug?.trim() || null
      return normalizeThemes(anime.animethemes, animeSlug)
        .filter((t) => t.kind === 'OP' || t.kind === 'ED')
        .slice(0, 24)
    }
    if (res.status === 404) return []
    if (res.status === 422) {
      throw new ThemesFetchError('AnimeThemes rejected the request', 422)
    }
    if (![502, 503, 504, 520, 521, 522, 523, 524].includes(res.status)) {
      throw new ThemesFetchError(`AnimeThemes ${res.status}`, res.status)
    }
  }
  throw new ThemesFetchError(`AnimeThemes unavailable (${lastStatus})`, lastStatus)
}

async function fetchThemesFromAnimeThemes(
  anilistId: number,
  idMal?: number | null
): Promise<AnimeThemeTrack[]> {
  try {
    const tracks = await fetchThemesFromAnimeThemesBySite('AniList', anilistId)
    if (tracks.length) return tracks
  } catch (e) {
    if (!idMal) throw e
  }
  if (idMal) {
    return fetchThemesFromAnimeThemesBySite('MyAnimeList', idMal)
  }
  return []
}

/** Last-resort cards when theme catalogs are down — YouTube search by anime title. */
export function titleSearchThemes(animeTitle: string): AnimeThemeTrack[] {
  const title = animeTitle.trim()
  if (!title) return []
  return [
    {
      id: -9001,
      kind: 'OP',
      sequence: null,
      slug: 'OP',
      title: `${title} — Opening`,
      artists: [],
      streamUrl: youtubeSearchUrl(`${title} opening`, [], 'OP'),
      streamSite: 'YouTube Search',
      thumbnailUrl: null,
      animeSlug: null,
      pageUrl: null
    },
    {
      id: -9002,
      kind: 'ED',
      sequence: null,
      slug: 'ED',
      title: `${title} — Ending`,
      artists: [],
      streamUrl: youtubeSearchUrl(`${title} ending`, [], 'ED'),
      streamSite: 'YouTube Search',
      thumbnailUrl: null,
      animeSlug: null,
      pageUrl: null
    }
  ]
}

export type ThemesFetchResult = {
  tracks: AnimeThemeTrack[]
  /** Where the list came from */
  source: 'animethemes' | 'jikan' | 'mal' | 'youtube-search' | 'empty'
}

/**
 * Resolve OP/ED song names for an AniList media id.
 * AnimeThemes → Jikan → official MAL. Display names only.
 */
export async function fetchThemesByAniListId(
  anilistId: number,
  opts?: { idMal?: number | null; title?: string | null }
): Promise<ThemesFetchResult> {
  if (!anilistId) return { tracks: [], source: 'empty' }

  try {
    const tracks = await fetchThemesFromAnimeThemes(anilistId, opts?.idMal)
    if (tracks.length) return { tracks, source: 'animethemes' }
  } catch {
    /* try Jikan / MAL */
  }

  if (opts?.idMal) {
    try {
      const jikan = await fetchThemesFromJikan(opts.idMal)
      if (jikan.length) return { tracks: jikan, source: 'jikan' }
    } catch {
      /* try official MAL */
    }
    try {
      const mal = await fetchThemesFromMalOfficial(opts.idMal)
      if (mal.length) return { tracks: mal, source: 'mal' }
    } catch {
      /* empty */
    }
  }

  return { tracks: [], source: 'empty' }
}
