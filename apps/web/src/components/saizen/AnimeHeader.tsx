import { Star, Clock, Film, ListVideo, Calendar, Building2, BookOpen, Play } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function AnimeHeader({
  title,
  cover,
  banner,
  meta,
  description,
  score,
  format,
  episodes,
  duration,
  genres,
  status,
  season,
  seasonYear,
  source,
  studio,
  onTrailer,
  className
}: {
  title: string
  cover?: string | null
  banner?: string | null
  meta?: string
  description?: string
  score?: number | null
  format?: string | null
  episodes?: number | null
  duration?: number | null
  genres?: string[] | null
  status?: string | null
  season?: string | null
  seasonYear?: number | null
  source?: string | null
  studio?: string | null
  onTrailer?: (() => void) | null
  backHref?: string
  className?: string
}) {
  const seasonLabel =
    season || seasonYear != null
      ? [season ? season.charAt(0) + season.slice(1).toLowerCase() : null, seasonYear]
          .filter(Boolean)
          .join(' ')
      : null

  const chips = [
    format ? { icon: Film, label: format } : null,
    seasonLabel ? { icon: Calendar, label: seasonLabel } : null,
    studio ? { icon: Building2, label: studio } : null,
    source ? { icon: BookOpen, label: source } : null,
    episodes != null ? { icon: ListVideo, label: `${episodes} eps` } : null,
    duration != null ? { icon: Clock, label: `~${duration} min` } : null
  ].filter(Boolean) as Array<{ icon: typeof Film; label: string }>

  const bg = banner || cover || ''

  return (
    <div className={cn('relative -mx-4 isolate sm:-mx-5', className)}>
      <div className="absolute inset-0 overflow-hidden" aria-hidden>
        {bg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bg}
            alt=""
            className="size-full scale-110 object-cover object-[center_18%] blur-[6px] saturate-[1.08]"
          />
        ) : (
          <div className="size-full bg-zinc-900" />
        )}
        {/* Lighter wash so banner art stays visible behind the poster */}
        <div className="absolute inset-0 bg-[#141416]/28" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#141416] via-[#141416]/55 to-[#141416]/15" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#141416]/70 via-[#141416]/25 to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_15%_85%,rgba(232,196,120,0.1),transparent_55%)]" />
      </div>

      <div
        className="relative z-10 px-4 pb-5 sm:px-5"
        style={{ paddingTop: 'calc(var(--safe-top) + 3.75rem)' }}
      >
        <div className="flex items-end gap-4">
          {cover ? (
            <div className="relative shrink-0">
              <div
                aria-hidden
                className="absolute -inset-2 rounded-2xl bg-primary/15 blur-xl"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cover}
                alt=""
                className="relative h-44 w-[7.25rem] rounded-xl object-cover shadow-[0_22px_48px_-18px_rgba(0,0,0,0.95)] ring-1 ring-white/18 sm:h-52 sm:w-[8.5rem]"
              />
              {score != null ? (
                <div className="absolute -right-2 -bottom-2 flex items-center gap-1 rounded-full bg-[#1a1a1c] px-2 py-1 text-xs font-semibold text-primary shadow-lg ring-1 ring-primary/40">
                  <Star className="size-3 fill-current" />
                  {score}%
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="min-w-0 flex-1 pb-1">
            {status ? (
              <p className="mb-1.5 text-[0.68rem] font-medium tracking-[0.2em] text-primary/90 uppercase">
                {status.replaceAll('_', ' ')}
              </p>
            ) : null}
            <h1 className="font-heading text-[1.85rem] leading-[1.05] tracking-tight text-foreground sm:text-4xl">
              {title}
            </h1>
            {chips.length || meta ? (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {chips.map(({ icon: Icon, label }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 rounded-full bg-[#0c0c0e]/70 px-2.5 py-1 text-[0.7rem] text-white/90 ring-1 ring-white/15"
                  >
                    <Icon className="size-3 opacity-80" />
                    {label}
                  </span>
                ))}
                {!chips.length && meta ? (
                  <span className="text-sm text-muted-foreground">{meta}</span>
                ) : null}
              </div>
            ) : null}
            {onTrailer ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="mt-3 gap-1.5 rounded-full bg-[#0c0c0e]/75 text-foreground hover:bg-[#0c0c0e]"
                onClick={onTrailer}
              >
                <Play className="size-3.5 fill-current" />
                Trailer
              </Button>
            ) : null}
          </div>
        </div>

        {genres?.length ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {genres.slice(0, 6).map((g) => (
              <Badge
                key={g}
                variant="outline"
                className="rounded-full border-primary/20 bg-primary/[0.08] text-[0.7rem] text-primary/90"
              >
                {g}
              </Badge>
            ))}
          </div>
        ) : null}

        {description ? (
          <p className="mt-3.5 max-w-2xl text-sm leading-relaxed text-white/75 line-clamp-4">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  )
}
