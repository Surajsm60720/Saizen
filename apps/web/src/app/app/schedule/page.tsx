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
import { isAnilistConnected, isMalConnected } from '@/lib/auth'
import { isCatalogFallback, subscribeCatalogStatus } from '@/lib/catalog'
import {
  isIncognitoMode,
  subscribeIncognitoMode
} from '@/lib/privacy/incognito'
import {
  bucketByLocalWeekday,
  formatWeekRangeLabel,
  getLocalWeekDays,
  localWeekdayIndex,
  type LocalAiring
} from '@/lib/time/airingLocal'
import { cn } from '@/lib/utils'
import { hapticPress } from '@/lib/haptics'
import { rememberCurrentScroll } from '@/lib/nav/scrollMemory'

type Row = AiringScheduleItem & { local: LocalAiring }

export default function SchedulePage() {
  const weekDays = useMemo(() => getLocalWeekDays(), [])
  const [selectedDay, setSelectedDay] = useState(() => localWeekdayIndex())
  const [mode, setMode] = useState<WeekScheduleMode | null>(null)
  const [anilistOn, setAnilistOn] = useState(false)
  const [listOn, setListOn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<AiringScheduleItem[]>([])
  const [incognito, setIncognito] = useState(false)

  useEffect(() => {
    setIncognito(isIncognitoMode())
    return subscribeIncognitoMode(setIncognito)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [al, mal] = await Promise.all([isAnilistConnected(), isMalConnected()])
      if (cancelled) return
      setAnilistOn(al)
      const canList = (al || mal) && !isIncognitoMode()
      setListOn(canList)
      // During AniList outage, default to Season — My list filter needs ID matching
      // and is often empty until MAL list loads.
      const preferSeason = isCatalogFallback() || !canList
      setMode(preferSeason ? 'season' : 'watching')
    })()
    const unsub = subscribeCatalogStatus(() => {
      void (async () => {
        const [al, mal] = await Promise.all([isAnilistConnected(), isMalConnected()])
        if (cancelled) return
        const canList = (al || mal) && !isIncognitoMode()
        setListOn(canList)
        setAnilistOn(al)
      })()
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [incognito])

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
        description={`${weekLabel} · local times`}
      />

      {/* My list / Season */}
      <div
        className="mb-5 grid grid-cols-2 gap-1.5 rounded-xl bg-muted/60 p-1"
        role="tablist"
        aria-label="Schedule source"
      >
        <button
          type="button"
          role="tab"
          aria-selected={isMyList}
          disabled={!listOn || incognito}
          title={
            incognito
              ? 'My list is unavailable in Incognito Mode'
              : listOn
                ? undefined
                : 'Sign in with AniList or MAL to use My list'
          }
          onClick={() => {
            if (incognito || !listOn) return
            setMode('watching')
          }}
          className={cn(
            'min-h-9 rounded-lg px-3 text-sm font-medium transition-colors',
            ready && isMyList
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
            (!listOn || incognito) && 'cursor-not-allowed opacity-45'
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

      {/* Week calendar strip — quiet utility, type + selection only */}
      <div
        className="mb-5 overflow-hidden rounded-2xl border border-white/8 bg-card"
        role="tablist"
        aria-label="Week days"
      >
        <div className="grid grid-cols-7">
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
                onClick={() => {
                  hapticPress('selection')
                  setSelectedDay(i)
                }}
                className={cn(
                  'relative flex min-h-[4.75rem] flex-col items-center justify-center gap-1 px-0.5 py-2.5',
                  'transition-[background-color,transform,color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
                  'active:scale-[0.96] motion-reduce:active:scale-100',
                  active ? 'bg-primary/15' : 'active:bg-white/[0.04]'
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
                    'flex size-8 items-center justify-center font-sans text-base font-semibold tabular-nums leading-none tracking-tight',
                    active && 'text-primary',
                    !active && day.isToday && 'text-primary',
                    !active && !day.isToday && 'text-foreground'
                  )}
                >
                  {day.dateNum}
                </span>
                <span
                  className={cn(
                    'size-1 rounded-full',
                    hasAirings ? (active ? 'bg-primary' : 'bg-muted-foreground/50') : 'bg-transparent'
                  )}
                />
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
              ? listOn
                ? 'Nothing from your Watching list airs on this day.'
                : 'Sign in with AniList or MAL in Settings to see your list.'
              : 'No season releases on this local day.'}
          </p>
        </div>
      ) : null}

      {ready && !loading && !error && dayRows.length > 0 ? (
        <ul>
          {dayRows.map((row) => {
            const title = displayTitle(row.media)
            const cover =
              row.media.coverImage?.medium || row.media.coverImage?.large || null
            return (
              <li key={row.id} className="border-t border-white/[0.06] first:border-t-0">
                <Link
                  href={`/app/anime/?id=${row.media.id}`}
                  scroll={false}
                  onClick={() => rememberCurrentScroll()}
                  className="flex items-center gap-3 py-3 text-foreground active:opacity-80"
                >
                  <time
                    dateTime={new Date(row.airingAt * 1000).toISOString()}
                    className="text-meta w-14 shrink-0 text-right font-medium tabular-nums sm:w-16"
                  >
                    {row.local.labelTime}
                  </time>
                  <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-white/8">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cover}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-body truncate font-medium leading-snug">
                      {title}
                    </div>
                    <div className="text-meta mt-0.5">
                      Episode {row.episode}
                      {row.media.format ? ` · ${row.media.format}` : ''}
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
