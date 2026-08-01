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
  format?: string | null
  status?: string | null
  startDate?: AnimeFuzzyDate | null
  endDate?: AnimeFuzzyDate | null
  title?: AnimeTitle
}

export interface AnimeRelationEdge {
  relationType?: string | null
  node?: AnimeRelationNode | null
}

export interface AnimeMedia {
  id: number
  idMal?: number | null
  episodes?: number | null
  status?: string | null
  format?: string | null
  averageScore?: number | null
  description?: string | null
  title: AnimeTitle
  coverImage?: AnimeCover | null
  seasonYear?: number | null
  genres?: string[] | null
  synonyms?: string[] | null
  isAdult?: boolean | null
  startDate?: AnimeFuzzyDate | null
  endDate?: AnimeFuzzyDate | null
  relations?: { edges?: AnimeRelationEdge[] | null } | null
}

const MEDIA_FIELDS = `
  id
  idMal
  episodes
  status
  format
  averageScore
  description
  seasonYear
  genres
  synonyms
  isAdult
  startDate { year month day }
  endDate { year month day }
  title { romaji english native userPreferred }
  coverImage { large medium }
  relations {
    edges {
      relationType
      node {
        id
        format
        status
        startDate { year month day }
        endDate { year month day }
        title { romaji english native userPreferred }
      }
    }
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

export async function fetchAnime(id: number): Promise<AnimeMedia | null> {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        ${MEDIA_FIELDS}
      }
    }
  `
  const result = await anilist.query(query, { id }).toPromise()
  if (result.error) throw result.error
  return (result.data?.Media ?? null) as AnimeMedia | null
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

export function displayTitle(media: AnimeMedia): string {
  return (
    media.title.userPreferred ||
    media.title.english ||
    media.title.romaji ||
    media.title.native ||
    `Anime #${media.id}`
  )
}

export function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}
