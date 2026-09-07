'use client'

import { Check, ChevronRight, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { hapticPress } from '@/lib/haptics'

export type EpisodeItem = {
  number: number
  title: string
  thumbnail?: string | null
  meta?: string
  synopsis?: string | null
  /** True when AniList says this episode has not aired yet */
  unreleased?: boolean
  /** Locally / list-marked as watched */
  watched?: boolean
  airsAt?: number | null
}

export function EpisodeRow({
  episode,
  onSelect,
  downloaded,
  selecting,
  selected,
  className
}: {
  episode: EpisodeItem
  onSelect: () => void
  downloaded?: boolean
  selecting?: boolean
  selected?: boolean
  className?: string
}) {
  const unreleased = Boolean(episode.unreleased)
  const watched = Boolean(episode.watched) && !unreleased

  return (
    <button
      type="button"
      onClick={() => {
        if (!unreleased) hapticPress(selecting ? 'selection' : 'light')
        onSelect()
      }}
      disabled={unreleased}
      className={cn(
        'group flex w-full items-center gap-3 rounded-2xl border px-2.5 py-2 text-left',
        'transition-[transform,border-color,background-color,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
        'saizen-press',
        unreleased
          ? 'cursor-not-allowed border-white/5 bg-white/[0.02] opacity-55'
            : watched
            ? 'border-white/6 bg-white/[0.015] opacity-55 grayscale-[0.35]'
            : selected
              ? 'border-primary/40 bg-primary/10'
            : 'border-white/10 bg-white/[0.03] active:bg-white/[0.06]',
        className
      )}
    >
      <div
        className={cn(
          'relative h-14 w-[5.5rem] shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-white/10',
          (unreleased || watched) && 'grayscale'
        )}
      >
        {episode.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={episode.thumbnail}
            alt=""
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="text-section flex size-full items-center justify-center bg-zinc-900 text-lg text-white/35">
            {String(episode.number).padStart(2, '0')}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-0.5 text-[0.6rem] font-semibold text-white/90">
          EP {episode.number}
        </div>
        {unreleased ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Clock className="size-4 text-white/90" />
          </div>
        ) : watched ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45">
            <Check className="size-4 text-white/90" />
          </div>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[0.68rem] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Episode {episode.number}
          </span>
          {unreleased ? (
            <Badge variant="outline" className="h-5 text-[0.65rem] text-muted-foreground">
              Not aired
            </Badge>
          ) : watched ? (
            <Badge variant="outline" className="h-5 text-[0.65rem] text-muted-foreground">
              Watched
            </Badge>
          ) : null}
          {downloaded ? (
            <Badge variant="secondary" className="h-5 text-[0.65rem]">
              Downloaded
            </Badge>
          ) : null}
          {selecting && !unreleased ? (
            <Badge variant={selected ? 'default' : 'outline'} className="h-5 text-[0.65rem]">
              {selected ? 'Selected' : 'Select'}
            </Badge>
          ) : null}
        </div>
        <div
          className={cn(
            'truncate text-sm font-semibold',
            watched && 'text-muted-foreground'
          )}
        >
          {episode.title}
        </div>
        {episode.synopsis ? (
          <p className="mt-0.5 line-clamp-2 text-[0.7rem] leading-snug text-muted-foreground/90">
            {episode.synopsis}
          </p>
        ) : episode.meta ? (
          <div className="truncate text-xs text-muted-foreground">{episode.meta}</div>
        ) : null}
        {episode.synopsis && episode.meta ? (
          <div className="mt-0.5 truncate text-[0.65rem] text-muted-foreground/70">
            {episode.meta}
          </div>
        ) : null}
      </div>
      {!unreleased ? (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      ) : null}
    </button>
  )
}

export function EpisodeList({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) {
  return <ul className={cn('flex flex-col gap-2.5', className)}>{children}</ul>
}

function formatAirDate(airingAt?: number | null): string | undefined {
  if (!airingAt) return undefined
  try {
    return new Date(airingAt * 1000).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  } catch {
    return undefined
  }
}

/** Parse "Episode 12 - Title" style AniList streaming titles. */
export function parseStreamingEpisodeNumber(title?: string | null): number | null {
  if (!title) return null
  // Reject bare platform / service names that are not episode labels.
  if (
    /^(crunchyroll|netflix|hidive|disney\+?|amazon|prime video|hulu|bilibili|youtube|tubi)$/i.test(
      title.trim()
    )
  ) {
    return null
  }
  const m = title.match(/(?:episode|ep\.?)\s*(\d+)/i) || title.match(/^(\d+)\s*[:\-–.]/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

function isTrailerOrSpecial(title?: string | null): boolean {
  if (!title) return false
  return /\b(trailer|teaser|pv\b|movie|ova|ona|special|recap)\b/i.test(title)
}

/**
 * lastReleasedEpisode: highest episode number that has already aired.
 * Episodes above that are marked unreleased (avoids matching older-season torrents).
 */
export function resolveLastReleasedEpisode(opts: {
  episodeCount?: number | null
  status?: string | null
  nextAiringEpisode?: { episode?: number | null; airingAt?: number | null } | null
  streamingEpisodesLength?: number
  /** Highest episode known from AniZip / Jikan / etc. */
  externalReleasedCount?: number | null
}): number | null {
  const status = opts.status ?? ''
  if (status === 'FINISHED' || status === 'CANCELLED') {
    return (
      opts.episodeCount ??
      opts.externalReleasedCount ??
      opts.streamingEpisodesLength ??
      null
    )
  }
  if (status === 'NOT_YET_RELEASED') return 0

  const fromNext =
    opts.nextAiringEpisode?.episode != null
      ? Math.max(0, opts.nextAiringEpisode.episode - 1)
      : null
  const candidates = [
    fromNext,
    opts.externalReleasedCount ?? null,
    opts.streamingEpisodesLength && opts.streamingEpisodesLength > 0
      ? opts.streamingEpisodesLength
      : null
  ].filter((n): n is number => n != null && n >= 0)

  if (!candidates.length) return null
  return Math.max(...candidates)
}

/** Build episode rows from AniList count + streaming + airing metadata. */
export function buildEpisodeItems(opts: {
  episodeCount?: number | null
  /** AniList show-level average minutes */
  duration?: number | null
  /** Probed real durations (seconds) keyed by episode number */
  probedDurationSecByEpisode?: Record<number, number>
  status?: string | null
  nextAiringEpisode?: { episode?: number | null; airingAt?: number | null } | null
  streamingEpisodes?: Array<{
    title?: string | null
    thumbnail?: string | null
    site?: string | null
  }> | null
  /** AniZip / Jikan max episode number or announced count */
  externalEpisodeCount?: number | null
  /** Highest released episode from external metadata */
  externalReleasedCount?: number | null
}): EpisodeItem[] {
  const streams = opts.streamingEpisodes ?? []
  const byNumber = new Map<
    number,
    { title?: string | null; thumbnail?: string | null; site?: string | null }
  >()
  for (let i = 0; i < streams.length; i++) {
    const s = streams[i]
    if (isTrailerOrSpecial(s.title)) continue
    const n = parseStreamingEpisodeNumber(s.title) ?? i + 1
    // Prefer first real match; don't overwrite better thumbs
    const prev = byNumber.get(n)
    if (!prev || (!prev.thumbnail && s.thumbnail)) byNumber.set(n, s)
  }

  const nextEp = opts.nextAiringEpisode?.episode ?? 0
  const maxStreamEp = byNumber.size ? Math.max(...byNumber.keys()) : 0

  // Prefer AniList's official count for finished seasons — AniZip/TVDB absolute
  // numbering (e.g. franchise stacks) must not inflate the episode list.
  const anilistCount = opts.episodeCount ?? 0
  const finished =
    opts.status === 'FINISHED' || opts.status === 'CANCELLED'
  let total = Math.max(
    anilistCount,
    maxStreamEp,
    nextEp,
    opts.externalEpisodeCount ?? 0,
    opts.status === 'RELEASING' || opts.status === 'HIATUS'
      ? Math.max(nextEp, opts.externalReleasedCount ?? 0, 12)
      : 0,
    1
  )
  if (finished && anilistCount > 0) {
    total = anilistCount
  } else if (anilistCount > 0 && (opts.externalEpisodeCount ?? 0) > anilistCount * 1.5) {
    // External mapping wildly larger than AniList — trust AniList + streaming max
    total = Math.max(anilistCount, maxStreamEp, nextEp, 1)
  }

  const lastReleased = resolveLastReleasedEpisode({
    episodeCount: opts.episodeCount,
    status: opts.status,
    nextAiringEpisode: opts.nextAiringEpisode,
    streamingEpisodesLength: maxStreamEp,
    externalReleasedCount: opts.externalReleasedCount
  })
  const nextAirLabel = formatAirDate(opts.nextAiringEpisode?.airingAt)
  const probed = opts.probedDurationSecByEpisode ?? {}

  return Array.from({ length: total }, (_, i) => {
    const n = i + 1
    const stream = byNumber.get(n)
    const unreleased = lastReleased != null ? n > lastReleased : false
    const title =
      stream?.title?.replace(/^Episode\s*\d+\s*[:\-–]?\s*/i, '').trim() ||
      stream?.title ||
      (unreleased ? 'Upcoming' : `Episode ${n}`)

    const metaParts: string[] = []
    if (unreleased) {
      if (n === nextEp && nextAirLabel) metaParts.push(`Airs ${nextAirLabel}`)
      else metaParts.push('Not released yet this season')
    } else {
      const probedSec = probed[n]
      if (probedSec && Number.isFinite(probedSec) && probedSec >= 30) {
        metaParts.push(`${Math.max(1, Math.round(probedSec / 60))} min`)
      } else if (opts.duration) {
        metaParts.push(`~${opts.duration} min`)
      }
      if (stream?.site) metaParts.push(stream.site)
    }

    return {
      number: n,
      title,
      thumbnail: stream?.thumbnail ?? null,
      meta: metaParts.length ? metaParts.join(' · ') : undefined,
      unreleased,
      airsAt: n === nextEp ? opts.nextAiringEpisode?.airingAt : null
    }
  })
}
