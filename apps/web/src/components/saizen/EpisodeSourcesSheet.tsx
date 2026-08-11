'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SourceList } from '@/components/saizen/SourceRow'
import type { EpisodeItem } from '@/components/saizen/EpisodeRow'
import { cn } from '@/lib/utils'
import type { StreamCandidate } from '@saizen/shared'

const DISMISS_DISTANCE = 110
const DISMISS_VELOCITY = 0.85
const OVERLAY_FADE_PX = 280

function streamKindLabel(kind: StreamCandidate['kind']): string {
  if (kind === 'hls') return 'HLS'
  if (kind === 'mp4') return 'MP4'
  return 'Stream'
}

export function EpisodeSourcesSheet({
  open,
  onOpenChange,
  episode,
  durationMin,
  streamsSearching = false,
  status,
  streamCandidates = [],
  moduleNames = {},
  playing,
  onPlayStream,
  onSaveStream
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  episode: EpisodeItem | null
  malId?: number | null
  durationMin?: number | null
  streamsSearching?: boolean
  status: string
  streamCandidates?: StreamCandidate[]
  moduleNames?: Record<string, string>
  playing: boolean
  onPlayStream?: (candidate: StreamCandidate) => void
  onSaveStream?: (candidate: StreamCandidate) => void
}) {
  const [mounted, setMounted] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [gestureExit, setGestureExit] = useState(false)
  const gestureExitRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startY: number
    lastY: number
    lastT: number
    active: boolean
    force: boolean
  } | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (open) {
      gestureExitRef.current = false
      setGestureExit(false)
      setDragY(0)
      setDragging(false)
      dragRef.current = null
      return
    }
    setDragging(false)
    dragRef.current = null
  }, [open])

  const title = episode?.title?.trim() || (episode ? `Episode ${episode.number}` : 'Episode')
  const synopsis = episode?.synopsis?.trim() || ''
  const durationLabel =
    durationMin && durationMin > 0 ? `${durationMin} min` : null

  const overlayOpacity = Math.max(0, 1 - dragY / OVERLAY_FADE_PX)
  const sheetTransform =
    dragY > 0 || gestureExit ? `translate3d(0, ${dragY}px, 0)` : undefined

  function beginDrag(e: React.PointerEvent, force: boolean) {
    if (e.button !== 0) return
    const el = scrollRef.current
    if (!force && el && el.scrollTop > 0) return
    dragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      lastY: e.clientY,
      lastT: performance.now(),
      active: true,
      force
    }
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  function moveDrag(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d?.active || d.pointerId !== e.pointerId) return
    const dy = Math.max(0, e.clientY - d.startY)
    d.lastY = e.clientY
    d.lastT = performance.now()
    if (dy > 2) setDragging(true)
    setDragY(dy)
  }

  function endDrag(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    dragRef.current = null
    setDragging(false)
    const dy = Math.max(0, e.clientY - d.startY)
    const dt = Math.max(1, performance.now() - d.lastT)
    const velocity = (e.clientY - d.lastY) / dt
    if (dy > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY) {
      const exitY = Math.max(dy, window.innerHeight)
      gestureExitRef.current = true
      setGestureExit(true)
      setDragY(exitY)
      onOpenChange(false)
      return
    }
    setDragY(0)
  }

  if (!mounted) return null

  const showEmpty = !streamsSearching && streamCandidates.length === 0

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && !gestureExitRef.current) {
          setDragY(0)
          setGestureExit(false)
        }
        onOpenChange(next)
      }}
    >
      <SheetContent
        side="bottom"
        overlayClassName={cn(
          (dragging || gestureExit) && '![animation:none] !duration-0',
          dragY > 0 && !dragging && !gestureExit && 'duration-200'
        )}
        overlayStyle={{
          opacity: overlayOpacity,
          transition:
            dragging || gestureExit
              ? 'none'
              : 'opacity 200ms cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        className={cn(
          'pointer-events-auto flex max-h-[88dvh] flex-col gap-0 overflow-hidden rounded-t-2xl border-border/60 bg-background p-0',
          (dragging || gestureExit) &&
            '![animation:none] !transition-none data-[side=bottom]:data-open:![animation:none] data-[side=bottom]:data-closed:![animation:none] data-closed:![animation:none] data-closed:!opacity-0',
          !dragging &&
            !gestureExit &&
            'transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]'
        )}
        style={{ transform: sheetTransform }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div
          className="flex shrink-0 touch-none flex-col"
          onPointerDown={(e) => beginDrag(e, true)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="flex justify-center pb-1 pt-2.5" aria-hidden>
            <div className="h-1 w-10 rounded-full bg-white/25" />
          </div>
          <SheetHeader className="border-b border-border/50 pb-3 pt-1">
            <SheetTitle className="text-page-title pr-10">
              {episode ? `Episode ${episode.number}` : 'Episode'}
            </SheetTitle>
            <SheetDescription className="line-clamp-2 text-foreground/90">
              {title}
            </SheetDescription>
          </SheetHeader>
        </div>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+var(--safe-bottom))] [-webkit-overflow-scrolling:touch]"
          onPointerDown={(e) => beginDrag(e, false)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
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

              <div className="space-y-4">
                {status ? (
                  <p className="rounded-lg border border-border/50 bg-muted/40 px-3 py-2 text-xs">
                    {status}
                  </p>
                ) : null}

                {streamCandidates.length > 0 || streamsSearching ? (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Streams</h3>
                    <p className="mb-2 text-xs text-muted-foreground">
                      Play now or Save for offline — from installed modules.
                    </p>
                    {streamCandidates.length > 0 ? (
                      <SourceList>
                        {streamCandidates.map((c, i) => {
                          const moduleName = moduleNames[c.moduleId] || c.moduleId
                          const label =
                            c.title ||
                            [c.quality, streamKindLabel(c.kind)].filter(Boolean).join(' · ') ||
                            'Stream'
                          return (
                            <li
                              key={`${c.moduleId}-${c.url}-${i}`}
                              className={cn(
                                'flex items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5',
                                'transition-colors hover:border-primary/30'
                              )}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium leading-snug">
                                  {label}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                  <span>{moduleName}</span>
                                  {c.quality ? <span>· {c.quality}</span> : null}
                                  <Badge variant="secondary">{streamKindLabel(c.kind)}</Badge>
                                </div>
                              </div>
                              {onSaveStream ? (
                                <Button
                                  size="lg"
                                  variant="outline"
                                  className="min-h-11 shrink-0 px-3"
                                  disabled={playing}
                                  haptic="selection"
                                  onClick={() => onSaveStream(c)}
                                >
                                  Save
                                </Button>
                              ) : null}
                              {onPlayStream ? (
                                <Button
                                  size="lg"
                                  className="min-h-11 shrink-0 px-4"
                                  disabled={playing}
                                  haptic="medium"
                                  onClick={() => onPlayStream(c)}
                                >
                                  Play
                                </Button>
                              ) : null}
                            </li>
                          )
                        })}
                      </SourceList>
                    ) : (
                      <div className="space-y-2">
                        {Array.from({ length: 2 }).map((_, i) => (
                          <Skeleton key={i} className="h-14 w-full rounded-xl" />
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                {showEmpty ? (
                  <p className="text-sm text-muted-foreground">
                    No streams found. Install modules under Settings → Modules.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
