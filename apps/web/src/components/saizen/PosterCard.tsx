import Link from 'next/link'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

function shortTitle(title: string, max = 28) {
  const t = title.trim()
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(1, max - 1)).trimEnd()}…`
}

export function PosterCard({
  href,
  image,
  title,
  subtitle,
  score,
  format,
  year,
  className,
  size = 'md',
  onNavigate
}: {
  href: string
  image?: string | null
  title: string
  /** Fallback meta line when score/format/year not passed */
  subtitle?: string
  score?: number | null
  format?: string | null
  year?: number | null
  className?: string
  size?: 'sm' | 'md' | 'lg'
  /** Fired on click before navigation (e.g. blur search keyboard). */
  onNavigate?: () => void
}) {
  const label = shortTitle(title, size === 'sm' ? 22 : 30)
  const meta =
    [format, year].filter(Boolean).join(' · ') || subtitle || undefined

  return (
    <Link
      href={href}
      title={title}
      onClick={() => onNavigate?.()}
      className={cn(
        'group relative block shrink-0 overflow-hidden rounded-2xl',
        'bg-card/40 ring-1 ring-white/10',
        'shadow-[0_10px_28px_-12px_rgba(0,0,0,0.65)]',
        'transition-[transform,box-shadow,ring-color] duration-300 ease-out',
        'hover:-translate-y-0.5 hover:ring-primary/45 hover:shadow-[0_18px_36px_-14px_rgba(0,0,0,0.75)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        size === 'lg' && 'w-[9.75rem] sm:w-[11.25rem]',
        size === 'md' && 'w-[8.5rem] sm:w-[9.75rem]',
        size === 'sm' && 'w-[7.25rem]',
        className
      )}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-zinc-900">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={title}
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
            No art
          </div>
        )}

        {/* Cinematic bottom wash + top sheen */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent opacity-90" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/35 to-transparent" />
        <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(120%_80%_at_50%_120%,rgba(232,196,120,0.18),transparent_55%)]" />

        {score != null ? (
          <div className="absolute top-2 left-2 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[0.65rem] font-semibold text-primary shadow-sm backdrop-blur-md ring-1 ring-primary/30">
            <Star className="size-2.5 fill-current" />
            {score}%
          </div>
        ) : null}

        {format ? (
          <div className="absolute top-2 right-2 rounded-full bg-black/50 px-1.5 py-0.5 text-[0.58rem] font-semibold tracking-[0.06em] text-white/90 uppercase backdrop-blur-md ring-1 ring-white/15">
            {format}
          </div>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 p-2.5 sm:p-3">
          <div className="mb-1.5 h-px w-6 bg-gradient-to-r from-primary/80 to-transparent opacity-80" />
          <strong className="block truncate font-heading text-[0.95rem] leading-tight tracking-tight text-white drop-shadow-sm">
            {label}
          </strong>
          {meta ? (
            <span className="mt-0.5 block truncate text-[0.68rem] text-white/65">
              {meta}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  )
}
