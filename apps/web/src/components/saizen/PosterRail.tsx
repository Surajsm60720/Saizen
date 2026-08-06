'use client'

import Link from 'next/link'
import type { AnimeSearchFilters } from '@/lib/anilist'
import { setPendingSearchPreset } from '@/lib/search/session'
import { cn } from '@/lib/utils'

export function PosterRail({
  title,
  children,
  className,
  dense = false,
  viewMoreHref,
  viewMorePreset
}: {
  title: string
  children: React.ReactNode
  className?: string
  dense?: boolean
  /** When set with a preset, shows a View more link that seeds Search filters. */
  viewMoreHref?: string
  viewMorePreset?: Partial<AnimeSearchFilters>
}) {
  return (
    <section className={cn(dense ? 'mt-6' : 'mt-8 sm:mt-10', className)}>
      <div className="mb-3.5 flex items-baseline justify-between gap-3">
        <h2 className={cn(dense ? 'text-section text-[1.25rem]' : 'text-section')}>{title}</h2>
        {viewMoreHref && viewMorePreset ? (
          <Link
            href={viewMoreHref}
            onClick={() => setPendingSearchPreset({ filters: viewMorePreset })}
            className="shrink-0 text-sm font-medium text-primary"
          >
            View more
          </Link>
        ) : null}
      </div>
      <div
        className={cn(
          'scrollbar-hide flex gap-3 overflow-x-auto pb-2',
          dense ? 'gap-2.5' : 'gap-3.5 sm:gap-4'
        )}
      >
        {children}
      </div>
    </section>
  )
}

export function PosterGrid({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5',
        className
      )}
    >
      {children}
    </div>
  )
}
