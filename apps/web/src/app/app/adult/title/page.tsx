'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { AdultEpisode, StreamCandidate } from '@saizen/shared'
import { AdultModeGate, AnimeHeader } from '@/components/saizen'
import { Button } from '@/components/ui/button'
import { getNative } from '@/lib/native'
import { whenBridgeReady } from '@/lib/native/ready'
import { isAdultModeOn, subscribeAdultMode } from '@/lib/privacy/adult'
import { getWatchSettings } from '@/lib/watch/settings'
import { isIncognitoMode } from '@/lib/privacy/incognito'
import { toast } from 'sonner'

function episodeLabel(ep: AdultEpisode, index: number): string {
  const n = ep.number ?? ep.episode
  if (n != null && String(n).trim()) return `Episode ${n}`
  if (typeof ep.title === 'string' && ep.title.trim()) return ep.title.trim()
  return `Episode ${index + 1}`
}

function episodeUrl(ep: AdultEpisode): string | null {
  const u = ep.url
  return typeof u === 'string' && u.trim() ? u.trim() : null
}

function mediaIdFromShowUrl(url: string): number {
  let h = 0
  for (let i = 0; i < url.length; i++) h = (Math.imul(31, h) + url.charCodeAt(i)) | 0
  const n = Math.abs(h)
  return n === 0 ? 1 : n
}

function episodeNumber(ep: AdultEpisode, index: number): number {
  const n = ep.number ?? ep.episode
  const parsed = typeof n === 'number' ? n : Number(n)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : index + 1
}

function AdultTitleInner() {
  const params = useSearchParams()
  const moduleId = params.get('moduleId')?.trim() || ''
  const showUrl = params.get('showUrl')?.trim() || ''
  const title = params.get('title')?.trim() || 'Title'
  const image = params.get('image')?.trim() || ''

  const [episodes, setEpisodes] = useState<AdultEpisode[]>([])
  const [loading, setLoading] = useState(true)
  const [busyEp, setBusyEp] = useState<string | null>(null)
  const [saveEp, setSaveEp] = useState<string | null>(null)
  const [error, setError] = useState('')

  const canLoad = Boolean(moduleId && showUrl)

  const load = useCallback(async () => {
    if (!isAdultModeOn() || !canLoad) return
    setLoading(true)
    setError('')
    try {
      await whenBridgeReady()
      const native = getNative()
      if (!native.adultExtractEpisodes) {
        setError('Episode list requires the iOS app')
        setEpisodes([])
        return
      }
      const { episodes: eps } = await native.adultExtractEpisodes({
        moduleId,
        showUrl,
        allowNsfw: true
      })
      setEpisodes(Array.isArray(eps) ? eps : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setEpisodes([])
    } finally {
      setLoading(false)
    }
  }, [canLoad, moduleId, showUrl])

  useEffect(() => {
    void load()
    return subscribeAdultMode((on) => {
      if (on) void load()
    })
  }, [load])

  const watch = useMemo(() => getWatchSettings(), [])

  const firstPlayable = useMemo(() => {
    for (let i = 0; i < episodes.length; i++) {
      if (episodeUrl(episodes[i])) return { ep: episodes[i], index: i }
    }
    return null
  }, [episodes])

  async function playEpisode(ep: AdultEpisode, index: number) {
    const url = episodeUrl(ep)
    if (!url) {
      toast.error('Episode has no URL')
      return
    }
    const native = getNative()
    if (!native.adultExtractStreams || !native.playStream) {
      toast.error('Playback requires the iOS app')
      return
    }
    setBusyEp(url)
    try {
      await whenBridgeReady()
      const { candidates } = await native.adultExtractStreams({
        moduleId,
        episodeUrl: url,
        allowNsfw: true
      })
      const list = Array.isArray(candidates) ? candidates : []
      const pick: StreamCandidate | undefined = list[0]
      if (!pick?.url) {
        toast.error('No stream candidates')
        return
      }
      await native.playStream({
        url: pick.url,
        headers: pick.headers,
        title: `${title} · ${episodeLabel(ep, index)}`,
        subtitle: pick.subtitle,
        playerHint: pick.kind === 'hls' ? 'vlc' : 'avplayer',
        autoSkipOpEd: watch.autoSkipOpEd,
        gestureSeekEnabled: watch.gestureSeekEnabled,
        doubleTapSeekSec: watch.doubleTapSeekSec,
        tripleTapSeekSec: watch.tripleTapSeekSec
      })
      if (native.recordModuleSuccess) {
        try {
          await native.recordModuleSuccess({ moduleId, anilistId: 0 })
        } catch {
          /* optional */
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyEp(null)
    }
  }

  async function saveEpisode(ep: AdultEpisode, index: number) {
    const url = episodeUrl(ep)
    if (!url) {
      toast.error('Episode has no URL')
      return
    }
    const native = getNative()
    if (!native.adultExtractStreams || !native.enqueueDownload) {
      toast.error('Downloads require the iOS app')
      return
    }
    setSaveEp(url)
    try {
      await whenBridgeReady()
      const { candidates } = await native.adultExtractStreams({
        moduleId,
        episodeUrl: url,
        allowNsfw: true
      })
      const pick = (Array.isArray(candidates) ? candidates : [])[0]
      if (!pick?.url) {
        toast.error('No stream candidates')
        return
      }
      await native.enqueueDownload({
        source: pick.url,
        kind: pick.kind === 'hls' ? 'hls' : 'http',
        headers: pick.headers,
        mediaId: mediaIdFromShowUrl(showUrl),
        episode: episodeNumber(ep, index),
        seriesTitle: title,
        episodeTitle: episodeLabel(ep, index),
        resolution: pick.quality,
        sourceLabel: pick.title || pick.quality || moduleId,
        seasonLabel: 'Adult',
        isIncognito: isIncognitoMode(),
        isAdult: true
      })
      toast.success('Queued for download')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaveEp(null)
    }
  }

  return (
    <AdultModeGate>
      <AnimeHeader
        title={title}
        cover={image || null}
        banner={image || null}
        status="Adult"
        source={moduleId || null}
        episodes={!loading && episodes.length > 0 ? episodes.length : null}
        meta={moduleId || undefined}
        continueEpisode={
          firstPlayable ? episodeNumber(firstPlayable.ep, firstPlayable.index) : null
        }
        onContinueWatching={
          firstPlayable
            ? () => void playEpisode(firstPlayable.ep, firstPlayable.index)
            : null
        }
      />

      <div className="mt-2">
        <Link
          href="/app/adult/"
          className="text-sm text-primary underline-offset-2 hover:underline"
        >
          ← Adult home
        </Link>
      </div>

      {!canLoad ? (
        <p className="mt-4 text-sm text-destructive">Missing moduleId or showUrl.</p>
      ) : null}
      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      {loading ? <p className="mt-4 text-sm text-muted-foreground">Loading episodes…</p> : null}

      <section className="mt-6 space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Episodes
        </h2>
        <ul className="space-y-2">
          {episodes.map((ep, i) => {
            const url = episodeUrl(ep)
            return (
              <li
                key={url ?? `${i}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/50 px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{episodeLabel(ep, i)}</div>
                  {typeof ep.title === 'string' && ep.number != null ? (
                    <div className="truncate text-xs text-muted-foreground">{ep.title}</div>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!url || saveEp === url}
                    onClick={() => void saveEpisode(ep, i)}
                  >
                    {saveEp === url ? '…' : 'Save'}
                  </Button>
                  <Button
                    size="sm"
                    disabled={!url || busyEp === url}
                    onClick={() => void playEpisode(ep, i)}
                  >
                    {busyEp === url ? '…' : 'Play'}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      {!loading && canLoad && episodes.length === 0 && !error ? (
        <p className="mt-4 text-sm text-muted-foreground">No episodes returned.</p>
      ) : null}
    </AdultModeGate>
  )
}

export default function AdultTitlePage() {
  return (
    <Suspense
      fallback={
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</div>
      }
    >
      <AdultTitleInner />
    </Suspense>
  )
}
