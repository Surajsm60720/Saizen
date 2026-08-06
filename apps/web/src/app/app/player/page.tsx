'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SkipTimes } from '@saizen/shared'
import { VideoPlayer } from './VideoPlayer'
import { getWatchSettings } from '@/lib/watch/settings'
import { dispatchPlayerAction } from '@/lib/watch/playerActions'

type LastStream = {
  url: string
  title: string
  episode: number
  anilistId?: number
  idMal?: number | null
  totalEpisodes?: number | null
  resolution?: string
  sourceLabel?: string
  skipTimes?: SkipTimes | null
  autoSkipOpEd?: boolean
  gestureSeekEnabled?: boolean
  doubleTapSeekSec?: number
  tripleTapSeekSec?: number
  autoplayNext?: boolean
  hasNextEpisode?: boolean
}

export default function PlayerPage() {
  const router = useRouter()
  const [stream, setStream] = useState<LastStream | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('saizen:lastStream')
      if (!raw) {
        setError('No stream queued. Play something from an anime page first.')
        return
      }
      const data = JSON.parse(raw) as LastStream
      const settings = getWatchSettings()
      setStream({
        ...data,
        autoSkipOpEd: data.autoSkipOpEd ?? settings.autoSkipOpEd,
        gestureSeekEnabled: data.gestureSeekEnabled ?? settings.gestureSeekEnabled,
        doubleTapSeekSec: data.doubleTapSeekSec ?? settings.doubleTapSeekSec,
        tripleTapSeekSec: data.tripleTapSeekSec ?? settings.tripleTapSeekSec,
        autoplayNext: data.autoplayNext ?? settings.autoplayNext
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  function goAnime(action: 'nextEpisode' | 'changeSource') {
    if (!stream?.anilistId) {
      router.push('/')
      return
    }
    dispatchPlayerAction({
      action,
      anilistId: stream.anilistId,
      episode: stream.episode
    })
    router.push(`/app/anime/?id=${stream.anilistId}`)
  }

  const heading = stream
    ? stream.episode
      ? `${stream.title} · Ep ${stream.episode}`
      : stream.title
    : 'Player'

  return (
    <div className="-mx-4 min-h-[70vh] bg-background sm:-mx-5">
      {error ? (
        <div className="space-y-3 px-4 py-6 sm:px-5">
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            onClick={() => router.push('/')}
          >
            ← Home
          </button>
        </div>
      ) : stream?.url ? (
        <VideoPlayer
          src={stream.url}
          title={heading}
          anilistId={stream.anilistId || undefined}
          episode={stream.episode || undefined}
          idMal={stream.idMal}
          totalEpisodes={stream.totalEpisodes}
          resolution={stream.resolution}
          sourceLabel={stream.sourceLabel}
          skipTimes={stream.skipTimes}
          autoSkipOpEd={stream.autoSkipOpEd}
          gestureSeekEnabled={stream.gestureSeekEnabled}
          doubleTapSeekSec={stream.doubleTapSeekSec}
          tripleTapSeekSec={stream.tripleTapSeekSec}
          autoplayNext={stream.autoplayNext}
          hasNextEpisode={stream.hasNextEpisode}
          onBack={() => {
            if (stream.anilistId) router.push(`/app/anime/?id=${stream.anilistId}`)
            else router.push('/')
          }}
          onNextEpisode={() => goAnime('nextEpisode')}
        />
      ) : null}
    </div>
  )
}
