import { Client, cacheExchange, fetchExchange } from '@urql/core'

export const anilist = new Client({
  url: 'https://graphql.anilist.co',
  exchanges: [cacheExchange, fetchExchange]
})

export interface AnimeTitle {
  romaji?: string | null
  english?: string | null
  native?: string | null
  userPreferred?: string | null
}

export interface AnimeCover {
  large?: string | null
  medium?: string | null
}

export interface AnimeFuzzyDate {
  year?: number | null
  month?: number | null
  day?: number | null
}

export interface AnimeRelationNode {
  id: number
  type?: string | null
  format?: string | null
  status?: string | null
  averageScore?: number | null
  seasonYear?: number | null
  startDate?: AnimeFuzzyDate | null
  endDate?: AnimeFuzzyDate | null
  title?: AnimeTitle
  coverImage?: AnimeCover | null
}

export interface AnimeRelationEdge {
  relationType?: string | null
  node?: AnimeRelationNode | null
}

export interface AnimeStreamingEpisode {
  title?: string | null
  thumbnail?: string | null
  url?: string | null
  site?: string | null
}

export interface AnimeAiringSchedule {
  episode?: number | null
  airingAt?: number | null
  timeUntilAiring?: number | null
}

export interface AnimeStudioEdge {
  isMain?: boolean | null
  node?: { id: number; name?: string | null } | null
}

export interface AnimeTrailer {
  id?: string | null
  site?: string | null
  thumbnail?: string | null
}

export interface AnimeCharacterEdge {
  role?: string | null
  node?: {
    id: number
    name?: { full?: string | null } | null
    image?: { large?: string | null } | null
  } | null
  voiceActors?: Array<{
    id: number
    name?: { full?: string | null } | null
    image?: { large?: string | null } | null
    languageV2?: string | null
  } | null> | null
}

export interface AnimeStaffEdge {
  role?: string | null
  node?: {
    id: number
    name?: { full?: string | null } | null
    image?: { large?: string | null } | null
  } | null
}

export interface AnimeRecommendation {
  mediaRecommendation?: {
    id: number
    format?: string | null
    averageScore?: number | null
    seasonYear?: number | null
    title?: AnimeTitle
    coverImage?: AnimeCover | null
  } | null
}

export interface AnimeMedia {
  id: number
  idMal?: number | null
  episodes?: number | null
  duration?: number | null
  status?: string | null
  format?: string | null
  averageScore?: number | null
  meanScore?: number | null
  description?: string | null
  title: AnimeTitle
  coverImage?: AnimeCover | null
  bannerImage?: string | null
  season?: AniSeason | string | null
  seasonYear?: number | null
  source?: string | null
  genres?: string[] | null
  synonyms?: string[] | null
  isAdult?: boolean | null
  startDate?: AnimeFuzzyDate | null
  endDate?: AnimeFuzzyDate | null
  trailer?: AnimeTrailer | null
  studios?: { edges?: AnimeStudioEdge[] | null } | null
  characters?: { edges?: AnimeCharacterEdge[] | null } | null
  staff?: { edges?: AnimeStaffEdge[] | null } | null
  recommendations?: { nodes?: AnimeRecommendation[] | null } | null
  nextAiringEpisode?: AnimeAiringSchedule | null
  streamingEpisodes?: AnimeStreamingEpisode[] | null
  relations?: { edges?: AnimeRelationEdge[] | null } | null
}

/** Lean fields for rails / search — no cast/staff/themes-weight relations. */
const MEDIA_FIELDS = `
  id
  idMal
  episodes
  duration
  status
  format
  averageScore
  description
  season
  seasonYear
  genres
  synonyms
  isAdult
  bannerImage
  startDate { year month day }
  endDate { year month day }
  title { romaji english native userPreferred }
  coverImage { large medium }
`

const DETAIL_FIELDS = `
  ${MEDIA_FIELDS}
  meanScore
  source
  trailer { id site thumbnail }
  studios {
    edges {
      isMain
      node { id name }
    }
  }
  characters(page: 1, perPage: 12, sort: [ROLE, RELEVANCE, ID]) {
    edges {
      role
      node {
        id
        name { full }
        image { large }
      }
      voiceActors(language: JAPANESE, sort: [RELEVANCE]) {
        id
        name { full }
        image { large }
        languageV2
      }
    }
  }
  staff(page: 1, perPage: 12, sort: [RELEVANCE, ID]) {
    edges {
      role
      node {
        id
        name { full }
        image { large }
      }
    }
  }
  recommendations(page: 1, perPage: 12) {
    nodes {
      mediaRecommendation {
        id
        format
        averageScore
        seasonYear
        title { romaji english native userPreferred }
        coverImage { large medium }
      }
    }
  }
  relations {
    edges {
      relationType
      node {
        id
        type
        format
        status
        averageScore
        seasonYear
        startDate { year month day }
        endDate { year month day }
        title { romaji english native userPreferred }
        coverImage { large medium }
      }
    }
  }
  nextAiringEpisode {
    episode
    airingAt
    timeUntilAiring
  }
  streamingEpisodes {
    title
    thumbnail
    url
    site
  }
`

export async function fetchTrending(page = 1, perPage = 24): Promise<AnimeMedia[]> {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: TRENDING_DESC, isAdult: false) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `
  const result = await anilist.query(query, { page, perPage }).toPromise()
  if (result.error) throw result.error
  return (result.data?.Page?.media ?? []) as AnimeMedia[]
}

export async function fetchPopular(page = 1, perPage = 24): Promise<AnimeMedia[]> {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `
  const result = await anilist.query(query, { page, perPage }).toPromise()
  if (result.error) throw result.error
  return (result.data?.Page?.media ?? []) as AnimeMedia[]
}

export type AniSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL'

export function currentAniSeason(date = new Date()): { season: AniSeason; year: number } {
  const month = date.getMonth() + 1
  const year = date.getFullYear()
  if (month <= 3) return { season: 'WINTER', year }
  if (month <= 6) return { season: 'SPRING', year }
  if (month <= 9) return { season: 'SUMMER', year }
  return { season: 'FALL', year }
}

export async function fetchSeasonPopular(
  season?: AniSeason,
  year?: number,
  perPage = 24
): Promise<AnimeMedia[]> {
  const cur = currentAniSeason()
  const query = `
    query ($season: MediaSeason, $seasonYear: Int, $perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(
          type: ANIME
          season: $season
          seasonYear: $seasonYear
          sort: POPULARITY_DESC
          isAdult: false
        ) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `
  const result = await anilist
    .query(query, {
      season: season ?? cur.season,
      seasonYear: year ?? cur.year,
      perPage
    })
    .toPromise()
  if (result.error) throw result.error
  return (result.data?.Page?.media ?? []) as AnimeMedia[]
}

/** Highest-rated / all-time popular catalogue slice. */
export async function fetchAllTimePopular(page = 1, perPage = 24): Promise<AnimeMedia[]> {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: [SCORE_DESC, POPULARITY_DESC], isAdult: false) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `
  const result = await anilist.query(query, { page, perPage }).toPromise()
  if (result.error) throw result.error
  return (result.data?.Page?.media ?? []) as AnimeMedia[]
}

const detailMemory = new Map<number, AnimeMedia>()

export async function fetchAnime(id: number): Promise<AnimeMedia | null> {
  if (detailMemory.has(id)) return detailMemory.get(id)!

  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        ${DETAIL_FIELDS}
      }
    }
  `
  const result = await anilist.query(query, { id }).toPromise()
  if (result.error) throw result.error
  const media = (result.data?.Media ?? null) as AnimeMedia | null
  if (media) detailMemory.set(id, media)
  // Bound memory for long sessions
  if (detailMemory.size > 40) {
    const first = detailMemory.keys().next().value
    if (first != null) detailMemory.delete(first)
  }
  return media
}

export async function searchAnime(
  term: string,
  page = 1,
  opts?: { includeAdult?: boolean }
): Promise<AnimeMedia[]> {
  const includeAdult = opts?.includeAdult === true
  const query = `
    query ($page: Int, $search: String) {
      Page(page: $page, perPage: 24) {
        media(type: ANIME, search: $search, sort: SEARCH_MATCH${includeAdult ? '' : ', isAdult: false'}) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `
  const result = await anilist.query(query, { page, search: term }).toPromise()
  if (result.error) throw result.error
  return (result.data?.Page?.media ?? []) as AnimeMedia[]
}

export function displayTitle(media: {
  id: number
  title?: AnimeTitle | null
}): string {
  const t = media.title
  return (
    t?.userPreferred ||
    t?.english ||
    t?.romaji ||
    t?.native ||
    `Anime #${media.id}`
  )
}

export function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function formatSource(source?: string | null): string | undefined {
  if (!source) return undefined
  return source
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function mainStudioName(media: AnimeMedia): string | undefined {
  const edges = media.studios?.edges ?? []
  const main = edges.find((e) => e?.isMain)?.node?.name
  if (main) return main
  return edges.find((e) => e?.node?.name)?.node?.name ?? undefined
}

export function trailerWatchUrl(trailer?: AnimeTrailer | null): string | null {
  if (!trailer?.id) return null
  const site = (trailer.site || '').toLowerCase()
  if (site === 'youtube') return `https://www.youtube.com/watch?v=${trailer.id}`
  if (site === 'dailymotion') return `https://www.dailymotion.com/video/${trailer.id}`
  return null
}
