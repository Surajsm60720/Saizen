'use client'

import { useEffect, useState } from 'react'
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
import { fetchViewerListEntry, type AnimeMedia } from '@/lib/anilist'
import {
  syncDeleteListEntry,
  syncListEntry,
  type AniListStatus
} from '@/lib/auth/sync'
import { cn } from '@/lib/utils'

const STATUSES: Array<{ value: AniListStatus; label: string }> = [
  { value: 'CURRENT', label: 'Watching' },
  { value: 'PLANNING', label: 'Plan to watch' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'PAUSED', label: 'On hold' },
  { value: 'DROPPED', label: 'Dropped' },
  { value: 'REPEATING', label: 'Rewatching' }
]

const fieldClass =
  'h-11 w-full rounded-lg border border-white/10 bg-[#1c1c1e] px-3 text-base text-foreground outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/25'

export type ListEditValues = {
  entryId: number | null
  status: AniListStatus
  score: number
  progress: number
  repeat: number
}

function toValues(entry: {
  id: number
  status: string
  progress: number
  score: number
  repeat: number
}): ListEditValues {
  return {
    entryId: entry.id,
    status: (entry.status as AniListStatus) || 'CURRENT',
    score: entry.score ?? 0,
    progress: entry.progress ?? 0,
    repeat: entry.repeat ?? 0
  }
}

export function ListEditSheet({
  open,
  onOpenChange,
  mediaId,
  idMal,
  totalEpisodes,
  media,
  hint,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mediaId: number
  idMal?: number | null
  totalEpisodes?: number | null
  /** Used to seed cache after first add */
  media?: AnimeMedia | null
  /** Best-known values from the anime page (never invent PLANNING here) */
  hint?: ListEditValues | null
  onSaved: (next: ListEditValues | null) => void
}) {
  const [status, setStatus] = useState<AniListStatus>('CURRENT')
  const [score, setScore] = useState(0)
  const [progress, setProgress] = useState(0)
  const [repeat, setRepeat] = useState(0)
  const [entryId, setEntryId] = useState<number | null>(null)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [isNew, setIsNew] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setReady(false)
    setError('')
    setLoadError('')

    // Seed UI from hint immediately (strict cached/network values only).
    if (hint) {
      setStatus(hint.status)
      setScore(hint.score)
      setProgress(hint.progress)
      setRepeat(hint.repeat)
      setEntryId(hint.entryId)
      setIsNew(false)
    }

    void (async () => {
      const result = await fetchViewerListEntry(mediaId)
      if (cancelled) return

      if (result.status === 'found') {
        const v = toValues(result.entry)
        setStatus(v.status)
        setScore(v.score)
        setProgress(v.progress)
        setRepeat(v.repeat)
        setEntryId(v.entryId)
        setIsNew(false)
        setReady(true)
        return
      }

      if (result.status === 'missing') {
        // Confirmed not on AniList — only then allow Plan to watch default for new adds.
        setStatus('PLANNING')
        setScore(0)
        setProgress(0)
        setRepeat(0)
        setEntryId(null)
        setIsNew(true)
        setReady(true)
        return
      }

      // unavailable — keep hint if we have it; block save if we don't
      if (result.entry) {
        const v = toValues(result.entry)
        setStatus(v.status)
        setScore(v.score)
        setProgress(v.progress)
        setRepeat(v.repeat)
        setEntryId(v.entryId)
        setIsNew(false)
        setReady(true)
        setLoadError('Using cached list values — AniList was briefly unavailable.')
        return
      }

      if (hint) {
        setReady(true)
        setLoadError('Using on-page list values — could not re-check AniList.')
        return
      }

      setReady(false)
      setLoadError(
        'Could not load your AniList entry (rate limit or offline). Close and try again — Save is blocked so we do not overwrite Watching with defaults.'
      )
    })()

    return () => {
      cancelled = true
    }
  }, [open, mediaId, hint])

  async function onSave() {
    if (!ready) return
    setSaving(true)
    setError('')
    try {
      const maxEp = totalEpisodes && totalEpisodes > 0 ? totalEpisodes : undefined
      const clampedProgress = maxEp != null ? Math.min(progress, maxEp) : progress
      const res = await syncListEntry({
        anilistId: mediaId,
        idMal,
        entryId,
        status,
        progress: clampedProgress,
        score,
        repeat
      })
      if (res.anilist === 'error' && res.mal === 'error') {
        throw new Error(res.errors[0] || 'Failed to save list entry')
      }
      const next: ListEditValues = {
        entryId: res.entryId ?? entryId,
        status,
        score,
        progress: clampedProgress,
        repeat
      }
      // Seed cache for brand-new adds so Home rails see the entry.
      if (isNew && media && next.entryId) {
        const { upsertViewerListCacheEntry } = await import('@/lib/anilist')
        upsertViewerListCacheEntry({
          id: next.entryId,
          status: next.status,
          progress: next.progress,
          score: next.score,
          repeat: next.repeat,
          updatedAt: Date.now(),
          media
        })
      }
      setEntryId(next.entryId)
      onSaved(next)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    // Allow delete from hint/cache even when a live re-fetch failed.
    if (!entryId && !idMal && !mediaId) {
      onSaved(null)
      onOpenChange(false)
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await syncDeleteListEntry({
        anilistEntryId: entryId,
        anilistMediaId: mediaId,
        idMal
      })
      if (res.anilist !== 'ok' && res.mal !== 'ok') {
        throw new Error(
          res.errors[0] ||
            'Could not delete this entry from AniList or MAL. Check your connection and try again.'
        )
      }
      onSaved(null)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="pointer-events-auto flex max-h-[88dvh] flex-col gap-0 overflow-hidden rounded-t-2xl border-border/60 bg-[#0c0c0e] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="shrink-0 border-b border-border/50 px-4 pb-3">
          <SheetTitle className="text-page-title pr-10">
            {isNew ? 'Add to list' : 'Edit list entry'}
          </SheetTitle>
          <SheetDescription>
            Values come from your AniList / MAL entry — Save only writes what you set here
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-[calc(1rem+var(--safe-bottom))]">
          {!ready && !loadError ? (
            <p className="text-sm text-muted-foreground">Loading your list entry…</p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="list-status" className="text-xs text-muted-foreground">
                Status
              </Label>
              <select
                id="list-status"
                disabled={!ready}
                className={cn(fieldClass, 'appearance-none bg-[length:1rem] bg-[right_0.65rem_center] bg-no-repeat pr-9')}
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239a9a9a' stroke-width='2'%3E%3Cpath d='m7 15 5 5 5-5'/%3E%3Cpath d='m7 9 5-5 5 5'/%3E%3C/svg%3E\")"
                }}
                value={status}
                onChange={(e) => setStatus(e.target.value as AniListStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="list-score" className="text-xs text-muted-foreground">
                Score
              </Label>
              <select
                id="list-score"
                disabled={!ready}
                className={cn(fieldClass, 'appearance-none bg-[length:1rem] bg-[right_0.65rem_center] bg-no-repeat pr-9')}
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239a9a9a' stroke-width='2'%3E%3Cpath d='m7 15 5 5 5-5'/%3E%3Cpath d='m7 9 5-5 5 5'/%3E%3C/svg%3E\")"
                }}
                value={score}
                onChange={(e) => setScore(Number(e.target.value))}
              >
                {Array.from({ length: 11 }, (_, i) => (
                  <option key={i} value={i}>
                    {i === 0 ? '0 (unrated)' : String(i)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="list-progress" className="text-xs text-muted-foreground">
                Progress
              </Label>
              <Input
                id="list-progress"
                type="number"
                min={0}
                max={totalEpisodes ?? undefined}
                inputMode="numeric"
                disabled={!ready}
                className={fieldClass}
                value={progress}
                onChange={(e) => setProgress(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="list-repeat" className="text-xs text-muted-foreground">
                Rewatched times
              </Label>
              <Input
                id="list-repeat"
                type="number"
                min={0}
                inputMode="numeric"
                disabled={!ready}
                className={fieldClass}
                value={repeat}
                onChange={(e) => setRepeat(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
          </div>

          {loadError ? <p className="text-xs text-amber-400/90">{loadError}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            {entryId || idMal || mediaId ? (
              <Button
                type="button"
                variant="destructive"
                disabled={saving || (!ready && !entryId && !idMal)}
                onClick={() => void onDelete()}
              >
                Delete
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving || !ready}
              className="bg-white text-black hover:bg-white/90"
              onClick={() => void onSave()}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
