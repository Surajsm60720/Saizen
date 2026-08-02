'use client'

import { useEffect, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { SourceList, SourceRow } from '@/components/saizen/SourceRow'
import type { EpisodeItem } from '@/components/saizen/EpisodeRow'
import type { ProviderResult } from '@/lib/providers'
import { isLikelyFaster } from '@/lib/extensions'

export function EpisodeSourcesSheet({
  open,
  onOpenChange,
  episode,
  durationMin,
  searching,
  status,
  results,
  playing,
  onPlay
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  episode: EpisodeItem | null
  malId?: number | null
  durationMin?: number | null
  searching: boolean
  status: string
  results: ProviderResult[]
  playing: boolean
  onPlay: (result: ProviderResult) => void
}) {
  // Keep hooks stable; synopsis already on episode from AniZip/Jikan merge
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  const title = episode?.title || 'Episode'
  const synopsis = episode?.synopsis || ''
  const durationLabel =
    episode?.meta?.match(/\d+\s*min/)?.[0] ||
    (durationMin ? `${durationMin} min` : null)

  if (!mounted) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="pointer-events-auto flex max-h-[88dvh] flex-col gap-0 overflow-hidden rounded-t-2xl border-border/60 bg-background p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="shrink-0 border-b border-border/50 pb-3">
          <SheetTitle className="font-heading pr-10 text-xl tracking-tight">
            {episode ? `Episode ${episode.number}` : 'Episode'}
          </SheetTitle>
          <SheetDescription className="line-clamp-2 text-foreground/90">
            {title}
          </SheetDescription>
        </SheetHeader>

        {/* Native overflow — Radix ScrollArea often eats touch events on iOS WKWebView */}
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+var(--safe-bottom))] [-webkit-overflow-scrolling:touch]"
          data-vaul-no-drag
        >
          {episode ? (
            <div className="space-y-4 pt-3">
              <div className="flex gap-3">
                <div className="relative h-24 w-40 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {episode.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={episode.thumbnail}
                      alt=""
                      className="size-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
                      Ep {episode.number}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {durationLabel ? <Badge variant="secondary">{durationLabel}</Badge> : null}
                  </div>
                  {synopsis ? (
                    <p className="text-xs leading-relaxed text-muted-foreground line-clamp-5">
                      {synopsis}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No synopsis available for this episode yet.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold">Sources</h3>
                {status ? (
                  <p className="mb-2 rounded-lg border border-border/50 bg-muted/40 px-3 py-2 text-xs">
                    {status}
                  </p>
                ) : null}
                {searching && results.length === 0 ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full rounded-xl" />
                    ))}
                  </div>
                ) : results.length > 0 ? (
                  <SourceList>
                    {results.map((r, i) => (
                      <SourceRow
                        key={`${r.providerName}-${r.title}-${i}`}
                        result={r}
                        likelyFaster={isLikelyFaster(r, i)}
                        playing={playing}
                        onPlay={() => onPlay(r)}
                      />
                    ))}
                  </SourceList>
                ) : !searching ? (
                  <p className="text-sm text-muted-foreground">No sources found.</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
