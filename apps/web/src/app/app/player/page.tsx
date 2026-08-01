'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { VideoPlayer } from './VideoPlayer'
import styles from './page.module.css'

export default function PlayerPage() {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [episode, setEpisode] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('saizen:lastStream')
      if (!raw) {
        setError('No stream queued. Play something from an anime page first.')
        return
      }
      const data = JSON.parse(raw) as { url: string; title: string; episode: number }
      setUrl(data.url)
      setTitle(data.title)
      setEpisode(data.episode)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }

    // Native playback owns cleanup via player dismiss → stopAndPurge.
    // Do not call deleteTorrents on unmount (React Strict Mode remounts would
    // kill a live stream mid-play).
  }, [])

  const heading = title
    ? episode
      ? `${title} · Ep ${episode}`
      : title
    : 'Player'

  return (
    <>
      <Link className="muted" href="/">
        ← Home
      </Link>
      <h1 className={styles.h1}>{heading}</h1>

      {error ? (
        <p style={{ color: 'var(--danger)' }}>{error}</p>
      ) : url ? (
        <>
          <VideoPlayer src={url} title={heading} />
          <p className={`muted ${styles.tiny}`}>{url}</p>
          <p className={`muted ${styles.hint}`}>
            Space / K play · J / L ±10s · ← → seek · ↑ ↓ volume · M mute · F fullscreen
          </p>
        </>
      ) : null}
    </>
  )
}
