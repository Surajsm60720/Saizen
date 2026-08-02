'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play, Volume2, VolumeX, Maximize, Minimize } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { recordProbedDuration } from '@/lib/watch/episodeMeta'
import { updateWatchProgress } from '@/lib/watch/progress'

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
  title,
  anilistId,
  episode,
  idMal,
  totalEpisodes
}: {
  src: string
  title?: string
  anilistId?: number
  episode?: number
  idMal?: number | null
  totalEpisodes?: number | null
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
  const lastPersist = useRef(0)

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
      if (!anilistId || !episode) return
      const now = Date.now()
      if (now - lastPersist.current < 2000) return
      const d = v.duration || 0
      if (d < 30) return
      lastPersist.current = now
      updateWatchProgress({
        anilistId,
        idMal,
        episode,
        positionSec: v.currentTime,
        durationSec: d,
        totalEpisodes
      })
    }
    const onMeta = () => {
      const d = v.duration || 0
      setDuration(d)
      if (anilistId && episode && d >= 30) {
        recordProbedDuration(anilistId, episode, d)
      }
    }
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
  }, [scheduleHide, seeking, showChrome, anilistId, episode, idMal, totalEpisodes])

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
      className={cn(
        'relative aspect-video w-full overflow-hidden rounded-xl bg-black select-none',
        fs && 'rounded-none'
      )}
      onMouseMove={() => showChrome()}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('[data-player-bar]')) return
        if (chrome) {
          if (playing) setChrome(false)
        } else {
          showChrome(!playing)
        }
      }}
    >
      <video
        ref={videoRef}
        className="size-full object-contain"
        src={src}
        autoPlay
        playsInline
        preload="auto"
        onClick={(e) => {
          e.stopPropagation()
          togglePlay()
        }}
      />

      {title ? (
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent px-4 py-3 text-sm font-medium text-white transition-opacity duration-200',
            chrome ? 'opacity-100' : 'opacity-0'
          )}
        >
          {title}
        </div>
      ) : null}

      {error ? (
        <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-lg bg-destructive/90 px-3 py-2 text-center text-sm text-white">
          {error}
        </div>
      ) : null}

      <div
        data-player-bar
        className={cn(
          'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-3 pt-10 pb-3 transition-opacity duration-200',
          chrome ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative mb-3">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/20">
            <div className="absolute inset-y-0 left-0 bg-ok/45" style={{ width: `${bufferPct}%` }} />
            <div
              className="absolute inset-y-0 left-0 bg-player-accent"
              style={{ width: `${playPct}%` }}
            />
          </div>
          <Slider
            className="relative z-10 w-full **:data-[slot=slider-track]:bg-transparent **:data-[slot=slider-range]:bg-transparent"
            min={0}
            max={duration || 0}
            step={0.1}
            value={[current]}
            aria-label="Seek"
            onValueChange={(v) => {
              const next = v[0] ?? 0
              setSeeking(true)
              setCurrent(next)
              showChrome(true)
            }}
            onValueCommit={(v) => {
              const next = v[0] ?? 0
              const el = videoRef.current
              if (el) el.currentTime = next
              setSeeking(false)
              scheduleHide()
            }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-10 text-white hover:bg-white/10 hover:text-white"
              onClick={() => seekBy(-10)}
              aria-label="Back 10s"
            >
              −10
            </Button>
            <Button
              type="button"
              size="icon-lg"
              className="min-h-11 min-w-11 rounded-full"
              onClick={togglePlay}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause className="size-5" /> : <Play className="size-5 fill-current" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-10 text-white hover:bg-white/10 hover:text-white"
              onClick={() => seekBy(10)}
              aria-label="Forward 10s"
            >
              +10
            </Button>
            <span className="ml-1 text-xs text-white/85 tabular-nums">
              {formatTime(current)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-9 text-white hover:bg-white/10 hover:text-white"
              onClick={cycleRate}
              aria-label="Playback speed"
            >
              {rate === 1 ? '1×' : `${rate}×`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10 hover:text-white"
              onClick={() => {
                const v = videoRef.current
                if (v) v.muted = !v.muted
              }}
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted || volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </Button>
            <Slider
              className="hidden w-24 sm:flex"
              min={0}
              max={1}
              step={0.01}
              value={[muted ? 0 : volume]}
              aria-label="Volume"
              onValueChange={(v) => {
                const el = videoRef.current
                if (!el) return
                const next = v[0] ?? 0
                el.muted = next === 0
                el.volume = next
                showChrome()
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10 hover:text-white"
              onClick={() => void toggleFullscreen()}
              aria-label={fs ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {fs ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
