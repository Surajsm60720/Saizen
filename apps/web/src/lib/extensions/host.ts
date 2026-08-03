import type { AnimeMedia } from '@/lib/anilist'
import { resolveIds } from '@/lib/mappings/ids'
import type { ProviderResult } from '@/lib/providers/types'
import { saizenFetch } from './fetch'
import { getExtensionOptions, listEnabledExtensions, ensureExtensions, listExtensions } from './registry'
import { loadExtensionInstance } from './loader'
import { magnetFromInfoHash } from './trackers'
import type { ExtensionTorrentResult, LoadedExtension } from './types'

export interface ExtensionSearchQuery {
  media: AnimeMedia
  episode: number
  resolution?: string
  exclusions?: string[]
}

function guessResolution(title: string): string | undefined {
  const m = title.match(/\b(2160|1080|720|540|480)p\b/i)
  return m ? `${m[1]}p` : undefined
}

function normalizeResult(
  ext: LoadedExtension,
  raw: ExtensionTorrentResult
): ProviderResult | null {
  const title = raw.title || 'Unknown'
  const hash = raw.hash && raw.hash !== '?' && raw.hash !== '<redacted>' ? raw.hash : undefined
  const link = (raw.link ?? '').trim()

  let magnet: string | undefined
  let torrentUrl: string | undefined

  if (link.startsWith('magnet:')) {
    magnet = link
  } else if (hash) {
    // Prefer infohash → magnet (Nyaa/Sukebei RSS returns view-page URLs + hash).
    try {
      magnet = magnetFromInfoHash(hash, title)
    } catch {
      return null
    }
  } else if (/^https?:\/\//i.test(link)) {
    if (/\.torrent(\?|$)/i.test(link) || /\/download/i.test(link) || /torrent_url/i.test(link)) {
      torrentUrl = link
    } else {
      // Bare HTML tracker pages without a hash are not playable.
      torrentUrl = link
    }
  } else if (/^[a-fA-F0-9]{40}$/i.test(link) || /^[a-zA-Z0-9]{32}$/.test(link)) {
    // Seadex often puts infohash in `link`
    try {
      magnet = magnetFromInfoHash(link, title)
    } catch {
      return null
    }
  } else {
    return null
  }

  return {
    providerId: ext.manifest.id,
    providerName: ext.manifest.name,
    title,
    magnet,
    torrentUrl,
    size: raw.size,
    seeders: raw.seeders,
    leechers: raw.leechers,
    resolution: guessResolution(title),
    isBatch: raw.type === 'batch'
  }
}

export function rankScore(r: ProviderResult & { _best?: boolean }): number {
  let s = 0
  if (r._best) s += 10_000
  // Direct HTTP streams open ASAP via ProgressiveHTTP (no peer swarm).
  if (r.httpUrl) s += 5_500
  // Prefer .torrent metafiles (skip magnet metadata round-trip).
  if (r.torrentUrl) s += 3_500
  if (r.magnet) s += 400
  // Seeders dominate time-to-first-byte for torrents on mobile.
  s += Math.min(r.seeders ?? 0, 5000) * 2
  const res = r.resolution?.replace('p', '')
  // 720p starts faster than 1080/2160 on cellular; still allow tapping higher.
  if (res === '720') s += 120
  else if (res === '1080') s += 60
  else if (res === '480' || res === '540') s += 80
  else if (res === '2160') s += 20
  return s
}

/** Top-tier picks for mobile: direct HTTP, or torrent file + decent seeds. */
export function isLikelyFaster(r: ProviderResult, rankIndex: number): boolean {
  if (r.httpUrl) return true
  if (rankIndex < 3 && (r.torrentUrl || (r.seeders ?? 0) >= 20)) return true
  if (r.torrentUrl && (r.seeders ?? 0) >= 50) return true
  const res = r.resolution?.replace('p', '')
  return !!r.torrentUrl && res === '720' && (r.seeders ?? 0) >= 10
}

/** Route extension network through CapacitorHttp (many extensions call global fetch). */
async function withSaizenFetch<T>(fn: () => Promise<T>): Promise<T> {
  const g = globalThis as typeof globalThis & { fetch: typeof fetch }
  const prev = g.fetch
  g.fetch = saizenFetch as typeof fetch
  try {
    return await fn()
  } finally {
    g.fetch = prev
  }
}

export async function searchExtensions(query: ExtensionSearchQuery): Promise<{
  results: ProviderResult[]
  errors: Array<{ providerId: string; message: string }>
}> {
  await ensureExtensions()
  const enabled = listEnabledExtensions()
  const { media, episode } = query
  const titles = [
    media.title.romaji,
    media.title.english,
    media.title.native,
    media.title.userPreferred,
    ...(media.synonyms ?? [])
  ].filter(Boolean) as string[]

  const ids = await resolveIds(media.id, episode)
  const exclusions = query.exclusions ?? []
  const resolution = query.resolution

  const hostQuery: Record<string, unknown> = {
    anilistId: media.id,
    titles,
    title: titles[0],
    episode,
    episodeCount: media.episodes ?? undefined,
    resolution,
    exclusions,
    // Extensions (esp. Sukebei) assume genres/relations arrays exist.
    media: {
      ...media,
      title: media.title ?? {},
      genres: media.genres ?? [],
      synonyms: media.synonyms ?? [],
      isAdult: Boolean(media.isAdult),
      relations: media.relations ?? { edges: [] },
      status: media.status ?? null,
      format: media.format ?? null
    },
    anidbAid: ids.anidbAid ?? ids.anidb,
    anidbEid: ids.anidbEid,
    tvdbId: ids.tvdb,
    tvdbEId: ids.tvdbEId,
    tmdbId: ids.tmdb,
    absoluteEpisodeNumber: episode,
    fetch: saizenFetch
  }

  const errors: Array<{ providerId: string; message: string }> = []
  const annotated: Array<ProviderResult & { _best?: boolean }> = []

  await withSaizenFetch(async () => {
    await Promise.all(
      enabled.map(async (ext) => {
        try {
          const options = getExtensionOptions(ext.manifest.id)
          if (typeof ext.instance.single !== 'function') return
          // Must call on the instance — unbound `single` loses `this` (url/_fetch/_buildQuery).
          const raw = (await ext.instance.single(hostQuery, options)) ?? []
          for (const item of raw) {
            const n = normalizeResult(ext, item)
            if (n) {
              annotated.push({
                ...n,
                _best: item.type === 'best'
              })
            }
          }
        } catch (e) {
          errors.push({
            providerId: ext.manifest.id,
            message: e instanceof Error ? e.message : String(e)
          })
        }
      })
    )
  })

  annotated.sort((a, b) => rankScore(b) - rankScore(a))
  const results = annotated.map(({ _best: _, ...rest }) => rest)
  return { results, errors }
}

export async function testExtension(id: string): Promise<{ ok: boolean; message: string }> {
  await ensureExtensions()
  let ext = listExtensions().find((e) => e.manifest.id === id)
  if (!ext) return { ok: false, message: 'Extension not found' }

  try {
    if (typeof ext.instance.test !== 'function') {
      const instance = await loadExtensionInstance(ext.manifest)
      ext = { ...ext, instance, loadError: undefined }
    }
    if (typeof ext.instance.test !== 'function') return { ok: false, message: 'No test() method' }
    await withSaizenFetch(() => ext!.instance.test!.call(ext!.instance))
    return { ok: true, message: 'OK' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
