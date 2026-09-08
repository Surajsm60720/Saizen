'use client'

import Link from 'next/link'
import type { AnimeSearchFilters } from '@/lib/anilist'
import { setPendingSearchPreset } from '@/lib/search/session'
import { cn } from '@/lib/utils'
import { hapticPress } from '@/lib/haptics'

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
  viewMoreHref?: string
  viewMorePreset?: Partial<AnimeSearchFilters>
}) {
  return (
    <section
      className={cn(
        'saizen-enter',
        dense ? 'mt-7' : 'mt-8 sm:mt-10',
        className
      )}
    >
      <div className="mb-3.5 flex items-baseline justify-between gap-3">
        <h2 className="text-section">{title}</h2>
        {viewMoreHref ? (
          <Link
            href={viewMoreHref}
            replace
            scroll={false}
            onClick={() => {
              hapticPress('selection')
              if (viewMorePreset) setPendingSearchPreset({ filters: viewMorePreset })
            }}
            className="shrink-0 text-xs font-medium text-primary transition-opacity active:opacity-70"
          >
            View more
          </Link>
        ) : null}
      </div>
      <div
        className={cn(
          'saizen-stagger scrollbar-hide flex overflow-x-auto pb-2',
          dense ? 'gap-2.5' : 'gap-3 sm:gap-3.5'
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
        'saizen-stagger grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-3.5 md:grid-cols-5 lg:grid-cols-6',
        className
      )}
    >
      {children}
    </div>
  )
}
