import { displayTitle, type AnimeMedia } from '@/lib/anilist'

export function seasonFolderLabel(media: AnimeMedia): string {
  const format = (media.format || '').toUpperCase()
  if (format === 'MOVIE') return 'Movie'
  const title = displayTitle(media)
  const numbered =
    title.match(/season\s*(\d+)/i) || title.match(/(\d+)(?:st|nd|rd|th)\s*season/i)
  if (numbered?.[1]) return `Season ${Number(numbered[1])}`
  return 'Season 1'
}
