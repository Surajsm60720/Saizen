'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/saizen'
import { Skeleton } from '@/components/ui/skeleton'
import {
  displayTitle,
  fetchWeekSchedule,
  type AiringScheduleItem,
  type WeekScheduleMode
} from '@/lib/anilist'
import { isAnilistConnected } from '@/lib/auth'
import {
  bucketByLocalWeekday,
  formatWeekRangeLabel,
  getLocalWeekDays,
  localWeekdayIndex,
  type LocalAiring
} from '@/lib/time/airingLocal'
import { cn } from '@/lib/utils'

type Row = AiringScheduleItem & { local: LocalAiring }

export default function SchedulePage() {
  const weekDays = useMemo(() => getLocalWeekDays(), [])
  const [selectedDay, setSelectedDay] = useState(() => localWeekdayIndex())
  const [mode, setMode] = useState<WeekScheduleMode | null>(null)
  const [anilistOn, setAnilistOn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<AiringScheduleItem[]>([])

  useEffect(() => {
    let cancelled = false
    void isAnilistConnected().then((on) => {
      if (cancelled) return
      setAnilistOn(on)
      setMode(on ? 'watching' : 'season')
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!mode) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchWeekSchedule({ mode })
      .then((res) => {
        if (cancelled) return
        setItems(res.items)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load schedule')
        setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [mode])

  const buckets = useMemo(() => bucketByLocalWeekday(items), [items])
  const dayRows: Row[] = buckets.get(selectedDay) ?? []
  const counts = useMemo(
    () => weekDays.map((d) => buckets.get(d.weekdayIndex)?.length ?? 0),
    [buckets, weekDays]
  )
  const selectedMeta = weekDays[selectedDay]
  const weekLabel = formatWeekRangeLabel(weekDays)
  const isMyList = mode === 'watching'
  const ready = mode != null

  return (
    <div className="flex min-h-0 flex-col">
      <PageHeader
        title="Schedule"
        dense
        className="mb-3"
        description={`${weekLabel} · local times`}
      />

      {/* My list / Season */}
      <div
        className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1"
        role="tablist"
        aria-label="Schedule source"
      >
        <button
          type="button"
          role="tab"
          aria-selected={isMyList}
          disabled={!anilistOn}
          title={anilistOn ? undefined : 'Sign in with AniList to use My list'}
          onClick={() => setMode('watching')}
          className={cn(
            'min-h-9 rounded-lg px-3 text-sm font-medium transition-colors',
            ready && isMyList
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
            !anilistOn && 'cursor-not-allowed opacity-45'
          )}
        >
          My list
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={ready && !isMyList}
          onClick={() => setMode('season')}
          className={cn(
            'min-h-9 rounded-lg px-3 text-sm font-medium transition-colors',
            ready && !isMyList
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Season
        </button>
      </div>

      {/* Week calendar strip */}
      <div
        className="mb-5 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02]"
        role="tablist"
        aria-label="Week days"
      >
        <div className="grid grid-cols-7 divide-x divide-white/[0.06]">
          {weekDays.map((day, i) => {
            const active = i === selectedDay
            const count = counts[i]
            const hasAirings = count > 0
            return (
              <button
                key={day.dateKey}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedDay(i)}
                className={cn(
                  'relative flex min-h-[4.75rem] flex-col items-center justify-center gap-1 px-0.5 py-2.5 transition-colors',
                  active
                    ? 'bg-primary/20'
                    : 'hover:bg-white/[0.04] active:bg-white/[0.06]',
                  day.isToday && !active && 'bg-white/[0.03]'
                )}
              >
                <span
                  className={cn(
                    'text-[0.6rem] font-medium leading-none tracking-wide text-muted-foreground sm:text-xs',
                    active && 'text-primary'
                  )}
                >
                  {day.labelDay}
                </span>
                <span
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full font-heading text-base tabular-nums leading-none tracking-tight',
                    active && 'bg-primary text-primary-foreground',
                    !active && day.isToday && 'ring-1 ring-primary/50 text-primary',
                    !active && !day.isToday && 'text-foreground'
                  )}
                >
                  {day.dateNum}
                </span>
                <span className="flex h-1.5 items-center justify-center gap-0.5">
                  {hasAirings ? (
                    <>
                      <span
                        className={cn(
                          'size-1 rounded-full',
                          active ? 'bg-primary' : 'bg-primary/70'
                        )}
                      />
                      {count > 1 ? (
                        <span
                          className={cn(
                            'size-1 rounded-full',
                            active ? 'bg-primary/70' : 'bg-primary/40'
                          )}
                        />
                      ) : null}
                      {count > 2 ? (
                        <span
                          className={cn(
                            'size-1 rounded-full',
                            active ? 'bg-primary/45' : 'bg-primary/25'
                          )}
                        />
                      ) : null}
                    </>
                  ) : (
                    <span className="size-1 rounded-full bg-transparent" />
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected day heading */}
      {selectedMeta ? (
        <div className="mb-3">
          <h2 className="text-section">
            {selectedMeta.labelDay}
            {selectedMeta.isToday ? (
              <span className="text-meta ml-2 align-middle !text-primary uppercase tracking-[0.14em]">
                Today
              </span>
            ) : null}
          </h2>
          <p className="text-meta mt-0.5">
            {selectedMeta.monthShort} {selectedMeta.dateNum}
            {!loading && !error ? (
              <>
                {' '}
                · {dayRows.length} airing{dayRows.length === 1 ? '' : 's'}
                {isMyList ? ' on your list' : ' this season'}
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      {loading || !ready ? (
        <ul className="space-y-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <li
              key={i}
              className="flex gap-3 border-t border-white/[0.06] py-3 first:border-t-0"
            >
              <Skeleton className="mt-1 h-4 w-14 shrink-0" />
              <Skeleton className="h-14 w-10 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1 space-y-2 pt-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {ready && !loading && error ? (
        <p className="text-body text-destructive">{error}</p>
      ) : null}

      {ready && !loading && !error && dayRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center">
          <p className="text-subhead">
            {isMyList
              ? anilistOn
                ? 'Nothing from your Watching list airs on this day.'
                : 'Sign in with AniList in Settings to see your list.'
              : 'No season releases on this local day.'}
          </p>
        </div>
      ) : null}

      {ready && !loading && !error && dayRows.length > 0 ? (
        <ul className="relative">
          <span
            aria-hidden
            className="absolute top-2 bottom-2 left-[3.25rem] w-px bg-gradient-to-b from-primary/40 via-white/10 to-transparent sm:left-[3.5rem]"
          />
          {dayRows.map((row) => {
            const title = displayTitle(row.media)
            const cover =
              row.media.coverImage?.medium || row.media.coverImage?.large || null
            return (
              <li key={row.id} className="relative">
                <Link
                  href={`/app/anime?id=${row.media.id}`}
                  className="group flex items-start gap-3 py-3 pr-1 text-foreground transition-colors first:pt-1"
                >
                  <time
                    dateTime={new Date(row.airingAt * 1000).toISOString()}
                    className="text-meta w-14 shrink-0 pt-1 text-right font-medium tabular-nums sm:w-16"
                  >
                    {row.local.labelTime}
                  </time>
                  <span
                    aria-hidden
                    className="mt-2.5 size-2 shrink-0 rounded-full bg-primary ring-4 ring-[#141416] transition-transform group-hover:scale-125"
                  />
                  <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-white/8 bg-white/[0.03] transition-colors group-hover:border-primary/35 group-hover:bg-primary/[0.06]">
                    <div className="flex gap-3 p-2.5">
                      <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                        {cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={cover}
                            alt=""
                            className="size-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1 self-center">
                        <div className="text-body truncate font-semibold leading-snug">
                          {title}
                        </div>
                        <div className="text-meta mt-0.5">
                          Episode {row.episode}
                          {row.media.format ? ` · ${row.media.format}` : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
