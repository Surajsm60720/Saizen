'use client'

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  DEFAULT_SEARCH_FILTERS,
  MEDIA_FORMAT_OPTIONS,
  MEDIA_SORT_OPTIONS,
  MEDIA_STATUS_OPTIONS,
  SEASON_OPTIONS,
  fetchAniListGenres,
  searchYearOptions,
  type AnimeSearchFilters,
  type AniSeason,
  type ListMembershipFilter,
  type MediaFormat,
  type MediaSortOption,
  type MediaStatusFilter
} from '@/lib/anilist'
import { cn } from '@/lib/utils'

const fieldClass =
  'h-10 w-full appearance-none rounded-lg border border-white/10 bg-[#1c1c1e] bg-[length:1rem] bg-[right_0.65rem_center] bg-no-repeat px-3 pr-9 text-sm text-foreground outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/25'

const selectChevron = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239a9a9a' stroke-width='2'%3E%3Cpath d='m7 15 5 5 5-5'/%3E%3Cpath d='m7 9 5-5 5 5'/%3E%3C/svg%3E\")"
} as const

const LIST_MEMBERSHIP_OPTIONS: Array<{ value: ListMembershipFilter; label: string }> = [
  { value: 'any', label: 'Any' },
  { value: 'in', label: 'In my list' },
  { value: 'out', label: 'Not in my list' }
]

function cloneFilters(f: AnimeSearchFilters): AnimeSearchFilters {
  return {
    ...f,
    genres: [...f.genres]
  }
}

export function SearchFiltersSheet({
  open,
  onOpenChange,
  value,
  onApply,
  listFilterEnabled = true
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: AnimeSearchFilters
  onApply: (next: AnimeSearchFilters) => void
  /** When false, hide / disable list membership (AniList not connected). */
  listFilterEnabled?: boolean
}) {
  const [draft, setDraft] = useState<AnimeSearchFilters>(() => cloneFilters(value))
  const [genres, setGenres] = useState<string[]>([])
  const [genresError, setGenresError] = useState('')
  const [genresLoading, setGenresLoading] = useState(false)
  const years = useMemo(() => searchYearOptions(), [])

  const availableGenres = useMemo(
    () => genres.filter((g) => !draft.genres.includes(g)),
    [genres, draft.genres]
  )

  useEffect(() => {
    if (!open) return
    setDraft(cloneFilters(value))
  }, [open, value])

  // Prefetch genres so the first sheet open isn't mid-load (and Year isn't the only control).
  useEffect(() => {
    let cancelled = false
    setGenresLoading(true)
    void fetchAniListGenres()
      .then((list) => {
        if (cancelled) return
        setGenres(list)
        setGenresError('')
      })
      .catch((e) => {
        if (cancelled) return
        setGenresError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setGenresLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function addGenre(g: string) {
    if (!g) return
    setDraft((prev) => {
      if (prev.genres.includes(g)) return prev
      return { ...prev, genres: [...prev.genres, g] }
    })
  }

  function removeGenre(g: string) {
    setDraft((prev) => ({
      ...prev,
      genres: prev.genres.filter((x) => x !== g)
    }))
  }

  function clearAll() {
    setDraft(cloneFilters(DEFAULT_SEARCH_FILTERS))
  }

  function apply() {
    const next = cloneFilters(draft)
    if (!listFilterEnabled) next.listMembership = 'any'
    onApply(next)
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[88dvh] overflow-y-auto rounded-t-2xl border-border/60 bg-card px-4 pb-[calc(1rem+var(--safe-bottom))] pt-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="mb-3 text-left">
          <SheetTitle className="text-section text-[1.2rem]">Filters</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Narrow results by genre, year, format, status, and more.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sf-genre" className="text-xs text-muted-foreground">
              Genre
            </Label>
            <select
              id="sf-genre"
              className={fieldClass}
              style={selectChevron}
              value=""
              disabled={genresLoading || Boolean(genresError)}
              onChange={(e) => {
                addGenre(e.target.value)
                e.target.value = ''
              }}
            >
              <option value="">
                {genresLoading
                  ? 'Loading genres…'
                  : genresError
                    ? 'Genres unavailable'
                    : availableGenres.length
                      ? 'Add a genre…'
                      : draft.genres.length
                        ? 'All genres selected'
                        : 'Any'}
              </option>
              {availableGenres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            {genresError ? (
              <p className="text-[11px] text-destructive">{genresError}</p>
            ) : null}
            {draft.genres.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {draft.genres.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => removeGenre(g)}
                    className="outline-none"
                    aria-label={`Remove genre ${g}`}
                  >
                    <Badge
                      variant="outline"
                      className="gap-1 rounded-full border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] text-foreground"
                    >
                      {g}
                      <X className="size-3 opacity-70" />
                    </Badge>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sf-year" className="text-xs text-muted-foreground">
                Year
              </Label>
              <select
                id="sf-year"
                className={fieldClass}
                style={selectChevron}
                value={draft.seasonYear ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  setDraft((p) => ({
                    ...p,
                    seasonYear: v ? Number(v) : null
                  }))
                }}
              >
                <option value="">Any</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sf-season" className="text-xs text-muted-foreground">
                Season
              </Label>
              <select
                id="sf-season"
                className={fieldClass}
                style={selectChevron}
                value={draft.season ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  setDraft((p) => ({
                    ...p,
                    season: (v || null) as AniSeason | null
                  }))
                }}
              >
                <option value="">Any</option>
                {SEASON_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sf-format" className="text-xs text-muted-foreground">
                Format
              </Label>
              <select
                id="sf-format"
                className={fieldClass}
                style={selectChevron}
                value={draft.format ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  setDraft((p) => ({
                    ...p,
                    format: (v || null) as MediaFormat | null
                  }))
                }}
              >
                <option value="">Any</option>
                {MEDIA_FORMAT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sf-status" className="text-xs text-muted-foreground">
                Status
              </Label>
              <select
                id="sf-status"
                className={fieldClass}
                style={selectChevron}
                value={draft.status ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  setDraft((p) => ({
                    ...p,
                    status: (v || null) as MediaStatusFilter | null
                  }))
                }}
              >
                <option value="">Any</option>
                {MEDIA_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sf-sort" className="text-xs text-muted-foreground">
              Sort
            </Label>
            <select
              id="sf-sort"
              className={fieldClass}
              style={selectChevron}
              value={draft.sort}
              onChange={(e) => {
                setDraft((p) => ({
                  ...p,
                  sort: e.target.value as MediaSortOption
                }))
              }}
            >
              {MEDIA_SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sf-list" className="text-xs text-muted-foreground">
              My list
            </Label>
            <select
              id="sf-list"
              className={cn(fieldClass, !listFilterEnabled && 'opacity-50')}
              style={selectChevron}
              value={listFilterEnabled ? draft.listMembership : 'any'}
              disabled={!listFilterEnabled}
              onChange={(e) => {
                setDraft((p) => ({
                  ...p,
                  listMembership: e.target.value as ListMembershipFilter
                }))
              }}
            >
              {LIST_MEMBERSHIP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {!listFilterEnabled ? (
              <p className="text-[11px] text-muted-foreground">
                Sign in with AniList in Settings to filter by list membership.
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 flex-1"
            onClick={clearAll}
          >
            Clear all
          </Button>
          <Button type="button" className="min-h-11 flex-1" onClick={apply}>
            Apply
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
