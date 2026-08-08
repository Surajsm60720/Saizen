'use client'

import { useMemo, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { EpisodeItem } from '@/components/saizen/EpisodeRow'
import type { DownloadQuality } from '@saizen/shared'
import { cn } from '@/lib/utils'

export type DownloadPickerMode = 'all' | 'range' | 'selected' | 'pick'

export function DownloadPickerSheet({
  open,
  onOpenChange,
  episodes,
  selectedNumbers,
  preferredQuality,
  onConfirm,
  busy
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  episodes: EpisodeItem[]
  selectedNumbers: number[]
  preferredQuality: DownloadQuality
  onConfirm: (episodes: EpisodeItem[]) => void
  busy?: boolean
}) {
  const aired = useMemo(() => episodes.filter((e) => !e.unreleased), [episodes])
  const maxEp = aired[aired.length - 1]?.number ?? 1
  const [mode, setMode] = useState<DownloadPickerMode>('all')
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(maxEp)
  const [picked, setPicked] = useState<Set<number>>(new Set())

  const preview = useMemo(() => {
    if (mode === 'all') return aired
    if (mode === 'selected') {
      const set = new Set(selectedNumbers)
      return aired.filter((e) => set.has(e.number))
    }
    if (mode === 'range') {
      const lo = Math.min(from, to)
      const hi = Math.max(from, to)
      return aired.filter((e) => e.number >= lo && e.number <= hi)
    }
    return aired.filter((e) => picked.has(e.number))
  }, [mode, aired, selectedNumbers, from, to, picked])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden rounded-t-2xl border-border/60 bg-background p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="shrink-0 border-b border-border/50 pb-3">
          <SheetTitle className="text-page-title pr-10">Download</SheetTitle>
          <SheetDescription>
            {preferredQuality} · auto-picks the best matching source per episode
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 pb-[calc(1rem+var(--safe-bottom))]">
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['all', 'All aired'],
                ['range', 'Episode range'],
                ['selected', `Selected (${selectedNumbers.length})`],
                ['pick', 'Pick episodes']
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={cn(
                  'rounded-xl border px-3 py-2.5 text-left text-sm font-medium',
                  mode === id
                    ? 'border-primary/50 bg-primary/10 text-foreground'
                    : 'border-border/60 bg-card text-muted-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'range' ? (
            <div className="mt-4 flex items-center gap-3">
              <label className="text-xs text-muted-foreground">
                From
                <input
                  type="number"
                  min={1}
                  max={maxEp}
                  value={from}
                  onChange={(e) => setFrom(Number(e.target.value) || 1)}
                  className="mt-1 block h-11 w-24 rounded-lg border border-border/60 bg-background px-2 py-1.5 text-base"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                To
                <input
                  type="number"
                  min={1}
                  max={maxEp}
                  value={to}
                  onChange={(e) => setTo(Number(e.target.value) || maxEp)}
                  className="mt-1 block h-11 w-24 rounded-lg border border-border/60 bg-background px-2 py-1.5 text-base"
                />
              </label>
            </div>
          ) : null}

          {mode === 'pick' ? (
            <ul className="mt-4 max-h-56 space-y-1 overflow-y-auto">
              {aired.map((ep) => {
                const on = picked.has(ep.number)
                return (
                  <li key={ep.number}>
                    <button
                      type="button"
                      onClick={() => {
                        setPicked((prev) => {
                          const next = new Set(prev)
                          if (next.has(ep.number)) next.delete(ep.number)
                          else next.add(ep.number)
                          return next
                        })
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm',
                        on ? 'border-primary/40 bg-primary/10' : 'border-transparent bg-muted/30'
                      )}
                    >
                      <span>
                        Ep {ep.number}
                        <span className="ml-2 text-muted-foreground">{ep.title}</span>
                      </span>
                      {on ? <Badge variant="secondary">On</Badge> : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : null}

          <p className="mt-4 text-sm text-muted-foreground">
            {preview.length} episode{preview.length === 1 ? '' : 's'} will be queued.
          </p>
          <Button
            className="mt-3 w-full min-h-11"
            disabled={busy || preview.length === 0}
            onClick={() => onConfirm(preview)}
          >
            {busy ? 'Queuing…' : `Download ${preview.length}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
