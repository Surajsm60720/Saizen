'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchTrending, fetchPopular, displayTitle, type AnimeMedia } from '@/lib/anilist'
import styles from './page.module.css'

export default function HomePage() {
  const [trending, setTrending] = useState<AnimeMedia[]>([])
  const [popular, setPopular] = useState<AnimeMedia[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const [t, p] = await Promise.all([fetchTrending(), fetchPopular()])
        setTrending(t)
        setPopular(p)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <>
      <h1 className={styles.h1}>Home</h1>
      <p className="muted">
        Minimal test UI — pick an anime, choose an episode, pick a torrent provider, stream via native
        loopback HTTP.
      </p>

      {loading ? (
        <p className="muted">Loading AniList…</p>
      ) : error ? (
        <p style={{ color: 'var(--danger)' }}>{error}</p>
      ) : (
        <>
          <section>
            <h2 className={styles.h2}>Trending</h2>
            <div className="grid">
              {trending.map((media) => (
                <Link
                  key={media.id}
                  className={`card ${styles.poster}`}
                  href={`/app/anime/?id=${media.id}`}
                >
                  {media.coverImage?.large ? (
                    <img src={media.coverImage.large} alt={displayTitle(media)} loading="lazy" />
                  ) : null}
                  <div className={styles.meta}>
                    <strong>{displayTitle(media)}</strong>
                    <span className="muted">
                      {media.averageScore ? `${media.averageScore}%` : '—'} · {media.format ?? ''}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <h2 className={styles.h2}>Popular</h2>
            <div className="grid">
              {popular.map((media) => (
                <Link
                  key={media.id}
                  className={`card ${styles.poster}`}
                  href={`/app/anime/?id=${media.id}`}
                >
                  {media.coverImage?.large ? (
                    <img src={media.coverImage.large} alt={displayTitle(media)} loading="lazy" />
                  ) : null}
                  <div className={styles.meta}>
                    <strong>{displayTitle(media)}</strong>
                    <span className="muted">
                      {media.seasonYear ?? ''} · {media.format ?? ''}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  )
}
