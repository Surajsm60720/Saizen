import type { AdultGenre } from '@saizen/shared'

/**
 * Canonical Adult genre/tag catalog scraped from the four NSFW sources
 * (hstream.moe tags[], hentaimama.io /genre/*, hentaihaven.com /tag/*,
 * haho.moe genre: search operators). Soft AniList tropes intentionally omitted.
 *
 * Excluded: CSAM-adjacent tags (loli / shota / shoutacon) and tech-only
 * quality chips (4K / 48fps / LQ).
 */
export const FALLBACK_ADULT_GENRES: string[] = [
  '3D',
  'Action',
  'Adventure',
  'Ahegao',
  'Anal',
  'Animal Girls',
  'BDSM',
  'Bestiality',
  'Big Boobs',
  'Blackmail',
  'Blonde',
  'Blow Job',
  'Bondage',
  'Boob Job',
  'Brainwashed',
  'Cat Girl',
  'Censored',
  'Comedy',
  'Condom',
  'Cosplay',
  'Creampie',
  'Cross-dressing',
  'Cute & Funny',
  'Dark Skin',
  'DeepThroat',
  'Demons',
  'Doctor',
  'Domination',
  'Double Penetration',
  'Drama',
  'Dubbed',
  'Ecchi',
  'Elf',
  'Facesitting',
  'Facial',
  'Family',
  'Fantasy',
  'Female Doctor',
  'Female Teacher',
  'Femdom',
  'Filmed',
  'Fisting',
  'Foot Job',
  'Furry',
  'Futanari',
  'Gangbang',
  'Glasses',
  'Gore',
  'Gyaru',
  'Hand Job',
  'Harem',
  'Historical',
  'Horny Slut',
  'Horror',
  'Housewife',
  'Humiliation',
  'Incest',
  'Inflation',
  'Internal Cumshot',
  'Lactation',
  'Large Breasts',
  'Magical Girls',
  'Maid',
  'Martial Arts',
  'Masturbation',
  'Megane',
  'MILF',
  'Mind Break',
  'Mind Control',
  'Molestation',
  'Monster',
  'Nekomimi',
  'Netorare',
  'Nipple Fuck',
  'Non-Japanese',
  'NTR',
  'Nuns',
  'Nurse',
  'Office Ladies',
  'Orc',
  'Orgy',
  'POV',
  'Pregnant',
  'Princess',
  'Public Sex',
  'Rape',
  'Reverse Rape',
  'Rimjob',
  'Romance',
  'Scat',
  'School Girl',
  'Sci-Fi',
  'Shimapan',
  'Small Boobs',
  'Softcore',
  'Sports',
  'Squirting',
  'Step Daughter',
  'Step Mother',
  'Step Sister',
  'Stocking',
  'Strap-on',
  'Succubus',
  'Super Power',
  'Supernatural',
  'Swim Suit',
  'Teacher',
  'Tentacle',
  'Threesome',
  'Toys',
  'Train Molestation',
  'Trap',
  'Tsundere',
  'Ugly Bastard',
  'Uncensored',
  'Urination',
  'Vampire',
  'Vanilla',
  'Virgin',
  'Watersports',
  'Widow',
  'Womb Tattoo',
  'X-Ray',
  'Yaoi',
  'Yuri'
]

/**
 * Home rails — same catalog labels for every Adult provider.
 * Hstream honors real `order=` sorts; other modules map these to the closest
 * listing they have (homepage / page 2 / views) so categories still appear.
 * Compound `order:X+tag:Y` is supported by hstream (and tag-fallback elsewhere).
 */
export const ADULT_HOME_RAILS: Array<{ title: string; query: string }> = [
  { title: 'Recently uploaded', query: 'order:recently-uploaded' },
  { title: 'New releases', query: 'order:recently-released' },
  { title: 'Most viewed', query: 'order:view-count' },
  { title: 'Uncensored', query: 'order:view-count+tag:uncensored' },
  { title: 'School Girl', query: 'School Girl' },
  { title: 'Yuri', query: 'Yuri' }
]

/** Genre-only subset (chips / legacy). */
export const ADULT_HOME_RAIL_GENRES: string[] = [
  'Uncensored',
  'School Girl',
  'Yuri',
  'Vanilla',
  'NTR'
]

export function adultHomeRailsForModule(
  _moduleId?: string | null
): Array<{ title: string; query: string }> {
  return ADULT_HOME_RAILS
}

export function adultHomeRailQueries(moduleId?: string | null): string[] {
  return adultHomeRailsForModule(moduleId).map((r) => r.query)
}

export function adultHomeRailTitles(moduleId?: string | null): string[] {
  return adultHomeRailsForModule(moduleId).map((r) => r.title)
}

export function adultHomeRailTitle(queryOrId: string): string {
  const key = queryOrId.trim()
  const hit = ADULT_HOME_RAILS.find(
    (r) =>
      r.query.toLowerCase() === key.toLowerCase() ||
      r.title.toLowerCase() === key.toLowerCase() ||
      r.query.toLowerCase() === `order:${key.toLowerCase()}`
  )
  if (hit) return hit.title
  // order:view-count+tag:uncensored → readable fallback
  const compound = key.match(/^order:[a-z0-9\-]+\+tag:([a-z0-9\-]+)$/i)
  if (compound) return compound[1].replace(/-/g, ' ')
  return key.replace(/^order:/i, '').replace(/\+tag:/i, ' · ').replace(/-/g, ' ')
}

export function normalizeAdultGenres(raw: AdultGenre[] | undefined | null): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  for (const g of raw ?? []) {
    const name = (g.name ?? g.id ?? '').toString().trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }
  return names
}

export function adultGenreCatalog(moduleGenres: AdultGenre[] | undefined | null): string[] {
  const fromModule = normalizeAdultGenres(moduleGenres)
  return fromModule.length > 0 ? fromModule : [...FALLBACK_ADULT_GENRES]
}

export function adultHomeRailGenres(moduleGenres: AdultGenre[] | undefined | null): string[] {
  const catalog = adultGenreCatalog(moduleGenres)
  const preferred = ADULT_HOME_RAIL_GENRES.filter((g) =>
    catalog.some((c) => c.toLowerCase() === g.toLowerCase())
  )
  if (preferred.length >= 3) return preferred.slice(0, 5)
  return catalog.slice(0, 5)
}

export type AdultSearchFilters = {
  genres: string[]
}

export const DEFAULT_ADULT_SEARCH_FILTERS: AdultSearchFilters = {
  genres: []
}

export function countAdultSearchFilters(f: AdultSearchFilters): number {
  return f.genres.length
}

/**
 * Modules treat an exact genre name (or `Name | Name`) as a tag browse.
 * Free-text stays first when present; genres append as `genre:Name` hints.
 */
export function buildAdultSearchQuery(term: string, filters: AdultSearchFilters): string {
  const text = term.trim()
  const genres = filters.genres.map((g) => g.trim()).filter(Boolean)
  if (!text && genres.length === 0) return ''
  if (!text && genres.length === 1) return genres[0]
  if (!text) return genres.join(' | ')
  if (genres.length === 0) return text
  return [text, ...genres.map((g) => `genre:${g}`)].join(' ').trim()
}
