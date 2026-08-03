import { ExternalLink, Play } from 'lucide-react'
import type { MouseEvent } from 'react'
import getNative from '@/lib/native'
import { cn } from '@/lib/utils'
import type { AnimeThemeTrack } from '@/lib/animethemes'

export function ThemeTracks({
  tracks,
  loading,
  className
}: {
  tracks: AnimeThemeTrack[]
  loading?: boolean
  className?: string
}) {
  if (loading) {
    return (
      <section className={cn('space-y-3', className)}>
        <SectionHead title="Opening & Ending" subtitle="Loading themes…" />
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      </section>
    )
  }

  if (!tracks.length) {
    return (
      <section className={cn('space-y-2', className)}>
        <SectionHead title="Opening & Ending" subtitle="No theme clips found for this title" />
      </section>
    )
  }

  return (
    <section className={cn('space-y-3.5', className)}>
      <SectionHead
        title="Opening & Ending"
        subtitle={`${tracks.length} theme${tracks.length === 1 ? '' : 's'} via AnimeThemes`}
      />
      <ul className="flex flex-col gap-2">
        {tracks.map((t) => (
          <li key={t.id}>
            <ThemeRow track={t} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function SectionHead({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <div className="mb-1 h-0.5 w-8 rounded-full bg-primary/80" />
      <h2 className="text-section">{title}</h2>
      <p className="text-meta mt-0.5">{subtitle}</p>
    </div>
  )
}

async function openHttps(url: string) {
  try {
    await getNative().openURL(url)
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

function ThemeRow({ track }: { track: AnimeThemeTrack }) {
  const label = `${track.kind}${track.sequence != null ? track.sequence : ''}`
  const hasClip = Boolean(track.videoUrl)
  const hasPage = Boolean(track.pageUrl)
  const disabled = !hasClip && !hasPage

  async function openPrimary() {
    if (track.videoUrl) {
      await openHttps(track.videoUrl)
      return
    }
    if (track.pageUrl) await openHttps(track.pageUrl)
  }

  async function openPage(e: MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    if (track.pageUrl) await openHttps(track.pageUrl)
  }

  return (
    <div
      className={cn(
        'group flex w-full items-center gap-2 rounded-2xl border px-3 py-2.5 transition-all',
        disabled
          ? 'border-white/5 bg-white/[0.02] opacity-50'
          : 'border-white/10 bg-gradient-to-r from-white/[0.04] to-transparent hover:border-primary/30 hover:from-primary/10'
      )}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => void openPrimary()}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-3 text-left',
          disabled ? 'cursor-not-allowed' : 'active:scale-[0.99]'
        )}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 font-heading text-xs font-semibold tracking-wide text-primary ring-1 ring-primary/25">
          {label}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{track.title}</div>
          <div className="text-meta truncate">
            {track.resolution ? `${track.resolution}p` : 'Theme'}
            {hasClip ? ' · tap to play clip' : hasPage ? ' · open on AnimeThemes' : ' · unavailable'}
          </div>
        </div>
        {hasClip ? (
          <Play className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
        ) : null}
      </button>
      {hasPage ? (
        <button
          type="button"
          onClick={(e) => void openPage(e)}
          className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground ring-1 ring-white/10 transition-colors hover:bg-white/5 hover:text-primary"
          aria-label="Open on AnimeThemes"
          title="Open on AnimeThemes"
        >
          <ExternalLink className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}
