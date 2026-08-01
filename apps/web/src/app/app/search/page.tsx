'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { searchAnime, displayTitle, type AnimeMedia } from '@/lib/anilist'
import { ensureExtensions, hasAdultExtensionsEnabled } from '@/lib/extensions'
import styles from './page.module.css'

export default function SearchPage() {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<AnimeMedia[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [includeAdult, setIncludeAdult] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    void ensureExtensions().then(() => {
      setIncludeAdult(hasAdultExtensionsEnabled())
    })
  }, [])

  async function run(e?: React.FormEvent) {
    e?.preventDefault()
    if (!term.trim()) return
    setLoading(true)
    setError('')
    try {
      setResults(await searchAnime(term.trim(), 1, { includeAdult }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h1 className={styles.h1}>Search</h1>
      <form className={styles.row} onSubmit={(e) => void run(e)}>
        <input
          ref={inputRef}
          className={styles.input}
          placeholder="Romaji / English / Japanese title"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? '…' : 'Search'}
        </button>
      </form>
      {includeAdult ? (
        <p className="muted" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
          Adult titles included (hentai extension enabled).
        </p>
      ) : null}

      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}

      <div className="grid" style={{ marginTop: '1.25rem' }}>
        {results.map((media) => (
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
            </div>
          </Link>
        ))}
      </div>
    </>
  )
}
