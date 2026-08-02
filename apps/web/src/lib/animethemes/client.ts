/** AnimeThemes.moe — public read API for OP/ED clips. No auth required. */

const BASE = 'https://api.animethemes.moe'

export type ThemeKind = 'OP' | 'ED' | 'IN' | 'OTHER'

export interface AnimeThemeTrack {
  id: number
  kind: ThemeKind
  sequence: number | null
  slug: string
  title: string
  videoUrl: string | null
  resolution: number | null
}

type ApiVideo = {
  id?: number
  link?: string | null
  resolution?: number | null
  source?: string | null
  tags?: string | null
}

type ApiTheme = {
  id: number
  type?: string | null
  sequence?: number | null
  slug?: string | null
  song?: { title?: string | null } | null
  animethemeentries?: Array<{
    videos?: ApiVideo[] | null
  }> | null
}

type ApiAnime = {
  id?: number
  name?: string
  slug?: string
  animethemes?: ApiTheme[] | null
}

function pickBestVideo(videos: ApiVideo[]): ApiVideo | null {
  if (!videos.length) return null
  const withLink = videos.filter((v) => v.link)
  if (!withLink.length) return null
  // Prefer higher resolution, then non-NCBD tags lightly
  return [...withLink].sort((a, b) => (b.resolution ?? 0) - (a.resolution ?? 0))[0]
}

function mapKind(type?: string | null): ThemeKind {
  const t = (type || '').toUpperCase()
  if (t === 'OP' || t === 'ED' || t === 'IN') return t
  return 'OTHER'
}

function normalizeThemes(themes: ApiTheme[]): AnimeThemeTrack[] {
  const out: AnimeThemeTrack[] = []
  for (const theme of themes) {
    const entries = theme.animethemeentries ?? []
    const videos = entries.flatMap((e) => e.videos ?? [])
    const best = pickBestVideo(videos)
    out.push({
      id: theme.id,
      kind: mapKind(theme.type),
      sequence: theme.sequence ?? null,
      slug: theme.slug || `${theme.type ?? 'T'}${theme.sequence ?? ''}`,
      title: theme.song?.title?.trim() || theme.slug || 'Theme',
      videoUrl: best?.link ?? null,
      resolution: best?.resolution ?? null
    })
  }
  const rank = (k: ThemeKind) => (k === 'OP' ? 0 : k === 'ED' ? 1 : k === 'IN' ? 2 : 3)
  return out.sort((a, b) => {
    const rk = rank(a.kind) - rank(b.kind)
    if (rk !== 0) return rk
    return (a.sequence ?? 999) - (b.sequence ?? 999)
  })
}

/**
 * Resolve OP/ED tracks for an AniList media id.
 * Uses AnimeThemes resource mapping: filter[has]=resources&filter[site]=AniList&filter[external_id]=…
 */
export async function fetchThemesByAniListId(
  anilistId: number
): Promise<AnimeThemeTrack[]> {
  if (!anilistId) return []
  const params = new URLSearchParams()
  params.set('filter[has]', 'resources')
  params.set('filter[site]', 'AniList')
  params.set('filter[external_id]', String(anilistId))
  params.set('include', 'animethemes.animethemeentries.videos,animethemes.song')
  params.set('page[size]', '1')

  const res = await fetch(`${BASE}/anime?${params.toString()}`, {
    headers: { Accept: 'application/json' }
  })
  if (!res.ok) {
    if (res.status === 404) return []
    throw new Error(`AnimeThemes ${res.status}`)
  }
  const data = (await res.json()) as { anime?: ApiAnime[] }
  const anime = data.anime?.[0]
  if (!anime?.animethemes?.length) return []
  // Prefer OP/ED; cap so long-running series don't flood the page
  return normalizeThemes(anime.animethemes)
    .filter((t) => t.kind === 'OP' || t.kind === 'ED')
    .slice(0, 24)
}
