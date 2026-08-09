'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ProviderResult } from '@/lib/providers'

export function SourceRow({
  result,
  likelyFaster,
  playing,
  onPlay,
  onDownload,
  className
}: {
  result: ProviderResult
  likelyFaster?: boolean
  playing?: boolean
  onPlay: () => void
  onDownload?: () => void
  className?: string
}) {
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5',
        'transition-colors hover:border-primary/30',
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium leading-snug">{result.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{result.providerName}</span>
          {result.resolution ? <span>· {result.resolution}</span> : null}
          {result.seeders != null ? <span>· {result.seeders} seeders</span> : null}
          {result.httpUrl ? <Badge variant="secondary">HTTP</Badge> : null}
          {result.torrentUrl ? <Badge variant="secondary">torrent</Badge> : null}
          {result.magnet ? <Badge variant="outline">magnet</Badge> : null}
          {likelyFaster ? (
            <Badge className="bg-ok/15 text-ok hover:bg-ok/20">Likely faster</Badge>
          ) : null}
        </div>
      </div>
      {onDownload ? (
        <Button
          size="lg"
          variant="outline"
          className="min-h-11 shrink-0 px-3"
          disabled={playing}
          haptic="selection"
          onClick={onDownload}
        >
          Save
        </Button>
      ) : null}
      <Button
        size="lg"
        className="min-h-11 shrink-0 px-4"
        disabled={playing}
        haptic="medium"
        onClick={onPlay}
      >
        Play
      </Button>
    </li>
  )
}

export function SourceList({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) {
  return <ul className={cn('mt-3 flex flex-col gap-2', className)}>{children}</ul>
}
