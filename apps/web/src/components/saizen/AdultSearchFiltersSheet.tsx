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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  DEFAULT_ADULT_SEARCH_FILTERS,
  type AdultSearchFilters
} from '@/lib/adult/genres'
import { cn } from '@/lib/utils'

function cloneFilters(f: AdultSearchFilters): AdultSearchFilters {
  return { genres: [...f.genres] }
}

export function AdultSearchFiltersSheet({
  open,
  onOpenChange,
  value,
  onApply,
  genreOptions
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: AdultSearchFilters
  onApply: (next: AdultSearchFilters) => void
  genreOptions: string[]
}) {
  const [draft, setDraft] = useState<AdultSearchFilters>(() => cloneFilters(value))
  const [genreQuery, setGenreQuery] = useState('')

  useEffect(() => {
    if (!open) return
    setDraft(cloneFilters(value))
    setGenreQuery('')
  }, [open, value])

  const available = useMemo(() => {
    const q = genreQuery.trim().toLowerCase()
    return genreOptions.filter((g) => {
      if (draft.genres.includes(g)) return false
      if (!q) return true
      return g.toLowerCase().includes(q)
    })
  }, [genreOptions, draft.genres, genreQuery])

  function toggleGenre(g: string) {
    setDraft((prev) => {
      if (prev.genres.includes(g)) {
        return { genres: prev.genres.filter((x) => x !== g) }
      }
      return { genres: [...prev.genres, g] }
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>
            Tags from your primary source’s genre list. Combined with search text when you apply.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 overflow-y-auto px-4 pb-[calc(1rem+var(--safe-bottom))]">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Selected</Label>
            {draft.genres.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet — tap genres below.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {draft.genres.map((g) => (
                  <button key={g} type="button" onClick={() => toggleGenre(g)}>
                    <Badge
                      variant="outline"
                      className="gap-1 rounded-full border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px]"
                    >
                      {g}
                      <X className="size-3 opacity-70" />
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Genres ({genreOptions.length})
            </Label>
            <Input
              value={genreQuery}
              onChange={(e) => setGenreQuery(e.target.value)}
              placeholder="Find a tag…"
              className="min-h-11"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <div className="flex max-h-[40dvh] flex-wrap gap-1.5 overflow-y-auto">
              {available.map((g) => (
                <button key={g} type="button" onClick={() => toggleGenre(g)}>
                  <Badge
                    variant="outline"
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[11px]',
                      'border-border/60 hover:border-primary/40'
                    )}
                  >
                    {g}
                  </Badge>
                </button>
              ))}
              {available.length === 0 && draft.genres.length > 0 && !genreQuery ? (
                <p className="text-sm text-muted-foreground">All listed genres are selected.</p>
              ) : null}
              {available.length === 0 && genreQuery ? (
                <p className="text-sm text-muted-foreground">No tags match “{genreQuery.trim()}”.</p>
              ) : null}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 flex-1"
              onClick={() => setDraft(cloneFilters(DEFAULT_ADULT_SEARCH_FILTERS))}
            >
              Clear
            </Button>
            <Button
              type="button"
              className="min-h-11 flex-1"
              onClick={() => {
                onApply(cloneFilters(draft))
                onOpenChange(false)
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
