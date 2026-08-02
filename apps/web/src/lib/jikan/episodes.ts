/** Jikan (MAL) episode metadata — titles/synopsis AniList streamingEpisodes often lacks. */

export interface JikanEpisodeDetail {
  number: number
  title: string
  titleJapanese?: string
  synopsis?: string
  aired?: string
  duration?: string
  filler?: boolean
  recap?: boolean
}

const detailCache = new Map<string, JikanEpisodeDetail | null>()
const listCache = new Map<number, JikanEpisodeDetail[]>()

export async function fetchJikanEpisode(
  malId: number,
  episode: number
): Promise<JikanEpisodeDetail | null> {
  if (!malId || !episode) return null
  const key = `${malId}:${episode}`
  if (detailCache.has(key)) return detailCache.get(key) ?? null

  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}/episodes/${episode}`)
    if (!res.ok) {
      detailCache.set(key, null)
      return null
    }
    const json = (await res.json()) as {
      data?: {
        mal_id?: number
        title?: string
        title_japanese?: string
        synopsis?: string
        aired?: string
        duration?: number | string
        filler?: boolean
        recap?: boolean
      }
    }
    const d = json.data
    if (!d) {
      detailCache.set(key, null)
      return null
    }
    const detail: JikanEpisodeDetail = {
      number: d.mal_id ?? episode,
      title: d.title || `Episode ${episode}`,
      titleJapanese: d.title_japanese ?? undefined,
      synopsis: d.synopsis?.trim() || undefined,
      aired: d.aired ?? undefined,
      duration:
        typeof d.duration === 'number'
          ? `${d.duration} min`
          : typeof d.duration === 'string'
            ? d.duration
            : undefined,
      filler: d.filler,
      recap: d.recap
    }
    detailCache.set(key, detail)
    return detail
  } catch {
    detailCache.set(key, null)
    return null
  }
}

/**
 * Paginate Jikan episode list (titles for airing/new shows).
 * Respects ~3 req/sec soft limit with a short delay between pages.
 */
export async function fetchJikanEpisodeList(
  malId: number,
  maxPages = 4
): Promise<Map<number, JikanEpisodeDetail>> {
  const map = new Map<number, JikanEpisodeDetail>()
  if (!malId) return map

  if (listCache.has(malId)) {
    for (const ep of listCache.get(malId)!) map.set(ep.number, ep)
    return map
  }

  const collected: JikanEpisodeDetail[] = []
  try {
    for (let page = 1; page <= maxPages; page++) {
      const res = await fetch(
        `https://api.jikan.moe/v4/anime/${malId}/episodes?page=${page}`
      )
      if (!res.ok) break
      const json = (await res.json()) as {
        data?: Array<{
          mal_id?: number
          title?: string
          title_japanese?: string
          title_romanji?: string
          aired?: string
          filler?: boolean
          recap?: boolean
          synopsis?: string
        }>
        pagination?: { has_next_page?: boolean }
      }
      const rows = json.data ?? []
      if (!rows.length) break
      for (const d of rows) {
        const n = d.mal_id
        if (!n) continue
        const detail: JikanEpisodeDetail = {
          number: n,
          title: d.title || d.title_romanji || `Episode ${n}`,
          titleJapanese: d.title_japanese ?? undefined,
          synopsis: d.synopsis?.trim() || undefined,
          aired: d.aired ?? undefined,
          filler: d.filler,
          recap: d.recap
        }
        collected.push(detail)
        map.set(n, detail)
        detailCache.set(`${malId}:${n}`, detail)
      }
      if (!json.pagination?.has_next_page) break
      await new Promise((r) => setTimeout(r, 350))
    }
    listCache.set(malId, collected)
  } catch {
    /* partial ok */
  }
  return map
}
