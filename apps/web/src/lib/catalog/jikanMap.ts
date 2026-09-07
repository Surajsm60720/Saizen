import type {
  AnimeMedia,
  AnimeRelationEdge,
  AnimeCharacterEdge,
  AnimeStaffEdge,
  AnimeRecommendation,
  AniCharacter,
  AniStaff,
  AniSeason
} from '@/lib/anilist/client'
import { canonicalMediaId } from './idMap'

type JikanImages = {
  jpg?: { image_url?: string; large_image_url?: string; small_image_url?: string }
  webp?: { image_url?: string; large_image_url?: string }
}

type JikanTitle = {
  type?: string
  title?: string
}

export type JikanAnime = {
  mal_id: number
  url?: string
  images?: JikanImages
  trailer?: { youtube_id?: string | null; url?: string | null; images?: { maximum_image_url?: string } }
  title?: string
  title_english?: string | null
  title_japanese?: string | null
  titles?: JikanTitle[]
  type?: string | null
  source?: string | null
  episodes?: number | null
  status?: string | null
  duration?: string | null
  rating?: string | null
  score?: number | null
  scored_by?: number | null
  rank?: number | null
  popularity?: number | null
  synopsis?: string | null
  season?: string | null
  year?: number | null
  broadcast?: { day?: string | null; time?: string | null; timezone?: string | null }
  producers?: Array<{ mal_id: number; name?: string }>
  studios?: Array<{ mal_id: number; name?: string }>
  genres?: Array<{ mal_id: number; name?: string }>
  themes?: Array<{ mal_id: number; name?: string }>
  demographics?: Array<{ mal_id: number; name?: string }>
  relations?: Array<{
    relation?: string
    entry?: Array<{ mal_id: number; type?: string; name?: string; url?: string }>
  }>
  theme?: { openings?: string[]; endings?: string[] }
  external?: Array<{ name?: string; url?: string }>
  streaming?: Array<{ name?: string; url?: string }>
}

function coverFromImages(images?: JikanImages) {
  const large =
    images?.jpg?.large_image_url ||
    images?.webp?.large_image_url ||
    images?.jpg?.image_url ||
    images?.webp?.image_url ||
    null
  const medium = images?.jpg?.image_url || images?.webp?.image_url || large
  return {
    extraLarge: large,
    large,
    medium,
    color: null as string | null
  }
}

function mapStatus(status?: string | null): string | null {
  if (!status) return null
  const s = status.toLowerCase()
  if (s.includes('currently') || s.includes('airing')) return 'RELEASING'
  if (s.includes('finished') || s.includes('complete')) return 'FINISHED'
  if (s.includes('not yet') || s.includes('upcoming')) return 'NOT_YET_RELEASED'
  if (s.includes('hiatus')) return 'HIATUS'
  if (s.includes('cancel')) return 'CANCELLED'
  return status.toUpperCase().replace(/\s+/g, '_')
}

function mapFormat(type?: string | null): string | null {
  if (!type) return null
  const t = type.toUpperCase().replace(/\s+/g, '_')
  if (t === 'TV') return 'TV'
  if (t === 'MOVIE') return 'MOVIE'
  if (t === 'OVA') return 'OVA'
  if (t === 'ONA') return 'ONA'
  if (t === 'SPECIAL') return 'SPECIAL'
  if (t === 'TV_SPECIAL') return 'SPECIAL'
  if (t === 'MUSIC') return 'MUSIC'
  return t
}

function mapSeason(season?: string | null): AniSeason | string | null {
  if (!season) return null
  const s = season.toUpperCase()
  if (s === 'WINTER' || s === 'SPRING' || s === 'SUMMER' || s === 'FALL') return s
  return s
}

function mapSource(source?: string | null): string | null {
  if (!source) return null
  return source.toUpperCase().replace(/\s+/g, '_')
}

function parseDurationMinutes(duration?: string | null): number | null {
  if (!duration) return null
  const m = duration.match(/(\d+)\s*min/i)
  return m ? Number(m[1]) : null
}

function relationType(rel?: string): string {
  const r = (rel || '').toLowerCase()
  if (r.includes('prequel')) return 'PREQUEL'
  if (r.includes('sequel')) return 'SEQUEL'
  if (r.includes('parent')) return 'PARENT'
  if (r.includes('side story')) return 'SIDE_STORY'
  if (r.includes('spin')) return 'SPIN_OFF'
  if (r.includes('alternative')) return 'ALTERNATIVE'
  if (r.includes('summary')) return 'SUMMARY'
  if (r.includes('character')) return 'CHARACTER'
  if (r.includes('other')) return 'OTHER'
  if (r.includes('adaptation')) return 'ADAPTATION'
  if (r.includes('full story') || r === 'source') return 'SOURCE'
  return (rel || 'OTHER').toUpperCase().replace(/\s+/g, '_')
}

export async function mapJikanAnime(
  a: JikanAnime,
  opts?: { anilistId?: number | null; includeRelations?: boolean }
): Promise<AnimeMedia> {
  const id = await canonicalMediaId(a.mal_id, opts?.anilistId)
  const genres = [
    ...(a.genres ?? []).map((g) => g.name).filter(Boolean),
    ...(a.themes ?? []).map((g) => g.name).filter(Boolean)
  ] as string[]

  const relations: { edges: AnimeRelationEdge[] } | undefined = opts?.includeRelations
    ? {
        edges: await mapRelations(a.relations ?? [])
      }
    : undefined

  const media: AnimeMedia = {
    id,
    idMal: a.mal_id,
    episodes: a.episodes ?? null,
    duration: parseDurationMinutes(a.duration),
    status: mapStatus(a.status),
    format: mapFormat(a.type),
    averageScore: a.score != null ? Math.round(a.score * 10) : null,
    meanScore: a.score != null ? Math.round(a.score * 10) : null,
    description: a.synopsis ?? null,
    title: {
      romaji: a.title ?? null,
      english: a.title_english ?? null,
      native: a.title_japanese ?? null,
      userPreferred: a.title_english || a.title || null
    },
    coverImage: coverFromImages(a.images),
    bannerImage: null,
    season: mapSeason(a.season),
    seasonYear: a.year ?? null,
    source: mapSource(a.source),
    genres,
    synonyms: (a.titles ?? [])
      .map((t) => t.title)
      .filter((t): t is string => Boolean(t)),
    isAdult: /rx|hentai/i.test(a.rating || ''),
    startDate: a.year ? { year: a.year, month: null, day: null } : null,
    endDate: null,
    trailer: a.trailer?.youtube_id
      ? {
          id: a.trailer.youtube_id,
          site: 'youtube',
          thumbnail: a.trailer.images?.maximum_image_url ?? null
        }
      : null,
    studios: {
      edges: (a.studios ?? []).map((s) => ({
        isMain: true,
        node: { id: s.mal_id, name: s.name ?? null }
      }))
    },
    nextAiringEpisode: null,
    // MAL `streaming` is platform links (Crunchyroll, Netflix, …) — NOT per-episode
    // titles. Leave empty; episode names come from Jikan/AniZip episode APIs.
    streamingEpisodes: [],
    relations
  }
  return media
}

async function mapRelations(
  relations: NonNullable<JikanAnime['relations']>
): Promise<AnimeRelationEdge[]> {
  const edges: AnimeRelationEdge[] = []
  for (const block of relations) {
    const rel = relationType(block.relation)
    for (const entry of block.entry ?? []) {
      if (!entry.mal_id) continue
      const type = (entry.type || '').toLowerCase()
      // Keep anime + manga-like for source materials
      const nodeType =
        type === 'manga' ? 'MANGA' : type === 'novel' ? 'MANGA' : type === 'anime' ? 'ANIME' : type.toUpperCase()
      const id = await canonicalMediaId(entry.mal_id)
      edges.push({
        relationType: rel,
        node: {
          id,
          type: nodeType || null,
          format: type === 'manga' ? 'MANGA' : type === 'novel' ? 'NOVEL' : null,
          status: null,
          averageScore: null,
          seasonYear: null,
          startDate: null,
          endDate: null,
          title: {
            romaji: entry.name ?? null,
            english: entry.name ?? null,
            native: null,
            userPreferred: entry.name ?? null
          },
          coverImage: null
        }
      })
    }
  }
  return edges
}

export async function mapJikanCharacters(
  rows: Array<{
    character?: {
      mal_id?: number
      name?: string
      images?: JikanImages
    }
    role?: string
    voice_actors?: Array<{
      person?: { mal_id?: number; name?: string; images?: JikanImages }
      language?: string
    }>
  }>
): Promise<AnimeCharacterEdge[]> {
  return rows.slice(0, 25).map((row) => {
    const c = row.character
    const vas = (row.voice_actors ?? [])
      .filter((v) => (v.language || '').toLowerCase() === 'japanese' || !v.language)
      .slice(0, 2)
    return {
      role: (row.role || 'SUPPORTING').toUpperCase(),
      node: c?.mal_id
        ? {
            id: c.mal_id,
            name: { full: c.name ?? null },
            image: { large: coverFromImages(c.images).large }
          }
        : null,
      voiceActors: vas.map((v) => ({
        id: v.person?.mal_id ?? 0,
        name: { full: v.person?.name ?? null },
        image: { large: coverFromImages(v.person?.images).large },
        languageV2: v.language ?? 'Japanese'
      }))
    }
  })
}

export async function mapJikanStaff(
  rows: Array<{
    person?: { mal_id?: number; name?: string; images?: JikanImages }
    positions?: string[]
  }>
): Promise<AnimeStaffEdge[]> {
  return rows.slice(0, 25).map((row) => ({
    role: row.positions?.[0] ?? null,
    node: row.person?.mal_id
      ? {
          id: row.person.mal_id,
          name: { full: row.person.name ?? null },
          image: { large: coverFromImages(row.person.images).large }
        }
      : null
  }))
}

export async function mapJikanRecommendations(
  rows: Array<{ entry?: JikanAnime }>
): Promise<AnimeRecommendation[]> {
  const out: AnimeRecommendation[] = []
  for (const row of rows.slice(0, 12)) {
    if (!row.entry?.mal_id) continue
    const media = await mapJikanAnime(row.entry)
    out.push({
      mediaRecommendation: {
        id: media.id,
        format: media.format,
        averageScore: media.averageScore,
        seasonYear: media.seasonYear,
        title: media.title,
        coverImage: media.coverImage
      }
    })
  }
  return out
}

export function mapJikanCharacterDetail(c: {
  mal_id: number
  name?: string
  name_kanji?: string | null
  nicknames?: string[]
  about?: string | null
  images?: JikanImages
  favorites?: number
  url?: string
  anime?: Array<{
    role?: string
    anime?: JikanAnime
  }>
}): AniCharacter {
  return {
    id: c.mal_id,
    name: {
      full: c.name ?? null,
      native: c.name_kanji ?? null,
      alternative: c.nicknames ?? null
    },
    image: { large: coverFromImages(c.images).large },
    description: c.about ?? null,
    gender: null,
    age: null,
    dateOfBirth: null,
    favourites: c.favorites ?? null,
    siteUrl: c.url ?? null,
    media: {
      edges: (c.anime ?? []).slice(0, 25).map((row) => ({
        characterRole: row.role ?? null,
        node: row.anime
          ? {
              id: row.anime.mal_id,
              type: 'ANIME',
              format: mapFormat(row.anime.type),
              status: mapStatus(row.anime.status),
              averageScore:
                row.anime.score != null ? Math.round(row.anime.score * 10) : null,
              seasonYear: row.anime.year ?? null,
              title: {
                romaji: row.anime.title ?? null,
                english: row.anime.title_english ?? null,
                native: row.anime.title_japanese ?? null,
                userPreferred: row.anime.title_english || row.anime.title || null
              },
              coverImage: coverFromImages(row.anime.images)
            }
          : null
      }))
    }
  }
}

export function mapJikanPersonDetail(p: {
  mal_id: number
  name?: string
  given_name?: string | null
  family_name?: string | null
  alternate_names?: string[]
  birthday?: string | null
  about?: string | null
  favorites?: number
  url?: string
  images?: JikanImages
  anime?: Array<{ position?: string; anime?: JikanAnime }>
  voices?: Array<{
    role?: string
    anime?: JikanAnime
    character?: { mal_id?: number; name?: string; images?: JikanImages }
  }>
}): AniStaff {
  const birthday = p.birthday ? new Date(p.birthday) : null
  return {
    id: p.mal_id,
    name: {
      full: p.name ?? null,
      native: [p.family_name, p.given_name].filter(Boolean).join(' ') || null,
      alternative: p.alternate_names ?? null
    },
    image: { large: coverFromImages(p.images).large },
    description: p.about ?? null,
    primaryOccupations: null,
    homeTown: null,
    yearsActive: null,
    dateOfBirth: birthday
      ? {
          year: birthday.getUTCFullYear(),
          month: birthday.getUTCMonth() + 1,
          day: birthday.getUTCDate()
        }
      : null,
    favourites: p.favorites ?? null,
    siteUrl: p.url ?? null,
    characters: {
      edges: (p.voices ?? []).slice(0, 25).map((v) => ({
        role: v.role ?? null,
        node: v.character?.mal_id
          ? {
              id: v.character.mal_id,
              name: { full: v.character.name ?? null },
              image: { large: coverFromImages(v.character.images).large }
            }
          : null,
        media: v.anime
          ? [
              {
                id: v.anime.mal_id,
                type: 'ANIME',
                format: mapFormat(v.anime.type),
                seasonYear: v.anime.year ?? null,
                title: {
                  romaji: v.anime.title ?? null,
                  english: v.anime.title_english ?? null,
                  native: v.anime.title_japanese ?? null,
                  userPreferred: v.anime.title_english || v.anime.title || null
                },
                coverImage: coverFromImages(v.anime.images)
              }
            ]
          : null
      }))
    },
    staffMedia: {
      edges: (p.anime ?? []).slice(0, 25).map((row) => ({
        staffRole: row.position ?? null,
        node: row.anime
          ? {
              id: row.anime.mal_id,
              type: 'ANIME',
              format: mapFormat(row.anime.type),
              status: mapStatus(row.anime.status),
              averageScore:
                row.anime.score != null ? Math.round(row.anime.score * 10) : null,
              seasonYear: row.anime.year ?? null,
              title: {
                romaji: row.anime.title ?? null,
                english: row.anime.title_english ?? null,
                native: row.anime.title_japanese ?? null,
                userPreferred: row.anime.title_english || row.anime.title || null
              },
              coverImage: coverFromImages(row.anime.images)
            }
          : null
      }))
    }
  }
}
