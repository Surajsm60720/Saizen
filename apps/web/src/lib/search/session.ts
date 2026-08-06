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

export type PendingSearchPreset = {
  filters: Partial<AnimeSearchFilters>
  term?: string
}

/** Survives route unmounts so Search doesn't wipe results on back-nav. */
let memory: SearchSession | null = null

/** One-shot handoff from Home "View more" → Search. */
let pendingPreset: PendingSearchPreset | null = null

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

export function setPendingSearchPreset(preset: PendingSearchPreset): void {
  pendingPreset = {
    filters: {
      ...preset.filters,
      genres: preset.filters.genres ? [...preset.filters.genres] : undefined
    },
    term: preset.term
  }
}

export function consumePendingSearchPreset(): PendingSearchPreset | null {
  const next = pendingPreset
  pendingPreset = null
  if (!next) return null
  return {
    filters: {
      ...next.filters,
      genres: next.filters.genres ? [...next.filters.genres] : undefined
    },
    term: next.term
  }
}

export function mergeSearchFilters(
  partial: Partial<AnimeSearchFilters>
): AnimeSearchFilters {
  return {
    ...DEFAULT_SEARCH_FILTERS,
    ...partial,
    genres: [...(partial.genres ?? [])]
  }
}
