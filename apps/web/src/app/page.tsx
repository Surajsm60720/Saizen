'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  fetchTrending,
  fetchSeasonPopular,
  fetchAllTimePopular,
  currentAniSeason,
  displayTitle,
  type AnimeMedia
} from '@/lib/anilist'
import { subscribeAuthChanged } from '@/lib/auth'
import { whenBridgeReady } from '@/lib/native/ready'
import {
  listContinueWatching,
  subscribeContinueWatching,
  type ContinueEntry
} from '@/lib/watch/continue'
import {
  isIncognitoMode,
  subscribeIncognitoMode
} from '@/lib/privacy/incognito'
import {
  readHomeSnapshot,
  writeHomeSnapshot,
  isHomeFresh,
  subscribeHomeSnapshot
} from '@/lib/home/store'
import { refreshHomePersonalizationSWR } from '@/lib/home/personalize'
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
    <div className="mt-4 flex gap-3.5 overflow-hidden">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="min-w-[10rem] space-y-2">
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
  const [incognito, setIncognito] = useState(false)

  const seasonInfo = useMemo(() => currentAniSeason(), [])
  const seasonLabel = useMemo(() => {
    const { season, year } = seasonInfo
    return `${season.charAt(0)}${season.slice(1).toLowerCase()} ${year}`
  }, [seasonInfo])

  const genreRailTitle =
    topGenres.length > 0 ? `For you · ${topGenres.slice(0, 2).join(' · ')}` : 'For your genres'

  useEffect(() => {
    setIncognito(isIncognitoMode())
    return subscribeIncognitoMode((on) => {
      setIncognito(on)
      if (on) {
        setContinueWatching(listContinueWatching())
        setRelated([])
        setGenrePicks([])
        setTopGenres([])
      } else {
        setContinueWatching(listContinueWatching())
        void refreshHomePersonalizationSWR().catch((e) => {
          console.warn('[saizen] AniList list personalization failed', e)
        })
      }
    })
  }, [])

  useEffect(() => {
    let cancelled = false

    const applyPersonal = async () => {
      if (cancelled || isIncognitoMode()) return
      const snap = readHomeSnapshot()
      const showSkeleton =
        snap.related.length === 0 && snap.genrePicks.length === 0
      if (showSkeleton) setListLoading(true)
      try {
        const result = await refreshHomePersonalizationSWR()
        if (cancelled) return
        setAnilistOn(result.anilistOn)
        setContinueWatching(result.continueWatching)
        setRelated(result.related)
        setTopGenres(result.topGenres)
        setGenrePicks(result.genrePicks)
      } catch (e) {
        console.warn('[saizen] AniList list personalization failed', e)
      } finally {
        if (!cancelled) setListLoading(false)
      }
    }

    const unsubContinue = subscribeContinueWatching((entries) => {
      setContinueWatching(entries)
    })
    const unsubHome = subscribeHomeSnapshot((snap) => {
      if (snap.continueWatching) setContinueWatching(snap.continueWatching)
      if (snap.related) setRelated(snap.related)
      if (snap.genrePicks) setGenrePicks(snap.genrePicks)
      if (snap.topGenres) setTopGenres(snap.topGenres)
      setAnilistOn(snap.anilistOn)
    })
    // Keychain hydrate / sign-in / Settings list refresh → reload personalized rails.
    const unsubAuth = subscribeAuthChanged(() => {
      void applyPersonal()
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

    // Keep-alive / back-nav: skip public refetch, but always (re)check personalization
    // after the bridge — isHomeFresh used to skip this and left rails empty until Settings.
    if (isHomeFresh()) {
      setContinueWatching(listContinueWatching())
      setLoading(false)
      void whenBridgeReady().then(() => applyPersonal())
      return () => {
        cancelled = true
        unsubContinue()
        unsubHome()
        unsubAuth()
      }
    }

    void (async () => {
      try {
        // Public rails don't need the native bridge — start immediately.
        const publicP = Promise.all([
          fetchTrending(),
          fetchSeasonPopular(),
          fetchAllTimePopular()
        ])
        // Personalization waits only on bridge; runs in parallel with public rails.
        const personalP = whenBridgeReady().then(() => applyPersonal())

        const [t, s, a] = await publicP
        if (cancelled) return

        setTrending(t)
        setSeasonal(s)
        setAllTime(a)
        setLoading(false)
        writeHomeSnapshot({
          trending: t,
          seasonal: s,
          allTime: a,
          ready: true
        })

        await personalP
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
      unsubAuth()
    }
  }, [])

  const heroItems = useMemo(() => {
    const contIds = incognito
      ? new Set<number>()
      : new Set(continueWatching.map((c) => c.anilistId))
    const fromContinue = trending.filter((m) => contIds.has(m.id))
    const merged = [...fromContinue, ...trending, ...seasonal]
    const seen = new Set<number>()
    return merged.filter((m) => {
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })
  }, [trending, seasonal, continueWatching, incognito])

  return (
    <div>
      {loading ? (
        <div className="relative h-[min(70vh,620px)] min-h-[380px] overflow-hidden bg-background">
          <div
            className="absolute inset-x-0 bottom-0 flex flex-col justify-end px-4 pb-6 sm:px-5"
            style={{ paddingTop: 'calc(var(--safe-top) + 4.75rem)' }}
          >
            <Skeleton className="h-8 w-2/3 max-w-xs bg-white/10" />
            <Skeleton className="mt-2 h-3 w-1/2 max-w-sm bg-white/10" />
          </div>
        </div>
      ) : (
        <HeroCarousel items={heroItems} />
      )}

      <div className="px-4 pt-0 sm:px-5">
        {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

        {loading ? (
          <>
            <RailSkeleton />
            <RailSkeleton />
          </>
        ) : (
          <>
            {incognito ? (
              continueWatching.length > 0 ? (
                <PosterRail title="This session" className="!mt-4">
                  {continueWatching.map((entry) => (
                    <ContinueCard key={entry.anilistId} entry={entry} />
                  ))}
                </PosterRail>
              ) : (
                <HomePlaceholderRail
                  title="Incognito"
                  description="Nothing here is tracked on AniList, MAL, or your main Home. Session resume clears when you leave Incognito."
                  ctaHref="/app/search/"
                  ctaLabel="Find something to watch"
                  className="!mt-4"
                />
              )
            ) : continueWatching.length > 0 ? (
              <PosterRail title="Continue watching" className="!mt-4">
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
                className="!mt-4"
              />
            )}

            <PosterRail
              title={`Popular · ${seasonLabel}`}
              viewMoreHref="/app/search/"
              viewMorePreset={{
                season: seasonInfo.season,
                seasonYear: seasonInfo.year,
                sort: 'POPULARITY_DESC'
              }}
            >
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

            <PosterRail
              title="Trending now"
              viewMoreHref="/app/search/"
              viewMorePreset={{ sort: 'TRENDING_DESC' }}
            >
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

            {!incognito && listLoading && related.length === 0 ? (
              <RailSkeleton />
            ) : !incognito && related.length > 0 ? (
              <PosterRail title="Prequels & sequels">
                {related.map(({ media, relationType }) => (
                  <PosterCard
                    key={media.id}
                    size="lg"
                    href={`/app/anime/?id=${media.id}`}
                    image={media.coverImage?.large ?? media.coverImage?.medium}
                    title={displayTitle(media)}
                    score={media.averageScore}
                    format={relationType.replaceAll('_', ' ')}
                    year={media.seasonYear}
                  />
                ))}
              </PosterRail>
            ) : !incognito ? (
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
            ) : null}

            {!incognito && listLoading && genrePicks.length === 0 ? (
              <RailSkeleton />
            ) : !incognito && genrePicks.length > 0 ? (
              <PosterRail
                title={genreRailTitle}
                viewMoreHref="/app/search/"
                viewMorePreset={{
                  genres: topGenres,
                  sort: 'POPULARITY_DESC',
                  listMembership: 'out'
                }}
              >
                {genrePicks.map((media) => (
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
            ) : !incognito ? (
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
            ) : null}

            <PosterRail
              title="Popular of all time"
              viewMoreHref="/app/search/"
              viewMorePreset={{ sort: 'SCORE_DESC' }}
            >
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
