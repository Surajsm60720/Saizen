'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  fetchTrending,
  fetchSeasonPopular,
  fetchAllTimePopular,
  currentAniSeason,
  displayTitle,
  fetchViewerAnimeList,
  fetchGenrePopular,
  derivePrequelsSequels,
  deriveTopGenres,
  continueEntriesFromList,
  type AnimeMedia
} from '@/lib/anilist'
import { isAnilistConnected } from '@/lib/auth'
import { whenBridgeReady } from '@/lib/native/ready'
import {
  listContinueWatching,
  mergeContinueWatching,
  subscribeContinueWatching,
  type ContinueEntry
} from '@/lib/watch/continue'
import {
  readHomeSnapshot,
  writeHomeSnapshot,
  isHomeFresh,
  subscribeHomeSnapshot
} from '@/lib/home/store'
import {
  PosterCard,
  PosterRail,
  HeroCarousel,
  ContinueCard,
  HomePlaceholderRail
} from '@/components/saizen'
import { Skeleton } from '@/components/ui/skeleton'

function RailSkeleton() {
  return (
    <div className="mt-8 flex gap-3.5 overflow-hidden">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="min-w-[9.5rem] space-y-2">
          <Skeleton className="aspect-[2/3] w-full rounded-xl" />
          <Skeleton className="h-4 w-[80%]" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}

export default function HomePage() {
  // Empty first paint — avoids Capacitor hydration mismatch (#418) from localStorage.
  const [trending, setTrending] = useState<AnimeMedia[]>([])
  const [seasonal, setSeasonal] = useState<AnimeMedia[]>([])
  const [allTime, setAllTime] = useState<AnimeMedia[]>([])
  const [continueWatching, setContinueWatching] = useState<ContinueEntry[]>([])
  const [related, setRelated] = useState<
    Array<{ media: AnimeMedia; relationType: string }>
  >([])
  const [genrePicks, setGenrePicks] = useState<AnimeMedia[]>([])
  const [topGenres, setTopGenres] = useState<string[]>([])
  const [anilistOn, setAnilistOn] = useState(false)
  const [listLoading, setListLoading] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const seasonLabel = useMemo(() => {
    const { season, year } = currentAniSeason()
    return `${season.charAt(0)}${season.slice(1).toLowerCase()} ${year}`
  }, [])

  useEffect(() => {
    const unsubContinue = subscribeContinueWatching((entries) => {
      setContinueWatching(entries)
    })
    const unsubHome = subscribeHomeSnapshot((snap) => {
      if (snap.continueWatching) setContinueWatching(snap.continueWatching)
      if (snap.related) setRelated(snap.related)
      if (snap.genrePicks) setGenrePicks(snap.genrePicks)
      if (snap.topGenres) setTopGenres(snap.topGenres)
    })

    // Hydrate from snapshot after mount (client-only).
    const initial = readHomeSnapshot()
    setTrending(initial.trending)
    setSeasonal(initial.seasonal)
    setAllTime(initial.allTime)
    setContinueWatching(initial.continueWatching)
    setRelated(initial.related)
    setGenrePicks(initial.genrePicks)
    setTopGenres(initial.topGenres)
    setAnilistOn(initial.anilistOn)
    if (initial.ready) setLoading(false)

    // Keep-alive / back-nav: don't refetch if we just loaded Home
    if (isHomeFresh()) {
      setContinueWatching(listContinueWatching())
      setLoading(false)
      return () => {
        unsubContinue()
        unsubHome()
      }
    }

    let cancelled = false
    const hadData = initial.ready

    void (async () => {
      try {
        const publicP = Promise.all([
          fetchTrending(),
          fetchSeasonPopular(),
          fetchAllTimePopular()
        ])
        const bridgeP = whenBridgeReady().then(() => isAnilistConnected())

        const [[t, s, a], connected] = await Promise.all([publicP, bridgeP])
        if (cancelled) return

        setTrending(t)
        setSeasonal(s)
        setAllTime(a)
        setAnilistOn(connected)
        setLoading(false)
        writeHomeSnapshot({
          trending: t,
          seasonal: s,
          allTime: a,
          anilistOn: connected,
          ready: true
        })

        if (connected) {
          if (!hadData || !readHomeSnapshot().related.length) {
            setListLoading(true)
          }
          try {
            const entries = await fetchViewerAnimeList(
              ['CURRENT', 'REPEATING', 'COMPLETED', 'PAUSED'],
              { force: true }
            )
            if (cancelled) return
            const fromList = continueEntriesFromList(entries)
            const cont = mergeContinueWatching(fromList)
            const rel = derivePrequelsSequels(entries)
            const genres = deriveTopGenres(entries, 3)
            setContinueWatching(cont)
            setRelated(rel)
            setTopGenres(genres)

            let picks: AnimeMedia[] = []
            if (genres.length) {
              const onList = new Set(entries.map((e) => e.media.id))
              picks = (await fetchGenrePopular(genres, 24))
                .filter((m) => !onList.has(m.id))
                .slice(0, 18)
            }
            if (!cancelled) {
              setGenrePicks(picks)
              writeHomeSnapshot({
                continueWatching: cont,
                related: rel,
                topGenres: genres,
                genrePicks: picks,
                anilistOn: true
              })
            }
          } catch (e) {
            console.warn('[saizen] AniList list personalization failed', e)
          } finally {
            if (!cancelled) setListLoading(false)
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      unsubContinue()
      unsubHome()
    }
  }, [])

  const heroItems = useMemo(() => {
    const contIds = new Set(continueWatching.map((c) => c.anilistId))
    const fromContinue = trending.filter((m) => contIds.has(m.id))
    const merged = [...fromContinue, ...trending, ...seasonal]
    const seen = new Set<number>()
    return merged.filter((m) => {
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })
  }, [trending, seasonal, continueWatching])

  const genreRailTitle =
    topGenres.length > 0 ? `For you · ${topGenres.slice(0, 2).join(' · ')}` : 'For your genres'

  return (
    <div>
      {loading ? (
        <div className="relative h-[min(48vh,420px)] min-h-[300px] overflow-hidden bg-[#141416]">
          <div
            className="absolute inset-x-0 bottom-0 flex flex-col justify-end px-4 pb-5 sm:px-5"
            style={{ paddingTop: 'calc(var(--safe-top) + 4.75rem)' }}
          >
            <Skeleton className="h-8 w-2/3 max-w-xs bg-white/10" />
            <Skeleton className="mt-2 h-3 w-1/2 max-w-sm bg-white/10" />
          </div>
        </div>
      ) : (
        <HeroCarousel items={heroItems} />
      )}

      <div className="px-4 pt-2 sm:px-5">
        {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

        {loading ? (
          <>
            <RailSkeleton />
            <RailSkeleton />
          </>
        ) : (
          <>
            {continueWatching.length > 0 ? (
              <PosterRail title="Continue watching">
                {continueWatching.map((entry) => (
                  <ContinueCard key={entry.anilistId} entry={entry} />
                ))}
              </PosterRail>
            ) : (
              <HomePlaceholderRail
                title="Continue watching"
                description={
                  anilistOn
                    ? 'No CURRENT shows on your AniList yet — start watching or mark something as watching.'
                    : 'Titles you start will show up here so you can jump back into the next episode.'
                }
                ctaHref={anilistOn ? '/app/search/' : '/app/settings/'}
                ctaLabel={anilistOn ? 'Find something to watch' : 'Connect AniList'}
              />
            )}

            <PosterRail title={`Popular · ${seasonLabel}`}>
              {seasonal.map((media) => (
                <PosterCard
                  key={media.id}
                  size="lg"
                  href={`/app/anime/?id=${media.id}`}
                  image={media.coverImage?.large}
                  title={displayTitle(media)}
                  score={media.averageScore}
                  format={media.format}
                  year={media.seasonYear}
                />
              ))}
            </PosterRail>

            <PosterRail title="Trending now">
              {trending.map((media) => (
                <PosterCard
                  key={media.id}
                  size="lg"
                  href={`/app/anime/?id=${media.id}`}
                  image={media.coverImage?.large}
                  title={displayTitle(media)}
                  score={media.averageScore}
                  format={media.format}
                  year={media.seasonYear}
                />
              ))}
            </PosterRail>

            {listLoading && related.length === 0 ? (
              <RailSkeleton />
            ) : related.length > 0 ? (
              <PosterRail title="Prequels & sequels" dense>
                {related.map(({ media, relationType }) => (
                  <PosterCard
                    key={media.id}
                    size="md"
                    href={`/app/anime/?id=${media.id}`}
                    image={media.coverImage?.large ?? media.coverImage?.medium}
                    title={displayTitle(media)}
                    score={media.averageScore}
                    format={relationType.replaceAll('_', ' ')}
                    year={media.seasonYear}
                  />
                ))}
              </PosterRail>
            ) : (
              <HomePlaceholderRail
                title="Prequels & sequels"
                description={
                  anilistOn
                    ? 'No related titles found from your list yet. Add more CURRENT/COMPLETED shows on AniList.'
                    : 'When AniList is connected, we’ll surface prequels and sequels for shows on your list.'
                }
                ctaHref="/app/settings/"
                ctaLabel={anilistOn ? 'Refresh after updating list' : 'Connect AniList'}
              />
            )}

            {listLoading && genrePicks.length === 0 ? (
              <RailSkeleton />
            ) : genrePicks.length > 0 ? (
              <PosterRail title={genreRailTitle} dense>
                {genrePicks.map((media) => (
                  <PosterCard
                    key={media.id}
                    size="md"
                    href={`/app/anime/?id=${media.id}`}
                    image={media.coverImage?.large}
                    title={displayTitle(media)}
                    score={media.averageScore}
                    format={media.format}
                    year={media.seasonYear}
                  />
                ))}
              </PosterRail>
            ) : (
              <HomePlaceholderRail
                title="For your genres"
                description={
                  anilistOn
                    ? 'Need a few scored genres on your AniList list to personalize this rail.'
                    : 'Personalized genre picks land here after AniList sync — based on what you watch most.'
                }
                ctaHref="/app/settings/"
                ctaLabel={anilistOn ? 'Open Settings' : 'Connect AniList'}
              />
            )}

            <PosterRail title="Popular of all time">
              {allTime.map((media) => (
                <PosterCard
                  key={media.id}
                  size="lg"
                  href={`/app/anime/?id=${media.id}`}
                  image={media.coverImage?.large}
                  title={displayTitle(media)}
                  score={media.averageScore}
                  format={media.format}
                  year={media.seasonYear}
                />
              ))}
            </PosterRail>
          </>
        )}
      </div>
    </div>
  )
}
