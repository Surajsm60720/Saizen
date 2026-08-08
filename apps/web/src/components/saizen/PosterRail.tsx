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
        dense ? 'mt-5' : 'mt-6 sm:mt-8',
        className
      )}
    >
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="text-section">{title}</h2>
        {viewMoreHref && viewMorePreset ? (
          <Link
            href={viewMoreHref}
            onClick={() => {
              hapticPress('selection')
              setPendingSearchPreset({ filters: viewMorePreset })
            }}
            className="shrink-0 text-xs font-medium text-primary transition-opacity active:opacity-70"
          >
            View more
          </Link>
        ) : null}
      </div>
      <div
        className={cn(
          'saizen-stagger scrollbar-hide flex gap-2.5 overflow-x-auto pb-1.5',
          dense ? 'gap-2' : 'gap-2.5 sm:gap-3'
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
        'saizen-stagger grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3 md:grid-cols-5 lg:grid-cols-6',
        className
      )}
    >
      {children}
    </div>
  )
}
