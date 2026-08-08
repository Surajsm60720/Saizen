'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { AnimeThemeTrack } from '@/lib/animethemes'

export function ThemeTracks({
  tracks,
  loading,
  notice,
  onRetry,
  className
}: {
  tracks: AnimeThemeTrack[]
  loading?: boolean
  /** Soft status when catalogs are degraded */
  notice?: string | null
  onRetry?: () => void
  className?: string
}) {
  if (loading) {
    return (
      <section className={cn('space-y-3', className)}>
        <SectionHead title="Opening & Ending" subtitle="Loading themes…" />
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3 rounded-2xl bg-white/5 px-3 py-2.5">
              <div className="h-8 w-10 shrink-0 animate-pulse rounded-lg bg-white/10" />
              <div className="min-w-0 flex-1 space-y-2 py-1">
                <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-white/10" />
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (!tracks.length) {
    return (
      <section className={cn('space-y-2', className)}>
        <SectionHead
          title="Opening & Ending"
          subtitle={notice || 'No themes found for this title'}
        />
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="text-sm font-medium text-primary"
          >
            Retry
          </button>
        ) : null}
      </section>
    )
  }

  return (
    <section className={cn('space-y-3.5', className)}>
      <SectionHead
        title="Opening & Ending"
        subtitle={
          notice ||
          'Tap a theme to copy — search it on Spotify or YouTube'
        }
      />
      <ul className="flex flex-col gap-2">
        {tracks.map((t) => (
          <li key={t.id}>
            <ThemeRow track={t} />
          </li>
        ))}
      </ul>
      {notice && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="text-meta text-primary"
        >
          Retry catalog
        </button>
      ) : null}
    </section>
  )
}

function SectionHead({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>      <h2 className="text-section">{title}</h2>
      <p className="text-meta mt-0.5">{subtitle}</p>
    </div>
  )
}

function themeCopyText(track: AnimeThemeTrack): string {
  const title = track.title.trim()
  const artists = track.artists.map((a) => a.trim()).filter(Boolean)
  if (title && artists.length) return `${title} — ${artists.join(', ')}`
  return title || artists.join(', ')
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.left = '-9999px'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(area)
      return ok
    } catch {
      return false
    }
  }
}

function ThemeRow({ track }: { track: AnimeThemeTrack }) {
  const label = `${track.kind}${track.sequence != null ? track.sequence : ''}`
  const artistLine = track.artists.length ? track.artists.join(', ') : null
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    const text = themeCopyText(track)
    if (!text) {
      toast.error('Nothing to copy for this theme')
      return
    }
    const ok = await copyToClipboard(text)
    if (!ok) {
      toast.error('Could not copy — try again')
      return
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
    toast.success('Copied — paste into Spotify or YouTube')
  }

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-r from-white/[0.04] to-transparent px-3 py-2.5 text-left transition-colors active:bg-white/[0.07]"
      aria-label={`Copy ${label} ${track.title}`}
    >
      <span className="text-meta flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 font-semibold tracking-wide text-primary">
        {label}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-body truncate font-semibold leading-snug">{track.title}</div>
        {artistLine ? (
          <div className="text-meta mt-0.5 truncate">{artistLine}</div>
        ) : null}
      </div>
      <span className="shrink-0 text-[0.7rem] font-medium text-muted-foreground">
        {copied ? 'Copied' : 'Copy'}
      </span>
    </button>
  )
}
