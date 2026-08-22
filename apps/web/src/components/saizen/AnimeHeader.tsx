import { Star, Play, ListPlus } from 'lucide-react'
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
  onEditList,
  listStatusLabel,
  onContinueWatching,
  continueEpisode,
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
  /** Open list editor (AniList / MAL) */
  onEditList?: (() => void) | null
  /** User list status label, e.g. Watching */
  listStatusLabel?: string | null
  /** Jump to sources for the resume episode */
  onContinueWatching?: (() => void) | null
  /** Episode number shown on the continue CTA */
  continueEpisode?: number | null
  backHref?: string
  className?: string
}) {
  const chips = [
    format,
    season || seasonYear != null
      ? [season ? season.charAt(0) + season.slice(1).toLowerCase() : null, seasonYear]
          .filter(Boolean)
          .join(' ')
      : null,
    studio,
    source,
    episodes != null ? `${episodes} eps` : null,
    duration != null ? `~${duration} min` : null
  ].filter(Boolean) as string[]

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
        <div className="absolute inset-0 bg-background/28" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-background/15" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/70 via-background/25 to-transparent" />
      </div>

      <div
        className="relative z-10 px-4 pb-7 sm:px-5 sm:pb-8"
        style={{ paddingTop: 'calc(var(--safe-top) + 4rem)' }}
      >
        <div className="flex items-end gap-5">
          {cover ? (
            <div className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cover}
                alt=""
                className="relative h-48 w-[7.75rem] rounded-xl object-cover ring-1 ring-white/12 sm:h-56 sm:w-[9rem]"
              />
              {score != null ? (
                <div className="absolute -right-2 -bottom-2 flex items-center gap-1 rounded-md bg-[#1a1a1c] px-2 py-1 text-xs font-semibold text-primary ring-1 ring-white/12">
                  <Star className="size-3 fill-current" />
                  {score}%
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="min-w-0 flex-1 pb-1">
            {status ? (
              <p className="mb-2 text-[0.68rem] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                {status.replaceAll('_', ' ')}
              </p>
            ) : null}
            <h1 className="text-hero-title text-foreground">
              {title}
            </h1>
            {chips.length || meta ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {chips.length ? chips.join(' · ') : meta}
              </p>
            ) : null}
            {onContinueWatching || onTrailer || onEditList ? (
              <div className="mt-4 flex flex-wrap gap-2.5">
                {onContinueWatching && continueEpisode != null ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 gap-1.5 px-3.5"
                    onClick={onContinueWatching}
                  >
                    <Play className="size-3.5 fill-current" />
                    Continue EP {continueEpisode}
                  </Button>
                ) : null}
                {onTrailer ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-9 gap-1.5 px-3.5"
                    onClick={onTrailer}
                  >
                    <Play className="size-3.5 fill-current" />
                    Trailer
                  </Button>
                ) : null}
                {onEditList ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1.5 px-3.5"
                    onClick={onEditList}
                  >
                    <ListPlus className="size-3.5" />
                    {listStatusLabel || 'Add to list'}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {genres?.length ? (
          <p className="mt-4 text-meta">
            {genres.slice(0, 6).join(' · ')}
          </p>
        ) : null}

        {description ? (
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/75 line-clamp-4">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  )
}
