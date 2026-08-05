import { displayTitle, type AnimeMedia } from '@/lib/anilist'
import { searchExtensions, rankScore } from '@/lib/extensions'
import { searchAllProviders, type ProviderResult } from '@/lib/providers'
import type { DownloadQuality } from '@saizen/shared'

export async function searchEpisodeSources(
  media: AnimeMedia,
  episode: number
): Promise<ProviderResult[]> {
  const titles = [
    media.title.romaji,
    media.title.english,
    media.title.native,
    media.title.userPreferred
  ].filter(Boolean) as string[]
  const adult =
    Boolean(media.isAdult) || (media.genres ?? []).some((g) => /hentai/i.test(g || ''))
  const [extOut, builtInOut] = await Promise.all([
    searchExtensions({ media, episode }),
    adult
      ? Promise.resolve({ results: [] as ProviderResult[], errors: [] })
      : searchAllProviders({
          anilistId: media.id,
          title: displayTitle(media),
          titles,
          episode,
          episodeCount: media.episodes
        })
  ])
  return [...extOut.results, ...builtInOut.results].sort((a, b) => rankScore(b) - rankScore(a))
}

export function pickSourceForQuality(
  results: ProviderResult[],
  preferred: DownloadQuality
): ProviderResult | null {
  if (!results.length) return null
  const want = preferred.replace('p', '')
  const matching = results.filter((r) => (r.resolution || '').replace('p', '') === want)
  const pool = matching.length ? matching : results
  return [...pool].sort((a, b) => rankScore(b) - rankScore(a))[0] ?? null
}

export function sourceUrl(result: ProviderResult): string | null {
  return result.httpUrl || result.torrentUrl || result.magnet || null
}
