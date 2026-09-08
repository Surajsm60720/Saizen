'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { SlidersHorizontal, X } from 'lucide-react'
import type { AdultSearchHit } from '@saizen/shared'
import {
  AdultModeGate,
  AdultSearchFiltersSheet,
  PageHeader,
  PosterCard,
  PosterGrid
} from '@/components/saizen'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getNative } from '@/lib/native'
import { whenBridgeReady } from '@/lib/native/ready'
import { getAdultPrimaryModuleId, isAdultModeOn, subscribeAdultMode } from '@/lib/privacy/adult'
import {
  adultHitImage,
  adultHitTitle,
  adultHitUrl,
  adultTitleHref
} from '@/lib/adult/hits'
import {
  adultGenreCatalog,
  ADULT_HOME_RAIL_GENRES,
  buildAdultSearchQuery,
  countAdultSearchFilters,
  DEFAULT_ADULT_SEARCH_FILTERS,
  type AdultSearchFilters
} from '@/lib/adult/genres'
import { readAdultHomeSnapshot } from '@/lib/adult/homeStore'

function AdultSearchInner() {
  const params = useSearchParams()
  const bootQ = params.get('q')?.trim() ?? ''
  const bootGenre = params.get('genre')?.trim() ?? ''

  const [term, setTerm] = useState(bootQ)
  const [filters, setFilters] = useState<AdultSearchFilters>(() =>
    bootGenre
      ? { genres: [bootGenre] }
      : { ...DEFAULT_ADULT_SEARCH_FILTERS, genres: [] }
  )
  const [sheetOpen, setSheetOpen] = useState(false)
  const [results, setResults] = useState<AdultSearchHit[]>([])
  const [genreOptions, setGenreOptions] = useState<string[]>(() =>
    adultGenreCatalog(readAdultHomeSnapshot().genres)
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [moduleId, setModuleId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const didAutoSearch = useRef(false)

  const activeCount = countAdultSearchFilters(filters)
  const chips = useMemo(
    () => filters.genres.map((g) => ({ key: `genre:${g}`, label: g })),
    [filters.genres]
  )
  const quickGenres = useMemo(() => {
    const catalog = genreOptions.length ? genreOptions : ADULT_HOME_RAIL_GENRES
    return ADULT_HOME_RAIL_GENRES.filter((g) =>
      catalog.some((c) => c.toLowerCase() === g.toLowerCase())
    ).slice(0, 8)
  }, [genreOptions])

  const refreshMeta = useCallback(async () => {
    if (!isAdultModeOn()) return
    await whenBridgeReady()
    const id = getAdultPrimaryModuleId()
    setModuleId(id)
    const cached = readAdultHomeSnapshot().genres
    if (cached.length) {
      setGenreOptions(adultGenreCatalog(cached))
      return
    }
    const native = getNative()
    if (!id || !native.browseAdultHome) {
      setGenreOptions(adultGenreCatalog(null))
      return
    }
    try {
      const { genres } = await native.browseAdultHome({
        moduleId: id,
        allowNsfw: true
      })
      setGenreOptions(adultGenreCatalog(genres))
    } catch {
      setGenreOptions(adultGenreCatalog(null))
    }
  }, [])

  const runSearch = useCallback(
    async (nextTerm: string, nextFilters: AdultSearchFilters) => {
      const query = buildAdultSearchQuery(nextTerm, nextFilters)
      if (!query) {
        setResults([])
        return
      }
      const id = getAdultPrimaryModuleId()
      if (!id) {
        setError('Pick a primary NSFW module in Adult settings')
        return
      }
      const native = getNative()
      if (!native.searchAdult) {
        setError('Adult search requires the iOS app')
        return
      }
      setLoading(true)
      setError('')
      setModuleId(id)
      try {
        await whenBridgeReady()
        let hits: AdultSearchHit[] = []
        const { results: first } = await native.searchAdult({
          moduleId: id,
          query,
          allowNsfw: true
        })
        hits = Array.isArray(first) ? first : []
        // Genre-only: if title-search modules return nothing, retry with genre: hint
        // (haho) and exact tag browse already covered by updated modules.
        if (
          hits.length === 0 &&
          !nextTerm.trim() &&
          nextFilters.genres.length === 1 &&
          !/^genre:/i.test(query)
        ) {
          const { results: second } = await native.searchAdult({
            moduleId: id,
            query: `genre:${nextFilters.genres[0]}`,
            allowNsfw: true
          })
          hits = Array.isArray(second) ? second : []
        }
        setResults(hits)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setResults([])
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    void refreshMeta()
    return subscribeAdultMode((on) => {
      if (on) void refreshMeta()
    })
  }, [refreshMeta])

  useEffect(() => {
    if (didAutoSearch.current) return
    const query = buildAdultSearchQuery(term, filters)
    if (!query) return
    didAutoSearch.current = true
    void runSearch(term, filters)
  }, [term, filters, runSearch])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    inputRef.current?.blur()
    void runSearch(term, filters)
  }

  function onRemoveChip(key: string) {
    if (!key.startsWith('genre:')) return
    const g = key.slice('genre:'.length)
    const next = { genres: filters.genres.filter((x) => x !== g) }
    setFilters(next)
    void runSearch(term, next)
  }

  function clearAllFilters() {
    const next = { ...DEFAULT_ADULT_SEARCH_FILTERS, genres: [] as string[] }
    setFilters(next)
    void runSearch(term, next)
  }

  function applyQuickGenre(g: string) {
    const next = { genres: [g] }
    setFilters(next)
    void runSearch(term, next)
  }

  return (
    <AdultModeGate>
      <PageHeader
        title="Adult search"
        description="Primary NSFW module only — main Search stays SFW."
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

      <form className="flex gap-2.5" onSubmit={onSubmit}>
        <Input
          ref={inputRef}
          className="min-h-11"
          placeholder="Title or keyword…"
          value={term}
          enterKeyHint="search"
          autoFocus={false}
          onChange={(e) => setTerm(e.target.value)}
        />
        <Button type="submit" size="lg" className="min-h-11 px-5" disabled={loading}>
          {loading ? '…' : 'Search'}
        </Button>
      </form>

      {chips.length === 0 && quickGenres.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {quickGenres.map((g) => (
            <button key={g} type="button" onClick={() => applyQuickGenre(g)}>
              <Badge
                variant="outline"
                className="rounded-full border-border/60 px-2.5 py-1 text-[11px] hover:border-primary/40"
              >
                {g}
              </Badge>
            </button>
          ))}
          <button type="button" onClick={() => setSheetOpen(true)}>
            <Badge
              variant="outline"
              className="rounded-full border-dashed border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
            >
              More tags…
            </Badge>
          </button>
        </div>
      ) : null}

      {chips.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
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

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      {!loading && results.length === 0 && (term.trim() || activeCount > 0) ? (
        <p className="mt-6 text-sm text-muted-foreground">No results for these filters.</p>
      ) : null}

      {!loading && results.length === 0 && !term.trim() && activeCount === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Search a title, tap a genre chip, or open Filters for the full tag list.
        </p>
      ) : null}

      <PosterGrid className="mt-6">
        {results.map((hit, i) => {
          const url = adultHitUrl(hit)
          if (!url || !moduleId) return null
          const title = adultHitTitle(hit)
          return (
            <PosterCard
              key={`${url}-${i}`}
              size="lg"
              className="w-full min-w-0"
              href={adultTitleHref(moduleId, url, title, adultHitImage(hit))}
              image={adultHitImage(hit)}
              title={title}
            />
          )
        })}
      </PosterGrid>

      <AdultSearchFiltersSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        value={filters}
        genreOptions={genreOptions}
        onApply={(next) => {
          setFilters(next)
          didAutoSearch.current = true
          void runSearch(term, next)
        }}
      />
    </AdultModeGate>
  )
}

export default function AdultSearchPage() {
  return (
    <Suspense
      fallback={
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</div>
      }
    >
      <AdultSearchInner />
    </Suspense>
  )
}
