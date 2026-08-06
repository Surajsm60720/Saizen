'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Pause,
  Play,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SkipForward,
  ChevronLeft
} from 'lucide-react'
import type { SkipTimes, TorrentInfo } from '@saizen/shared'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import getNative from '@/lib/native'
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

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 KB'
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.round(n / 1024)} KB`
}

function formatRate(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '0 KB/s'
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
  return `${Math.round(bytesPerSec / 1024)} KB/s`
}

function statsLine(info: TorrentInfo): string {
  const peers = info.peers?.wires ?? info.peers?.seeders ?? 0
  const down = info.speed?.down ?? 0
  const downloaded = info.size?.downloaded ?? 0
  const total = info.size?.total ?? 0
  const pct = Math.round(Math.min(1, Math.max(0, info.progress ?? 0)) * 100)
  return `${peers} peers · ${formatRate(down)} · ${formatBytes(downloaded)}${
    total > 0 ? `/${formatBytes(total)}` : ''
  }${pct > 0 ? ` · ${pct}%` : ''}`
}

function isLoopback(src: string): boolean {
  try {
    const u = new URL(src)
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost'
  } catch {
    return false
  }
}

export function VideoPlayer({
  src,
  title,
  anilistId,
  episode,
  idMal,
  totalEpisodes,
  resolution,
  sourceLabel,
  skipTimes,
  autoSkipOpEd,
  hasNextEpisode,
  gestureSeekEnabled = true,
  doubleTapSeekSec = 10,
  tripleTapSeekSec = 30,
  autoplayNext = false,
  onBack,
  onNextEpisode
}: {
  src: string
  title?: string
  anilistId?: number
  episode?: number
  idMal?: number | null
  totalEpisodes?: number | null
  resolution?: string
  sourceLabel?: string
  skipTimes?: SkipTimes | null
  autoSkipOpEd?: boolean
  hasNextEpisode?: boolean
  gestureSeekEnabled?: boolean
  doubleTapSeekSec?: number
  tripleTapSeekSec?: number
  autoplayNext?: boolean
  onBack?: () => void
  onNextEpisode?: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPersist = useRef(0)
  const didAutoSkipOp = useRef(false)
  const didAutoSkipEd = useRef(false)
  const tapRef = useRef<{
    count: number
    side: 'l' | 'r'
    timer: ReturnType<typeof setTimeout> | null
  }>({ count: 0, side: 'l', timer: null })
  const seekFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [playing, setPlaying] = useState(false)
  const [seekFlash, setSeekFlash] = useState<{ side: 'l' | 'r'; sec: number } | null>(null)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [volumeOpen, setVolumeOpen] = useState(false)
  const [rate, setRate] = useState(1)
  const [seeking, setSeeking] = useState(false)
  const [chrome, setChrome] = useState(true)
  const [fs, setFs] = useState(false)
  const [error, setError] = useState('')
  const [torrentLine, setTorrentLine] = useState('')
  const [skipKind, setSkipKind] = useState<'op' | 'ed' | null>(null)

  const canNext =
    hasNextEpisode ??
    (typeof episode === 'number' &&
      typeof totalEpisodes === 'number' &&
      episode > 0 &&
      episode < totalEpisodes)

  const clearHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }

  const scheduleHide = useCallback(() => {
    clearHide()
    const v = videoRef.current
    if (!v || v.paused) return
    hideTimer.current = setTimeout(() => {
      setChrome(false)
      setVolumeOpen(false)
    }, 3200)
  }, [])

  const showChrome = useCallback(
    (persistent = false) => {
      setChrome(true)
      if (!persistent) scheduleHide()
      else clearHide()
    },
    [scheduleHide]
  )

  const seekTo = useCallback(
    (t: number) => {
      const v = videoRef.current
      if (!v) return
      v.currentTime = Math.max(0, Math.min(v.duration || 0, t))
      setCurrent(v.currentTime)
      showChrome()
    },
    [showChrome]
  )

  const applySkipLogic = useCallback(
    (t: number) => {
      const op = skipTimes?.op
      const ed = skipTimes?.ed
      if (op && t >= op.start && t < op.end) {
        setSkipKind('op')
        if (autoSkipOpEd && !didAutoSkipOp.current) {
          didAutoSkipOp.current = true
          seekTo(op.end)
          setSkipKind(null)
        }
        return
      }
      if (ed && t >= ed.start && t < ed.end) {
        setSkipKind('ed')
        if (autoSkipOpEd && !didAutoSkipEd.current) {
          didAutoSkipEd.current = true
          seekTo(ed.end)
          setSkipKind(null)
        }
        return
      }
      setSkipKind(null)
    },
    [autoSkipOpEd, seekTo, skipTimes]
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
      if (!seeking) {
        setCurrent(v.currentTime)
        applySkipLogic(v.currentTime)
      }
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
    const onEnded = () => {
      if (!autoplayNext) return
      const nextOk =
        hasNextEpisode ??
        (typeof episode === 'number' &&
          typeof totalEpisodes === 'number' &&
          episode > 0 &&
          episode < totalEpisodes)
      if (!nextOk) return
      // Parent (goAnime) owns the single nextEpisode dispatch — avoid double-fire.
      onNextEpisode?.()
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
    v.addEventListener('ended', onEnded)
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
      v.removeEventListener('ended', onEnded)
      document.removeEventListener('fullscreenchange', onFs)
    }
  }, [
    applySkipLogic,
    scheduleHide,
    seeking,
    showChrome,
    anilistId,
    episode,
    idMal,
    totalEpisodes,
    autoplayNext,
    hasNextEpisode,
    onNextEpisode
  ])

  useEffect(() => {
    if (!isLoopback(src)) return
    const tick = () => {
      void getNative()
        .torrentInfo('')
        .then((info) => setTorrentLine(statsLine(info)))
        .catch(() => {})
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [src])

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
          seekBy(e.shiftKey ? -5 : -10)
          break
        case 'arrowright':
        case 'l':
          e.preventDefault()
          seekBy(e.shiftKey ? 5 : 10)
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
        case 'n':
          if (canNext) handleNext()
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers use latest closures via refs/state
  }, [showChrome, canNext])

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

  function flashSeek(side: 'l' | 'r', sec: number) {
    setSeekFlash({ side, sec })
    if (seekFlashTimer.current) clearTimeout(seekFlashTimer.current)
    seekFlashTimer.current = setTimeout(() => setSeekFlash(null), 700)
  }

  function seekBy(delta: number, flash?: 'l' | 'r') {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta))
    if (flash) flashSeek(flash, delta)
    showChrome()
  }

  function handleSurfaceTap(e: React.MouseEvent | React.PointerEvent) {
    e.stopPropagation()
    if (!gestureSeekEnabled) {
      togglePlay()
      return
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const side: 'l' | 'r' = e.clientX < rect.left + rect.width / 2 ? 'l' : 'r'
    const t = tapRef.current
    if (t.timer) clearTimeout(t.timer)
    if (t.side !== side) t.count = 0
    t.side = side
    t.count += 1
    t.timer = setTimeout(() => {
      const n = t.count
      t.count = 0
      t.timer = null
      if (n >= 3 && tripleTapSeekSec > 0) {
        const sec = tripleTapSeekSec
        seekBy(side === 'l' ? -sec : sec, side)
      } else if (n >= 2) {
        const sec = doubleTapSeekSec
        seekBy(side === 'l' ? -sec : sec, side)
      } else {
        togglePlay()
      }
    }, 280)
  }

  function setPlaybackRate(next: number) {
    const v = videoRef.current
    if (!v) return
    v.playbackRate = next
    setRate(next)
    showChrome()
  }

  function handleSkipSegment() {
    if (skipKind === 'op' && skipTimes?.op) {
      didAutoSkipOp.current = true
      seekTo(skipTimes.op.end)
    } else if (skipKind === 'ed' && skipTimes?.ed) {
      didAutoSkipEd.current = true
      seekTo(skipTimes.ed.end)
    }
    setSkipKind(null)
  }

  function handleNext() {
    // Parent owns dispatchPlayerAction — calling both caused duplicate nextEpisode.
    onNextEpisode?.()
  }

  const bufferPct = duration > 0 ? (buffered / duration) * 100 : 0
  const playPct = duration > 0 ? (current / duration) * 100 : 0
  const qualityLabel = resolution || 'Quality'

  return (
    <div
      ref={rootRef}
      className={cn(
        'relative flex min-h-[56vw] w-full flex-col overflow-hidden bg-black select-none sm:min-h-[420px]',
        fs ? 'fixed inset-0 z-50 min-h-screen rounded-none' : 'rounded-none sm:rounded-xl'
      )}
      onMouseMove={() => showChrome()}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('[data-player-bar],[data-player-top],[data-skip-pill]'))
          return
        if (chrome) {
          if (playing) {
            setChrome(false)
            setVolumeOpen(false)
          }
        } else {
          showChrome(!playing)
        }
      }}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 size-full object-contain"
        src={src}
        autoPlay
        playsInline
        preload="auto"
        onClick={handleSurfaceTap}
      />

      {/* Top chrome */}
      <div
        data-player-top
        className={cn(
          'absolute inset-x-0 top-0 z-10 flex items-center gap-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-8 transition-opacity duration-200',
          chrome ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-white hover:bg-white/10 hover:text-white"
          onClick={() => onBack?.()}
          aria-label="Back"
        >
          <ChevronLeft className="size-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-base text-white sm:text-lg">{title || 'Saizen'}</p>
          {sourceLabel ? (
            <p className="truncate text-xs text-white/55">{sourceLabel}</p>
          ) : null}
        </div>
        {canNext ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1 rounded-full bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/15 hover:text-white"
            onClick={handleNext}
          >
            Next
            <SkipForward className="size-3.5" />
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="absolute inset-x-4 top-1/2 z-20 -translate-y-1/2 rounded-lg bg-destructive/90 px-3 py-2 text-center text-sm text-white">
          {error}
        </div>
      ) : null}

      {seekFlash ? (
        <div
          className={cn(
            'pointer-events-none absolute top-1/2 z-20 -translate-y-1/2 rounded-full bg-player-accent px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_8px_24px_rgba(0,0,0,0.35)]',
            seekFlash.side === 'l' ? 'left-8' : 'right-8'
          )}
        >
          {seekFlash.sec > 0 ? `+${seekFlash.sec}s` : `${seekFlash.sec}s`}
        </div>
      ) : null}

      {skipKind ? (
        <button
          type="button"
          data-skip-pill
          className="absolute bottom-28 left-1/2 z-20 -translate-x-1/2 rounded-full bg-player-accent px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition hover:brightness-110"
          onClick={(e) => {
            e.stopPropagation()
            handleSkipSegment()
          }}
        >
          {skipKind === 'op' ? 'Skip Opening' : 'Skip Ending'}
        </button>
      ) : null}

      {/* Bottom chrome */}
      <div
        data-player-bar
        className={cn(
          'absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3 pt-12 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-opacity duration-200',
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
              if (skipTimes?.op && next < skipTimes.op.start) didAutoSkipOp.current = false
              if (skipTimes?.ed && next < skipTimes.ed.start) didAutoSkipEd.current = false
              setSeeking(false)
              scheduleHide()
            }}
          />
        </div>

        <div className="mb-2 flex items-center justify-center gap-2 sm:gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-9 text-white/90 hover:bg-white/10 hover:text-white"
            onClick={() => seekBy(-5)}
            aria-label="Back 5s"
          >
            −5
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-9 text-white/90 hover:bg-white/10 hover:text-white"
            onClick={() => seekBy(-10)}
            aria-label="Back 10s"
          >
            −10
          </Button>
          <Button
            type="button"
            size="icon-lg"
            className="min-h-12 min-w-12 rounded-full bg-player-accent text-[#1a1510] hover:bg-player-accent/90"
            onClick={togglePlay}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause className="size-5" /> : <Play className="size-5 fill-current" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-9 text-white/90 hover:bg-white/10 hover:text-white"
            onClick={() => seekBy(10)}
            aria-label="Forward 10s"
          >
            +10
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-9 text-white/90 hover:bg-white/10 hover:text-white"
            onClick={() => seekBy(5)}
            aria-label="Forward 5s"
          >
            +5
          </Button>
        </div>

        <div className="mb-2 flex items-center justify-between gap-2 text-xs text-white/80 tabular-nums">
          <span>
            {formatTime(current)} / {formatTime(duration)}
          </span>
          {torrentLine ? (
            <span className="max-w-[70%] truncate rounded-full bg-white/10 px-2.5 py-1 ring-1 ring-white/12">
              {torrentLine}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-full bg-white/10 px-3 text-white ring-1 ring-white/14 hover:bg-white/15 hover:text-white"
              >
                {rate === 1 ? '1×' : `${rate}×`}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-28">
              {RATES.map((r) => (
                <DropdownMenuItem key={r} onClick={() => setPlaybackRate(r)}>
                  {r === 1 ? '1×' : `${r}×`}
                  {r === rate ? ' ✓' : ''}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-full bg-white/10 px-3 text-white ring-1 ring-white/14 hover:bg-white/15 hover:text-white"
              >
                {qualityLabel}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-40">
              <DropdownMenuItem disabled>
                Current: {resolution || 'unknown'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="relative ml-auto flex items-center gap-1">
            <div className="relative">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 rounded-full bg-white/10 px-3 text-white ring-1 ring-white/14 hover:bg-white/15 hover:text-white"
                onClick={() => {
                  setVolumeOpen((o) => !o)
                  showChrome(true)
                }}
                aria-label="Volume"
                aria-expanded={volumeOpen}
              >
                {muted || volume === 0 ? (
                  <VolumeX className="size-3.5" />
                ) : (
                  <Volume2 className="size-3.5" />
                )}
                <span className="tabular-nums">
                  {muted ? 0 : Math.round(volume * 100)}%
                </span>
              </Button>
              {volumeOpen ? (
                <div
                  data-player-bar
                  className="absolute right-0 bottom-[calc(100%+10px)] z-30 flex w-14 flex-col items-center gap-2 rounded-2xl bg-background/95 px-2 py-3 ring-1 ring-white/15 backdrop-blur-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-[11px] font-medium text-white/80 tabular-nums">
                    {muted ? 0 : Math.round(volume * 100)}%
                  </span>
                  <Slider
                    orientation="vertical"
                    className="h-36 w-8 touch-manipulation data-vertical:min-h-36"
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
                      setVolume(next)
                      setMuted(next === 0)
                      showChrome(true)
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-white hover:bg-white/10 hover:text-white"
                    onClick={() => {
                      const el = videoRef.current
                      if (!el) return
                      el.muted = !el.muted
                      setMuted(el.muted)
                      showChrome(true)
                    }}
                    aria-label={muted ? 'Unmute' : 'Mute'}
                  >
                    {muted || volume === 0 ? (
                      <VolumeX className="size-3.5" />
                    ) : (
                      <Volume2 className="size-3.5" />
                    )}
                  </Button>
                </div>
              ) : null}
            </div>
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
