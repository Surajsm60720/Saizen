import { saizenFetchJson } from '@/lib/extensions/fetch'

export interface IdMappings {
  anilist: number
  anidb?: number
  anidbAid?: number
  mal?: number
  tvdb?: number
  tmdb?: number
  /** AniDB episode id for the requested episode, when known */
  anidbEid?: number
  tvdbEId?: number
}

const mem = new Map<string, IdMappings>()

interface ArmIds {
  anilist?: number | null
  anidb?: number | null
  myanimelist?: number | null
  thetvdb?: number | null
  themoviedb?: number | null
}

interface AniZipEpisode {
  anidbEid?: number
  tvdbEid?: number
  tvdbShowId?: number
  episode?: string | number
  absoluteEpisodeNumber?: number
}

interface AniZipMappings {
  mappings?: {
    anilist_id?: number
    anidb_id?: number
    mal_id?: number
    thetvdb_id?: number
    themoviedb_id?: number
  }
  episodes?: Record<string, AniZipEpisode>
}

/**
 * Resolve AniList id → AniDB / TVDB / TMDB (+ episode-level eids when possible).
 * Uses arm.haglund.dev + api.ani.zip (personal sideload; best-effort).
 */
export async function resolveIds(anilistId: number, episode: number): Promise<IdMappings> {
  const key = `${anilistId}:${episode}`
  const cached = mem.get(key)
  if (cached) return cached

  if (typeof sessionStorage !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(`saizen:ids:${key}`)
      if (raw) {
        const parsed = JSON.parse(raw) as IdMappings
        mem.set(key, parsed)
        return parsed
      }
    } catch {
      /* ignore */
    }
  }

  const out: IdMappings = { anilist: anilistId }

  try {
    const arm = await saizenFetchJson<ArmIds>(
      `https://arm.haglund.dev/api/v2/ids?source=anilist&id=${anilistId}&include=anidb,myanimelist,thetvdb,themoviedb`
    )
    if (arm.anidb) {
      out.anidb = arm.anidb
      out.anidbAid = arm.anidb
    }
    if (arm.myanimelist) out.mal = arm.myanimelist
    if (arm.thetvdb) out.tvdb = arm.thetvdb
    if (arm.themoviedb) out.tmdb = arm.themoviedb
  } catch (e) {
    console.warn('[saizen] arm mapping failed', e)
  }

  try {
    const zip = await saizenFetchJson<AniZipMappings>(
      `https://api.ani.zip/mappings?anilist_id=${anilistId}`
    )
    const m = zip.mappings
    if (m?.anidb_id && !out.anidb) {
      out.anidb = m.anidb_id
      out.anidbAid = m.anidb_id
    }
    if (m?.mal_id && !out.mal) out.mal = m.mal_id
    if (m?.thetvdb_id && !out.tvdb) out.tvdb = m.thetvdb_id
    if (m?.themoviedb_id && !out.tmdb) out.tmdb = m.themoviedb_id

    const ep =
      zip.episodes?.[String(episode)] ??
      zip.episodes?.[episode.toString().padStart(2, '0')] ??
      Object.values(zip.episodes ?? {}).find(
        (e) => Number(e.episode) === episode || e.absoluteEpisodeNumber === episode
      )
    if (ep?.anidbEid) out.anidbEid = ep.anidbEid
    if (ep?.tvdbEid) out.tvdbEId = ep.tvdbEid
  } catch (e) {
    console.warn('[saizen] ani.zip mapping failed', e)
  }

  mem.set(key, out)
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem(`saizen:ids:${key}`, JSON.stringify(out))
    } catch {
      /* ignore quota */
    }
  }
  return out
}
