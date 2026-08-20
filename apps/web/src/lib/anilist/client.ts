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
  characters(page: 1, perPage: 25, sort: [ROLE, RELEVANCE, ID]) {
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
  staff(page: 1, perPage: 25, sort: [RELEVANCE, ID]) {
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

export type MediaFormat =
  | 'TV'
  | 'TV_SHORT'
  | 'MOVIE'
  | 'SPECIAL'
  | 'OVA'
  | 'ONA'
  | 'MUSIC'

export type MediaStatusFilter =
  | 'FINISHED'
  | 'RELEASING'
  | 'NOT_YET_RELEASED'
  | 'CANCELLED'
  | 'HIATUS'

export type MediaSortOption =
  | 'SEARCH_MATCH'
  | 'TRENDING_DESC'
  | 'POPULARITY_DESC'
  | 'SCORE_DESC'
  | 'START_DATE_DESC'
  | 'START_DATE'
  | 'TITLE_ROMAJI'
  | 'TITLE_ENGLISH'

/** Client-side only — applied after AniList results using the viewer list cache. */
export type ListMembershipFilter = 'any' | 'in' | 'out'

export type AnimeSearchFilters = {
  genres: string[]
  seasonYear: number | null
  season: AniSeason | null
  format: MediaFormat | null
  status: MediaStatusFilter | null
  sort: MediaSortOption
  listMembership: ListMembershipFilter
}

export const DEFAULT_SEARCH_FILTERS: AnimeSearchFilters = {
  genres: [],
  seasonYear: null,
  season: null,
  format: null,
  status: null,
  sort: 'SEARCH_MATCH',
  listMembership: 'any'
}

export const MEDIA_FORMAT_OPTIONS: Array<{ value: MediaFormat; label: string }> = [
  { value: 'TV', label: 'TV' },
  { value: 'TV_SHORT', label: 'TV Short' },
  { value: 'MOVIE', label: 'Movie' },
  { value: 'SPECIAL', label: 'Special' },
  { value: 'OVA', label: 'OVA' },
  { value: 'ONA', label: 'ONA' },
  { value: 'MUSIC', label: 'Music' }
]

export const MEDIA_STATUS_OPTIONS: Array<{ value: MediaStatusFilter; label: string }> = [
  { value: 'FINISHED', label: 'Finished' },
  { value: 'RELEASING', label: 'Releasing' },
  { value: 'NOT_YET_RELEASED', label: 'Not yet released' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'HIATUS', label: 'Hiatus' }
]

export const MEDIA_SORT_OPTIONS: Array<{ value: MediaSortOption; label: string }> = [
  { value: 'SEARCH_MATCH', label: 'Best match' },
  { value: 'TRENDING_DESC', label: 'Trending' },
  { value: 'POPULARITY_DESC', label: 'Popularity' },
  { value: 'SCORE_DESC', label: 'Score' },
  { value: 'START_DATE_DESC', label: 'Newest release' },
  { value: 'START_DATE', label: 'Oldest release' },
  { value: 'TITLE_ROMAJI', label: 'Title (romaji)' },
  { value: 'TITLE_ENGLISH', label: 'Title (English)' }
]

export const SEASON_OPTIONS: Array<{ value: AniSeason; label: string }> = [
  { value: 'WINTER', label: 'Winter' },
  { value: 'SPRING', label: 'Spring' },
  { value: 'SUMMER', label: 'Summer' },
  { value: 'FALL', label: 'Fall' }
]

export function searchYearOptions(now = new Date()): number[] {
  const max = now.getFullYear() + 1
  const years: number[] = []
  for (let y = max; y >= 1900; y--) years.push(y)
  return years
}

export function countActiveSearchFilters(f: AnimeSearchFilters): number {
  let n = 0
  if (f.genres.length) n += 1
  if (f.seasonYear != null) n += 1
  if (f.season) n += 1
  if (f.format) n += 1
  if (f.status) n += 1
  if (f.sort !== 'SEARCH_MATCH') n += 1
  if (f.listMembership !== 'any') n += 1
  return n
}

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

/**
 * Fetch AniList Media details without forcing the type (ANIME vs MANGA vs NOVEL).
 * Used for rendering “Source material” items fully in-app.
 */
export async function fetchMedia(id: number): Promise<AnimeMedia | null> {
  if (detailMemory.has(id)) return detailMemory.get(id)!

  const query = `
    query ($id: Int) {
      Media(id: $id) {
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

export type SearchAnimeOpts = {
  includeAdult?: boolean
  genres?: string[]
  season?: AniSeason | null
  seasonYear?: number | null
  format?: MediaFormat | null
  status?: MediaStatusFilter | null
  sort?: MediaSortOption | MediaSortOption[] | null
}

export type SearchAnimeResult = {
  media: AnimeMedia[]
  hasNextPage: boolean
  currentPage: number
}

let genreCache: string[] | null = null

/** AniList genre list for search filters (module-cached). */
export async function fetchAniListGenres(): Promise<string[]> {
  if (genreCache?.length) return genreCache
  const query = `
    query {
      GenreCollection
    }
  `
  const result = await anilist.query(query, {}).toPromise()
  if (result.error) throw result.error
  const list = (result.data?.GenreCollection ?? []) as string[]
  genreCache = list.filter((g) => typeof g === 'string' && g.length > 0).sort((a, b) => a.localeCompare(b))
  return genreCache
}

export async function searchAnime(
  term: string,
  page = 1,
  opts?: SearchAnimeOpts
): Promise<SearchAnimeResult> {
  const includeAdult = opts?.includeAdult === true
  const genres = (opts?.genres ?? []).filter(Boolean)
  const q = term.trim()

  const sortRaw = opts?.sort
  let sort: MediaSortOption[]
  if (Array.isArray(sortRaw) && sortRaw.length) {
    sort = sortRaw
  } else if (typeof sortRaw === 'string') {
    sort = [sortRaw]
  } else if (q) {
    sort = ['SEARCH_MATCH']
  } else {
    sort = ['POPULARITY_DESC']
  }
  // SEARCH_MATCH with no search string always returns [] on AniList.
  if (!q && sort.length === 1 && sort[0] === 'SEARCH_MATCH') {
    sort = ['POPULARITY_DESC']
  }

  // Only declare/pass filters that are set. Explicit `null` args (e.g. search: null)
  // make AniList return empty pages for many filter combos.
  const decls = ['$page: Int']
  const mediaArgs = ['type: ANIME']
  const variables: Record<string, unknown> = { page }

  const add = (name: string, gqlType: string, value: unknown) => {
    if (value === null || value === undefined) return
    if (Array.isArray(value) && value.length === 0) return
    decls.push(`$${name}: ${gqlType}`)
    mediaArgs.push(`${name}: $${name}`)
    variables[name] = value
  }

  add('search', 'String', q || null)
  add('genre_in', '[String]', genres.length ? genres : null)
  add('season', 'MediaSeason', opts?.season ?? null)
  add('seasonYear', 'Int', opts?.seasonYear ?? null)
  add('format', 'MediaFormat', opts?.format ?? null)
  add('status', 'MediaStatus', opts?.status ?? null)
  add('sort', '[MediaSort]', sort)
  // Omit isAdult when including adult — null/omitted returns both; false excludes adult.
  if (!includeAdult) add('isAdult', 'Boolean', false)

  const query = `
    query (${decls.join(', ')}) {
      Page(page: $page, perPage: 24) {
        pageInfo {
          hasNextPage
          currentPage
        }
        media(${mediaArgs.join(', ')}) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `

  const result = await anilist.query(query, variables).toPromise()
  if (result.error) throw result.error
  const pageData = result.data?.Page
  return {
    media: (pageData?.media ?? []) as AnimeMedia[],
    hasNextPage: Boolean(pageData?.pageInfo?.hasNextPage),
    currentPage: Number(pageData?.pageInfo?.currentPage ?? page)
  }
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

export interface CharacterMediaEdge {
  characterRole?: string | null
  node?: AnimeRelationNode | null
}

export interface AniCharacter {
  id: number
  name?: { full?: string | null; native?: string | null; alternative?: string[] | null } | null
  image?: { large?: string | null } | null
  description?: string | null
  gender?: string | null
  age?: string | null
  dateOfBirth?: AnimeFuzzyDate | null
  favourites?: number | null
  siteUrl?: string | null
  media?: { edges?: CharacterMediaEdge[] | null } | null
}

export interface StaffCharacterEdge {
  role?: string | null
  node?: {
    id: number
    name?: { full?: string | null } | null
    image?: { large?: string | null } | null
  } | null
  media?: AnimeRelationNode[] | null
}

export interface StaffMediaEdge {
  staffRole?: string | null
  node?: AnimeRelationNode | null
}

export interface AniStaff {
  id: number
  name?: { full?: string | null; native?: string | null; alternative?: string[] | null } | null
  image?: { large?: string | null } | null
  description?: string | null
  primaryOccupations?: string[] | null
  homeTown?: string | null
  yearsActive?: number[] | null
  dateOfBirth?: AnimeFuzzyDate | null
  favourites?: number | null
  siteUrl?: string | null
  characters?: { edges?: StaffCharacterEdge[] | null } | null
  staffMedia?: { edges?: StaffMediaEdge[] | null } | null
}

/** Slim media + one-hop relations for franchise BFS. */
export async function fetchMediaRelations(id: number): Promise<AnimeRelationNode & {
  relations?: { edges?: AnimeRelationEdge[] | null } | null
} | null> {
  const query = `
    query ($id: Int) {
      Media(id: $id) {
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
      }
    }
  `
  const result = await anilist.query(query, { id }).toPromise()
  if (result.error) throw result.error
  return (result.data?.Media ?? null) as
    | (AnimeRelationNode & { relations?: { edges?: AnimeRelationEdge[] | null } | null })
    | null
}

export async function fetchCharacter(id: number): Promise<AniCharacter | null> {
  const query = `
    query ($id: Int) {
      Character(id: $id) {
        id
        name { full native alternative }
        image { large }
        description(asHtml: true)
        gender
        age
        dateOfBirth { year month day }
        favourites
        siteUrl
        media(page: 1, perPage: 25, sort: [POPULARITY_DESC]) {
          edges {
            characterRole
            node {
              id
              type
              format
              status
              averageScore
              seasonYear
              title { romaji english native userPreferred }
              coverImage { large medium }
            }
          }
        }
      }
    }
  `
  const result = await anilist.query(query, { id }).toPromise()
  if (result.error) throw result.error
  return (result.data?.Character ?? null) as AniCharacter | null
}

export async function fetchStaff(id: number): Promise<AniStaff | null> {
  const query = `
    query ($id: Int) {
      Staff(id: $id) {
        id
        name { full native alternative }
        image { large }
        description(asHtml: true)
        primaryOccupations
        homeTown
        yearsActive
        dateOfBirth { year month day }
        favourites
        siteUrl
        characters(page: 1, perPage: 25, sort: [FAVOURITES_DESC]) {
          edges {
            role
            node {
              id
              name { full }
              image { large }
            }
            media {
              id
              type
              format
              seasonYear
              title { romaji english native userPreferred }
              coverImage { large medium }
            }
          }
        }
        staffMedia(page: 1, perPage: 25, sort: [START_DATE_DESC]) {
          edges {
            staffRole
            node {
              id
              type
              format
              status
              averageScore
              seasonYear
              title { romaji english native userPreferred }
              coverImage { large medium }
            }
          }
        }
      }
    }
  `
  const result = await anilist.query(query, { id }).toPromise()
  if (result.error) throw result.error
  return (result.data?.Staff ?? null) as AniStaff | null
}

