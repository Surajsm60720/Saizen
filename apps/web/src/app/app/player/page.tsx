'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { VideoPlayer } from './VideoPlayer'

export default function PlayerPage() {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [episode, setEpisode] = useState(0)
  const [anilistId, setAnilistId] = useState(0)
  const [idMal, setIdMal] = useState<number | null>(null)
  const [totalEpisodes, setTotalEpisodes] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('saizen:lastStream')
      if (!raw) {
        setError('No stream queued. Play something from an anime page first.')
        return
      }
      const data = JSON.parse(raw) as {
        url: string
        title: string
        episode: number
        anilistId?: number
        idMal?: number | null
        totalEpisodes?: number | null
      }
      setUrl(data.url)
      setTitle(data.title)
      setEpisode(data.episode)
      setAnilistId(data.anilistId ?? 0)
      setIdMal(data.idMal ?? null)
      setTotalEpisodes(data.totalEpisodes ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const heading = title
    ? episode
      ? `${title} · Ep ${episode}`
      : title
    : 'Player'

  return (
    <div className="mx-auto max-w-5xl space-y-3 px-4 py-4 sm:px-5">
      <Link
        href="/"
        className="inline-flex text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Home
      </Link>
      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{heading}</h1>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : url ? (
        <>
          <VideoPlayer
            src={url}
            title={heading}
            anilistId={anilistId || undefined}
            episode={episode || undefined}
            idMal={idMal}
            totalEpisodes={totalEpisodes}
          />
          <p className="truncate text-xs text-muted-foreground">{url}</p>
          <p className="text-xs text-muted-foreground">
            Space / K play · J / L ±10s · ← → seek · ↑ ↓ volume · M mute · F fullscreen
          </p>
        </>
      ) : null}
    </div>
  )
}
