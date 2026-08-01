'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  fetchAnime,
  displayTitle,
  stripHtml,
  type AnimeMedia
} from '@/lib/anilist'
import {
  ensureExtensions,
  listEnabledExtensions,
  searchExtensions,
  rankScore,
  isLikelyFaster
} from '@/lib/extensions'
import { listProviders, searchAllProviders, type ProviderResult } from '@/lib/providers'
import getNative from '@/lib/native'
import type { TorrentInfo } from '@saizen/shared'
import styles from './page.module.css'

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 KB'
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.round(n / 1024)} KB`
}

function formatRate(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '0 KB/s'
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
  return `${Math.round(bytesPerSec / 1024)} KB/s`
}

function connectingStatus(info: TorrentInfo): string {
  const peers = info.peers?.wires ?? info.peers?.seeders ?? 0
  const down = info.speed?.down ?? 0
  const buffered = info.size?.downloaded ?? 0
  const pct = Math.round(Math.min(1, Math.max(0, info.progress ?? 0)) * 100)
  return `Connecting… ${peers} peers · ${formatRate(down)} · ${formatBytes(buffered)} buffered${pct > 0 ? ` · ${pct}%` : ''}`
}

function AnimeDetail() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const id = Number(searchParams.get('id') || 0)

  const [media, setMedia] = useState<AnimeMedia | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [episode, setEpisode] = useState(1)
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<ProviderResult[]>([])
  const [searchErrors, setSearchErrors] = useState<Array<{ providerId: string; message: string }>>(
    []
  )
  const [playing, setPlaying] = useState(false)
  const [status, setStatus] = useState('')
  const [extNames, setExtNames] = useState<string[]>([])

  const builtins = listProviders()

  useEffect(() => {
    void (async () => {
      if (!id) {
        setError('Invalid anime id')
        setLoading(false)
        return
      }
      setLoading(true)
      setError('')
      try {
        const [, m] = await Promise.all([ensureExtensions(), fetchAnime(id)])
        setExtNames(listEnabledExtensions().map((e) => e.manifest.name))
        if (!m) setError('Anime not found')
        else {
          setMedia(m)
          setEpisode(1)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  const searchSources = useCallback(async () => {
    if (!media) return
    setSearching(true)
    setStatus('')
    setResults([])
    setSearchErrors([])
    try {
      const titles = [
        media.title.romaji,
        media.title.english,
        media.title.native,
        media.title.userPreferred
      ].filter(Boolean) as string[]

      const [extOut, builtInOut] = await Promise.all([
        searchExtensions({ media, episode }),
        searchAllProviders({
          anilistId: media.id,
          title: displayTitle(media),
          titles,
          episode,
          episodeCount: media.episodes
        })
      ])

      const merged = [...extOut.results, ...builtInOut.results]
      const sorted = [...merged].sort((a, b) => rankScore(b) - rankScore(a))
      setResults(sorted)
      setSearchErrors([...extOut.errors, ...builtInOut.errors])
      const magnets = sorted.filter((r) => r.magnet).length
      const torrents = sorted.filter((r) => r.torrentUrl).length
      const http = sorted.filter((r) => r.httpUrl).length
      if (!sorted.length) {
        setStatus(
          'No sources found. Enable extensions under Extensions, or check errors below.'
        )
      } else {
        setStatus(
          `Found ${sorted.length} source(s) (${http} HTTP test, ${torrents} .torrent, ${magnets} magnet). Prefer “Likely faster” / high-seeder .torrent entries.`
        )
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setSearching(false)
    }
  }, [media, episode])

  async function playResult(result: ProviderResult) {
    if (!media) return
    setPlaying(true)
    setStatus(`Starting: ${result.title}`)
    let poll: ReturnType<typeof setInterval> | undefined
    try {
      const native = getNative()
      const source = result.httpUrl || result.torrentUrl || result.magnet
      if (!source) throw new Error('Result has no torrentUrl, magnet, or httpUrl')

      if (native.isApp) {
        poll = setInterval(() => {
          void native.torrentInfo('').then(
            (info) => setStatus(connectingStatus(info)),
            () => {}
          )
        }, 500)
      }

      const files = await native.playTorrent(source, media.id, episode)
      const file = files[0]
      if (!file?.url) throw new Error('playTorrent returned no stream URL')

      setStatus(`Stream ready (${file.playerHint}) — opening player`)
      await native.spawnPlayer({
        url: file.url,
        playerHint: file.playerHint,
        title: displayTitle(media),
        episode
      })

      if (!native.isApp) {
        sessionStorage.setItem(
          'saizen:lastStream',
          JSON.stringify({
            url: file.url,
            title: displayTitle(media),
            episode,
            playerHint: file.playerHint
          })
        )
        router.push('/app/player/')
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    } finally {
      if (poll) clearInterval(poll)
      setPlaying(false)
    }
  }

  if (loading) return <p className="muted">Loading…</p>
  if (error) {
    return (
      <>
        <p style={{ color: 'var(--danger)' }}>{error}</p>
        <Link href="/">← Home</Link>
      </>
    )
  }
  if (!media) return null

  return (
    <>
      <Link className="muted" href="/">
        ← Home
      </Link>
      <div className={styles.detail}>
        {media.coverImage?.large ? (
          <img className={styles.cover} src={media.coverImage.large} alt="" />
        ) : null}
        <div>
          <h1 className={styles.h1}>{displayTitle(media)}</h1>
          <p className="muted">
            {media.format ?? 'ANIME'}
            {media.episodes ? ` · ${media.episodes} eps` : ''}
            {media.averageScore ? ` · ${media.averageScore}%` : ''}
            {media.isAdult ? ' · Adult' : ''}
          </p>
          <p className={styles.desc}>{stripHtml(media.description)}</p>

          <div className={styles.row}>
            <label className={styles.label}>
              Episode
              <input
                className={styles.input}
                type="number"
                min={1}
                max={media.episodes || 999}
                value={episode}
                onChange={(e) => setEpisode(Number(e.target.value) || 1)}
              />
            </label>
            <button className="btn btn-primary" onClick={() => void searchSources()} disabled={searching}>
              {searching ? 'Searching…' : 'Find sources'}
            </button>
          </div>

          <h3>Sources</h3>
          <ul className={styles.providers}>
            {extNames.map((name) => (
              <li key={name}>
                <strong>{name}</strong>
                <span className="muted"> — extension</span>
              </li>
            ))}
            {builtins.map((p) => (
              <li key={p.id}>
                <strong>{p.name}</strong>
                <span className="muted"> — {p.description}</span>
              </li>
            ))}
            {!extNames.length && !builtins.length ? (
              <li className="muted">No sources enabled — open Extensions to turn some on.</li>
            ) : null}
          </ul>
          <p className="muted">
            <Link href="/app/extensions/">Manage extensions</Link>
          </p>

          {searchErrors.length > 0 ? (
            <p className="muted">
              Provider errors:{' '}
              {searchErrors.map((e) => `${e.providerId}: ${e.message}`).join('; ')}
            </p>
          ) : null}

          {status ? <p className={styles.status}>{status}</p> : null}

          {results.length > 0 ? (
            <>
              <h3>Results</h3>
              <ul className={styles.sources}>
                {results.map((r, i) => (
                  <li key={i} className={`card ${styles.source}`}>
                    <div>
                      <div className={styles.srcTitle}>{r.title}</div>
                      <div className={`muted ${styles.tiny}`}>
                        {r.providerName}
                        {r.resolution ? ` · ${r.resolution}` : ''}
                        {r.seeders != null ? ` · ${r.seeders} seeders` : ''}
                        {r.httpUrl ? ' · HTTP test stream' : ''}
                        {r.torrentUrl ? ' · torrent' : ''}
                        {r.magnet ? ' · magnet' : ''}
                        {isLikelyFaster(r, i) ? ' · Likely faster' : ''}
                      </div>
                    </div>
                    <button
                      className="btn btn-primary"
                      disabled={playing}
                      onClick={() => void playResult(r)}
                    >
                      Play
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>
    </>
  )
}

export default function AnimePage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <AnimeDetail />
    </Suspense>
  )
}
