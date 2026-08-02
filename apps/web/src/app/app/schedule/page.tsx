'use client'

import { PageHeader } from '@/components/saizen'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function SchedulePage() {
  return (
    <>
      <PageHeader
        title="Schedule"
        dense
        description="Airing calendar from AniList — coming next."
        action={<Badge variant="secondary">Soon</Badge>}
      />

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {DAYS.map((day, i) => (
          <button
            key={day}
            type="button"
            className={
              i === 0
                ? 'min-h-10 shrink-0 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground'
                : 'min-h-10 shrink-0 rounded-lg border border-border/60 bg-card px-3.5 text-sm text-muted-foreground'
            }
          >
            {day}
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <li
            key={i}
            className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-3"
          >
            <Skeleton className="h-16 w-12 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Badge variant="outline">—:—</Badge>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-sm text-muted-foreground">
        Placeholder rows show the compact density used for airing lists.
      </p>
    </>
  )
}
