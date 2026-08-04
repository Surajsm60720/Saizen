import type { AnimeMedia, AnimeSearchFilters } from '@/lib/anilist'
import { DEFAULT_SEARCH_FILTERS } from '@/lib/anilist'

export type SearchSession = {
  term: string
  filters: AnimeSearchFilters
  results: AnimeMedia[]
  page: number
  hasNextPage: boolean
  error: string
  includeAdult: boolean
  anilistOn: boolean
  scrollY: number
}

/** Survives route unmounts so Search doesn't wipe results on back-nav. */
let memory: SearchSession | null = null

function emptySession(): SearchSession {
  return {
    term: '',
    filters: { ...DEFAULT_SEARCH_FILTERS, genres: [] },
    results: [],
    page: 1,
    hasNextPage: false,
    error: '',
    includeAdult: false,
    anilistOn: false,
    scrollY: 0
  }
}

export function readSearchSession(): SearchSession {
  if (memory) {
    return {
      ...memory,
      filters: { ...memory.filters, genres: [...memory.filters.genres] },
      results: memory.results
    }
  }
  return emptySession()
}

export function writeSearchSession(patch: Partial<SearchSession>): SearchSession {
  const base = memory ?? emptySession()
  memory = {
    ...base,
    ...patch,
    filters: patch.filters
      ? { ...patch.filters, genres: [...patch.filters.genres] }
      : { ...base.filters, genres: [...base.filters.genres] },
    results: patch.results ?? base.results
  }
  return readSearchSession()
}

export function clearSearchSession(): void {
  memory = null
}
