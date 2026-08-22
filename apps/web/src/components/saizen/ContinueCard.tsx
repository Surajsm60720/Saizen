'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { hapticPress } from '@/lib/haptics'
import { rememberCurrentScroll } from '@/lib/nav/scrollMemory'
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
      scroll={false}
      onClick={() => {
        rememberCurrentScroll()
        hapticPress('light')
      }}
      className={cn(
        'group relative block min-w-[16.5rem] overflow-hidden rounded-xl bg-card ring-1 ring-white/8 sm:min-w-[19rem]',
        'saizen-press',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        className
      )}
    >
      <div className="relative aspect-[16/9] bg-muted">
        {entry.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.cover}
            alt=""
            className="size-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-active:scale-[1.02] motion-reduce:transition-none"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-2.5 sm:p-3">
          <div
            className="text-section truncate text-[0.9375rem] text-white sm:text-[1.05rem]"
            title={entry.title}
          >
            {entry.title.length > 36 ? `${entry.title.slice(0, 35).trimEnd()}…` : entry.title}
          </div>
          <div className="mt-0.5 text-[0.7rem] font-medium text-primary">
            Resume · Episode {entry.episode}
          </div>
        </div>
      </div>
    </Link>
  )
}
