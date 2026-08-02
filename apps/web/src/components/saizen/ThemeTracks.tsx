import { Play } from 'lucide-react'
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
      <h2 className="font-heading text-2xl tracking-tight sm:text-[1.7rem]">{title}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
    </div>
  )
}

function ThemeRow({ track }: { track: AnimeThemeTrack }) {
  const label = `${track.kind}${track.sequence != null ? track.sequence : ''}`
  const disabled = !track.videoUrl

  async function open() {
    if (!track.videoUrl) return
    try {
      await getNative().openURL(track.videoUrl)
    } catch {
      window.open(track.videoUrl, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => void open()}
      className={cn(
        'group flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all',
        disabled
          ? 'cursor-not-allowed border-white/5 bg-white/[0.02] opacity-50'
          : 'border-white/10 bg-gradient-to-r from-white/[0.04] to-transparent hover:border-primary/30 hover:from-primary/10 active:scale-[0.99]'
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 font-heading text-xs font-semibold tracking-wide text-primary ring-1 ring-primary/25">
        {label}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{track.title}</div>
        <div className="truncate text-xs text-muted-foreground">
          {track.resolution ? `${track.resolution}p` : 'Clip'}
          {disabled ? ' · unavailable' : ' · tap to play'}
        </div>
      </div>
      {!disabled ? (
        <Play className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
      ) : null}
    </button>
  )
}
