import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { ContinueEntry } from '@/lib/watch/continue'

export function ContinueCard({
  entry,
  className
}: {
  entry: ContinueEntry
  className?: string
}) {
  return (
    <Link
      href={`/app/anime/?id=${entry.anilistId}`}
      className={cn(
        'group relative block min-w-[16rem] overflow-hidden rounded-xl border border-border/60 bg-card',
        'transition-transform duration-200 hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
    >
      <div className="relative aspect-[16/9] bg-muted">
        {entry.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.cover}
            alt=""
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3">
          <div className="truncate text-sm font-semibold text-white" title={entry.title}>
            {entry.title.length > 32 ? `${entry.title.slice(0, 31).trimEnd()}…` : entry.title}
          </div>
          <div className="mt-0.5 text-xs text-white/75">Resume · Episode {entry.episode}</div>
        </div>
      </div>
    </Link>
  )
}
