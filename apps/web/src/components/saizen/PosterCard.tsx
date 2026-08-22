'use client'

import Link from 'next/link'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { hapticPress } from '@/lib/haptics'
import { rememberCurrentScroll } from '@/lib/nav/scrollMemory'

function shortTitle(title: string, max = 28) {
  const t = title.trim()
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(1, max - 1)).trimEnd()}…`
}

export function PosterCard({
  href,
  image,
  title,
  subtitle,
  score,
  format,
  year,
  className,
  size = 'md',
  onNavigate
}: {
  href: string
  image?: string | null
  title: string
  /** Fallback meta line when score/format/year not passed */
  subtitle?: string
  score?: number | null
  format?: string | null
  year?: number | null
  className?: string
  size?: 'sm' | 'md' | 'lg'
  /** Fired on click before navigation (e.g. blur search keyboard). */
  onNavigate?: () => void
}) {
  const label = shortTitle(title, size === 'sm' ? 22 : 30)
  const meta =
    [format, year].filter(Boolean).join(' · ') || subtitle || undefined

  return (
    <Link
      href={href}
      scroll={false}
      title={title}
      onClick={() => {
        rememberCurrentScroll()
        hapticPress('light')
        onNavigate?.()
      }}
      className={cn(
        'group relative block shrink-0 overflow-hidden rounded-xl',
        'bg-card ring-1 ring-white/8',
        'saizen-press',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        size === 'lg' && 'w-[9rem] sm:w-[10.25rem]',
        size === 'md' && 'w-[7.75rem] sm:w-[8.75rem]',
        size === 'sm' && 'w-[6.5rem]',
        className
      )}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-zinc-900">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={title}
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
            No art
          </div>
        )}

        {/* Legibility wash only — art leads */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />

        {score != null ? (
          <div className="absolute top-2 left-2 flex items-center gap-0.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[0.65rem] font-semibold text-primary">
            <Star className="size-2.5 fill-current" />
            {score}%
          </div>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 p-2 sm:p-2.5">
          <strong className="text-section block truncate text-[0.8125rem] text-white">
            {label}
          </strong>
          {meta ? (
            <span className="mt-0.5 block truncate text-[0.65rem] text-white/65">
              {meta}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  )
}
