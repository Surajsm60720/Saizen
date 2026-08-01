'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './VideoPlayer.module.css'

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2]

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function VideoPlayer({
  src,
  title
}: {
  src: string
  title?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  const [seeking, setSeeking] = useState(false)
  const [chrome, setChrome] = useState(true)
  const [fs, setFs] = useState(false)
  const [error, setError] = useState('')

  const clearHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }

  const scheduleHide = useCallback(() => {
    clearHide()
    const v = videoRef.current
    if (!v || v.paused) return
    hideTimer.current = setTimeout(() => setChrome(false), 3200)
  }, [])

  const showChrome = useCallback(
    (persistent = false) => {
      setChrome(true)
      if (!persistent) scheduleHide()
      else clearHide()
    },
    [scheduleHide]
  )

  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const onPlay = () => {
      setPlaying(true)
      scheduleHide()
    }
    const onPause = () => {
      setPlaying(false)
      showChrome(true)
    }
    const onTime = () => {
      if (!seeking) setCurrent(v.currentTime)
    }
    const onMeta = () => setDuration(v.duration || 0)
    const onProgress = () => {
      if (v.buffered.length > 0) {
        setBuffered(v.buffered.end(v.buffered.length - 1))
      }
    }
    const onVol = () => {
      setVolume(v.volume)
      setMuted(v.muted)
    }
    const onErr = () => {
      setError(v.error?.message || 'Playback failed')
    }
    const onFs = () => setFs(Boolean(document.fullscreenElement))

    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('durationchange', onMeta)
    v.addEventListener('progress', onProgress)
    v.addEventListener('volumechange', onVol)
    v.addEventListener('error', onErr)
    document.addEventListener('fullscreenchange', onFs)

    return () => {
      clearHide()
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('durationchange', onMeta)
      v.removeEventListener('progress', onProgress)
      v.removeEventListener('volumechange', onVol)
      v.removeEventListener('error', onErr)
      document.removeEventListener('fullscreenchange', onFs)
    }
  }, [scheduleHide, seeking, showChrome])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = videoRef.current
      if (!v) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault()
          if (v.paused) void v.play()
          else v.pause()
          break
        case 'arrowleft':
        case 'j':
          e.preventDefault()
          v.currentTime = Math.max(0, v.currentTime - 10)
          showChrome()
          break
        case 'arrowright':
        case 'l':
          e.preventDefault()
          v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 10)
          showChrome()
          break
        case 'arrowup':
          e.preventDefault()
          v.volume = Math.min(1, v.volume + 0.05)
          showChrome()
          break
        case 'arrowdown':
          e.preventDefault()
          v.volume = Math.max(0, v.volume - 0.05)
          showChrome()
          break
        case 'm':
          v.muted = !v.muted
          showChrome()
          break
        case 'f':
          void toggleFullscreen()
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showChrome])

  async function toggleFullscreen() {
    const root = rootRef.current
    if (!root) return
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await root.requestFullscreen()
    }
    showChrome()
  }

  function togglePlay() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) void v.play()
    else v.pause()
  }

  function seekBy(delta: number) {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta))
    showChrome()
  }

  function onScrubInput(value: number) {
    setSeeking(true)
    setCurrent(value)
    showChrome(true)
  }

  function onScrubCommit(value: number) {
    const v = videoRef.current
    if (v) v.currentTime = value
    setSeeking(false)
    scheduleHide()
  }

  function cycleRate() {
    const v = videoRef.current
    if (!v) return
    const i = RATES.indexOf(rate)
    const next = RATES[(i + 1) % RATES.length] ?? 1
    v.playbackRate = next
    setRate(next)
    showChrome()
  }

  const bufferPct = duration > 0 ? (buffered / duration) * 100 : 0
  const playPct = duration > 0 ? (current / duration) * 100 : 0

  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${chrome ? styles.chromeOn : styles.chromeOff} ${fs ? styles.fs : ''}`}
      onMouseMove={() => showChrome()}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(`.${styles.bar}`)) return
        if (chrome) {
          if (playing) setChrome(false)
        } else {
          showChrome(!playing)
        }
      }}
    >
      <video
        ref={videoRef}
        className={styles.video}
        src={src}
        autoPlay
        playsInline
        preload="auto"
        onClick={(e) => {
          e.stopPropagation()
          togglePlay()
        }}
      />

      {title ? <div className={styles.title}>{title}</div> : null}

      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.bar} onClick={(e) => e.stopPropagation()}>
        <div className={styles.seekWrap}>
          <div className={styles.buffer} style={{ width: `${bufferPct}%` }} />
          <div className={styles.played} style={{ width: `${playPct}%` }} />
          <input
            className={styles.seek}
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={current}
            aria-label="Seek"
            onChange={(e) => onScrubInput(Number(e.target.value))}
            onMouseUp={(e) => onScrubCommit(Number((e.target as HTMLInputElement).value))}
            onTouchEnd={(e) => onScrubCommit(Number((e.target as HTMLInputElement).value))}
            onKeyUp={(e) => onScrubCommit(Number((e.target as HTMLInputElement).value))}
          />
        </div>

        <div className={styles.row}>
          <div className={styles.left}>
            <button type="button" className={styles.icon} onClick={() => seekBy(-10)} aria-label="Back 10s">
              −10
            </button>
            <button
              type="button"
              className={styles.iconPrimary}
              onClick={togglePlay}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? '❚❚' : '▶'}
            </button>
            <button type="button" className={styles.icon} onClick={() => seekBy(10)} aria-label="Forward 10s">
              +10
            </button>
            <span className={styles.time}>
              {formatTime(current)} / {formatTime(duration)}
            </span>
          </div>

          <div className={styles.right}>
            <button type="button" className={styles.chip} onClick={cycleRate} aria-label="Playback speed">
              {rate === 1 ? '1×' : `${rate}×`}
            </button>
            <button
              type="button"
              className={styles.chip}
              onClick={() => {
                const v = videoRef.current
                if (v) v.muted = !v.muted
              }}
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted || volume === 0 ? 'Muted' : 'Vol'}
            </button>
            <input
              className={styles.vol}
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              aria-label="Volume"
              onChange={(e) => {
                const v = videoRef.current
                if (!v) return
                const next = Number(e.target.value)
                v.muted = next === 0
                v.volume = next
                showChrome()
              }}
            />
            <button type="button" className={styles.chip} onClick={() => void toggleFullscreen()}>
              {fs ? 'Exit' : 'Full'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
