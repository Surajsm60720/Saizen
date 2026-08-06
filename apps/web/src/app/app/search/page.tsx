'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { SlidersHorizontal, X } from 'lucide-react'
import {
  searchAnime,
  displayTitle,
  DEFAULT_SEARCH_FILTERS,
  countActiveSearchFilters,
  MEDIA_FORMAT_OPTIONS,
  MEDIA_SORT_OPTIONS,
  MEDIA_STATUS_OPTIONS,
  SEASON_OPTIONS,
  fetchViewerAnimeList,
  peekViewerListCache,
  type AnimeMedia,
  type AnimeSearchFilters
} from '@/lib/anilist'
import { isAnilistConnected } from '@/lib/auth/tokens'
import { ensureExtensions, hasAdultExtensionsEnabled } from '@/lib/extensions'
import { readSearchSession, writeSearchSession, consumePendingSearchPreset, mergeSearchFilters } from '@/lib/search/session'
import { PageHeader, PosterCard, PosterGrid, SearchFiltersSheet } from '@/components/saizen'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function applyListMembership(
  media: AnimeMedia[],
  membership: AnimeSearchFilters['listMembership']
): AnimeMedia[] {
  if (membership === 'any') return media
  const cached = peekViewerListCache()
  const ids = new Set((cached ?? []).map((e) => e.media.id))
  if (membership === 'in') return media.filter((m) => ids.has(m.id))
  return media.filter((m) => !ids.has(m.id))
}

function chipLabels(filters: AnimeSearchFilters): Array<{ key: string; label: string }> {
  const chips: Array<{ key: string; label: string }> = []
  for (const g of filters.genres) chips.push({ key: `genre:${g}`, label: g })
  if (filters.seasonYear != null) {
    chips.push({ key: 'year', label: String(filters.seasonYear) })
  }
  if (filters.season) {
    const s = SEASON_OPTIONS.find((o) => o.value === filters.season)
    chips.push({ key: 'season', label: s?.label ?? filters.season })
  }
  if (filters.format) {
    const f = MEDIA_FORMAT_OPTIONS.find((o) => o.value === filters.format)
    chips.push({ key: 'format', label: f?.label ?? filters.format })
  }
  if (filters.status) {
    const st = MEDIA_STATUS_OPTIONS.find((o) => o.value === filters.status)
    chips.push({ key: 'status', label: st?.label ?? filters.status })
  }
  if (filters.sort !== 'SEARCH_MATCH') {
    const so = MEDIA_SORT_OPTIONS.find((o) => o.value === filters.sort)
    chips.push({ key: 'sort', label: so?.label ?? filters.sort })
  }
  if (filters.listMembership === 'in') {
    chips.push({ key: 'list', label: 'In my list' })
  } else if (filters.listMembership === 'out') {
    chips.push({ key: 'list', label: 'Not in my list' })
  }
  return chips
}

function removeChip(filters: AnimeSearchFilters, key: string): AnimeSearchFilters {
  if (key.startsWith('genre:')) {
    const g = key.slice('genre:'.length)
    return { ...filters, genres: filters.genres.filter((x) => x !== g) }
  }
  if (key === 'year') return { ...filters, seasonYear: null }
  if (key === 'season') return { ...filters, season: null }
  if (key === 'format') return { ...filters, format: null }
  if (key === 'status') return { ...filters, status: null }
  if (key === 'sort') return { ...filters, sort: 'SEARCH_MATCH' }
  if (key === 'list') return { ...filters, listMembership: 'any' }
  return filters
}

export default function SearchPage() {
  const pathname = usePathname()
  const isActive = pathname.startsWith('/app/search')
  const boot = useRef(readSearchSession())
  const warmed = useRef(false)

  const [term, setTerm] = useState(boot.current.term)
  const [filters, setFilters] = useState<AnimeSearchFilters>(boot.current.filters)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [results, setResults] = useState<AnimeMedia[]>(boot.current.results)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(boot.current.error)
  const [includeAdult, setIncludeAdult] = useState(boot.current.includeAdult)
  const [anilistOn, setAnilistOn] = useState(boot.current.anilistOn)
  const [page, setPage] = useState(boot.current.page)
  const [hasNextPage, setHasNextPage] = useState(boot.current.hasNextPage)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeCount = countActiveSearchFilters(filters)
  const chips = useMemo(() => chipLabels(filters), [filters])

  // Persist session whenever meaningful state changes (survives keep-alive + remount).
  useEffect(() => {
    writeSearchSession({
      term,
      filters,
      results,
      page,
      hasNextPage,
      error,
      includeAdult,
      anilistOn
    })
  }, [term, filters, results, page, hasNextPage, error, includeAdult, anilistOn])

  // One-time warm: extensions + list cache. Skip heavy refetch on keep-alive revisits.
  useEffect(() => {
    if (warmed.current) return
    warmed.current = true
    void ensureExtensions().then(() => {
      const adult = hasAdultExtensionsEnabled()
      setIncludeAdult(adult)
      writeSearchSession({ includeAdult: adult })
    })
    void isAnilistConnected().then(async (on) => {
      setAnilistOn(on)
      writeSearchSession({ anilistOn: on })
      if (on && !peekViewerListCache()?.length) {
        try {
          await fetchViewerAnimeList(
            ['CURRENT', 'REPEATING', 'COMPLETED', 'PAUSED', 'PLANNING', 'DROPPED'],
            { force: false }
          )
        } catch {
          /* list filter still works with empty/stale cache */
        }
      }
    })
  }, [])

  // Dismiss keyboard on leave; never restore focus on return (tap to type).
  useEffect(() => {
    inputRef.current?.blur()
    if (!isActive) setSheetOpen(false)
  }, [isActive])

  // Dismiss keyboard when scrolling results (stops nav sitting on the keyboard).
  useEffect(() => {
    if (!isActive) return
    let lastY = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      if (Math.abs(y - lastY) < 12) return
      lastY = y
      const el = document.activeElement
      if (el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        el.blur()
      }
      writeSearchSession({ scrollY: y })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [isActive])

  const runSearch = useCallback(
    async (nextTerm: string, nextFilters: AnimeSearchFilters, pageNum = 1, append = false) => {
      const q = nextTerm.trim()
      const hasFilters = countActiveSearchFilters(nextFilters) > 0
      if (!q && !hasFilters) {
        setResults([])
        setHasNextPage(false)
        setPage(1)
        setError('')
        return
      }

      if (append) setLoadingMore(true)
      else setLoading(true)
      setError('')
      try {
        const out = await searchAnime(q, pageNum, {
          includeAdult,
          genres: nextFilters.genres,
          season: nextFilters.season,
          seasonYear: nextFilters.seasonYear,
          format: nextFilters.format,
          status: nextFilters.status,
          sort: nextFilters.sort
        })
        const filtered = applyListMembership(out.media, nextFilters.listMembership)
        setResults((prev) => (append ? [...prev, ...filtered] : filtered))
        setHasNextPage(out.hasNextPage)
        setPage(out.currentPage)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        if (!append) setResults([])
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [includeAdult]
  )

  // Home "View more" (and keep-alive revisits): apply one-shot filter preset.
  useEffect(() => {
    if (!isActive) return
    const preset = consumePendingSearchPreset()
    if (!preset) return
    const nextFilters = mergeSearchFilters(preset.filters)
    const nextTerm = preset.term ?? ''
    setTerm(nextTerm)
    setFilters(nextFilters)
    setResults([])
    setPage(1)
    setHasNextPage(false)
    setError('')
    writeSearchSession({
      term: nextTerm,
      filters: nextFilters,
      results: [],
      page: 1,
      hasNextPage: false,
      error: ''
    })
    void runSearch(nextTerm, nextFilters, 1, false)
  }, [isActive, runSearch])

  async function onSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    inputRef.current?.blur()
    await runSearch(term, filters, 1, false)
  }

  function onApplyFilters(next: AnimeSearchFilters) {
    setFilters(next)
    inputRef.current?.blur()
    void runSearch(term, next, 1, false)
  }

  function onRemoveChip(key: string) {
    const next = removeChip(filters, key)
    setFilters(next)
    void runSearch(term, next, 1, false)
  }

  function clearAllFilters() {
    const next = { ...DEFAULT_SEARCH_FILTERS, genres: [] as string[] }
    setFilters(next)
    void runSearch(term, next, 1, false)
  }

  function openAnime() {
    // Blur before route change so WKWebView doesn't keep the keyboard up mid-nav.
    inputRef.current?.blur()
    writeSearchSession({ scrollY: window.scrollY })
  }

  return (
    <>
      <PageHeader
        title="Search"
        description="Find anime by romaji, English, or native title — then narrow with filters."
        dense
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="relative mt-0.5 shrink-0 gap-1.5"
            onClick={() => setSheetOpen(true)}
            aria-label="Open filters"
          >
            <SlidersHorizontal className="size-3.5" />
            Filters
            {activeCount > 0 ? (
              <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                {activeCount}
              </span>
            ) : null}
          </Button>
        }
      />

      <form className="flex gap-2" onSubmit={(e) => void onSubmit(e)}>
        <Input
          ref={inputRef}
          className="min-h-11"
          placeholder="Romaji / English / Japanese title"
          value={term}
          enterKeyHint="search"
          autoFocus={false}
          onChange={(e) => setTerm(e.target.value)}
        />
        <Button type="submit" size="lg" className="min-h-11 px-5" disabled={loading}>
          {loading ? '…' : 'Search'}
        </Button>
      </form>

      {chips.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => onRemoveChip(c.key)}
              className="outline-none"
              aria-label={`Remove filter ${c.label}`}
            >
              <Badge
                variant="outline"
                className="gap-1 rounded-full border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] text-foreground"
              >
                {c.label}
                <X className="size-3 opacity-70" />
              </Badge>
            </button>
          ))}
          <button
            type="button"
            className="px-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            onClick={clearAllFilters}
          >
            Clear filters
          </button>
        </div>
      ) : null}

      {includeAdult ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Adult titles included (hentai extension enabled).
        </p>
      ) : null}

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      {!loading && results.length === 0 && (term.trim() || activeCount > 0) ? (
        <p className="mt-5 text-sm text-muted-foreground">No results for these filters.</p>
      ) : null}

      <PosterGrid className="mt-5">
        {results.map((media) => (
          <PosterCard
            key={media.id}
            size="sm"
            className="w-full min-w-0"
            href={`/app/anime/?id=${media.id}`}
            image={media.coverImage?.large}
            title={displayTitle(media)}
            score={media.averageScore}
            format={media.format}
            year={media.seasonYear}
            onNavigate={openAnime}
          />
        ))}
      </PosterGrid>

      {hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 px-6"
            disabled={loadingMore}
            onClick={() => void runSearch(term, filters, page + 1, true)}
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}

      <SearchFiltersSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        value={filters}
        onApply={onApplyFilters}
        listFilterEnabled={anilistOn}
      />
    </>
  )
}
