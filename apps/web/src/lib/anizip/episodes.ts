/** AniZip mappings — episode titles, synopsis, and TVDB screencap thumbnails. */

export type AniZipEpisode = {
  number: number
  title: string
  synopsis?: string
  thumbnail?: string
  airDate?: string
  runtime?: number
}

export type AniZipBundle = {
  episodes: Map<number, AniZipEpisode>
  episodeCount: number | null
}

const cache = new Map<number, AniZipBundle>()

type RawEpisode = {
  episodeNumber?: number
  episode?: string | number
  title?: Record<string, string> | string
  image?: string
  overview?: string
  summary?: string
  airDate?: string
  airdate?: string
  runtime?: number
  length?: number
}

function pickTitle(title: RawEpisode['title']): string {
  if (!title) return ''
  if (typeof title === 'string') return title.trim()
  return (
    title.en ||
    title['x-jat'] ||
    title.ja ||
    Object.values(title).find((v) => typeof v === 'string' && v.trim()) ||
    ''
  ).trim()
}

function parseEpisodeNumber(key: string, raw: RawEpisode): number | null {
  if (typeof raw.episodeNumber === 'number' && raw.episodeNumber > 0) {
    return raw.episodeNumber
  }
  const fromField = Number(raw.episode)
  if (Number.isFinite(fromField) && fromField > 0) return fromField
  const fromKey = Number(key)
  if (Number.isFinite(fromKey) && fromKey > 0 && fromKey < 500) return fromKey
  return null
}

export async function fetchAniZipEpisodes(
  anilistId: number
): Promise<AniZipBundle> {
  const empty: AniZipBundle = { episodes: new Map(), episodeCount: null }
  if (!anilistId) return empty
  if (cache.has(anilistId)) return cache.get(anilistId)!

  try {
    const res = await fetch(`https://api.ani.zip/mappings?anilist_id=${anilistId}`)
    if (!res.ok) {
      cache.set(anilistId, empty)
      return empty
    }
    const json = (await res.json()) as {
      episodeCount?: number | null
      episodes?: Record<string, RawEpisode>
    }
    const map = new Map<number, AniZipEpisode>()
    for (const [key, raw] of Object.entries(json.episodes ?? {})) {
      const n = parseEpisodeNumber(key, raw)
      if (n == null) continue
      const title = pickTitle(raw.title)
      map.set(n, {
        number: n,
        title: title || `Episode ${n}`,
        synopsis: (raw.overview || raw.summary || '').trim() || undefined,
        thumbnail: raw.image || undefined,
        airDate: raw.airDate || raw.airdate || undefined,
        runtime: raw.runtime ?? raw.length
      })
    }
    const bundle: AniZipBundle = {
      episodes: map,
      episodeCount:
        typeof json.episodeCount === 'number' && json.episodeCount > 0
          ? json.episodeCount
          : map.size > 0
            ? Math.max(...map.keys())
            : null
    }
    cache.set(anilistId, bundle)
    return bundle
  } catch {
    cache.set(anilistId, empty)
    return empty
  }
}
