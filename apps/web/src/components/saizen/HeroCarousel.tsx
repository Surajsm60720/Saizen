'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Play } from 'lucide-react'
import { displayTitle, stripHtml, type AnimeMedia } from '@/lib/anilist'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function shortTitle(title: string, max = 34) {
  const t = title.trim()
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(1, max - 1)).trimEnd()}…`
}

export function HeroCarousel({
  items,
  intervalMs = 6500
}: {
  items: AnimeMedia[]
  intervalMs?: number
}) {
  const slides = items.slice(0, 8)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (slides.length <= 1) return
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length)
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [slides.length, intervalMs])

  const featured = slides[index]
  if (!featured) return null

  const name = shortTitle(displayTitle(featured))

  return (
    <section className="relative overflow-hidden">
      {/* Image runs under the fixed header — no gap / seam */}
      <div className="relative h-[min(48vh,420px)] min-h-[300px] w-full sm:h-[min(52vh,460px)]">
        {slides.map((media, i) => {
          const src = media.bannerImage || media.coverImage?.large || ''
          return (
            <div
              key={media.id}
              className={cn(
                'absolute inset-0 transition-opacity duration-700 ease-out',
                i === index ? 'opacity-100' : 'opacity-0'
              )}
              aria-hidden={i !== index}
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={src}
                  alt=""
                  draggable={false}
                  className="size-full object-cover object-[center_20%]"
                />
              ) : (
                <div className="size-full bg-[#141416]" />
              )}
            </div>
          )
        })}

        {/* Only bottom fade into page content — no top black band */}
        <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-[#141416] via-[#141416]/50 to-transparent" />

        {/* Spacer keeps copy clear of the translucent header */}
        <div
          className="absolute inset-x-0 bottom-0 flex flex-col justify-end px-4 pb-5 sm:px-5 sm:pb-6"
          style={{
            paddingTop: 'calc(var(--safe-top) + 4.75rem)'
          }}
        >
          <h1
            key={featured.id}
            className="text-hero-title max-w-[16ch] animate-in fade-in-0 slide-in-from-bottom-2 duration-500 sm:max-w-[20ch]"
            title={displayTitle(featured)}
          >
            {name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {featured.averageScore ? (
              <Badge variant="secondary" className="text-[0.7rem]">
                {featured.averageScore}%
              </Badge>
            ) : null}
            {featured.format ? (
              <Badge variant="outline" className="text-[0.7rem]">
                {featured.format}
              </Badge>
            ) : null}
            {featured.genres?.slice(0, 2).map((g) => (
              <Badge key={g} variant="outline" className="text-[0.7rem]">
                {g}
              </Badge>
            ))}
          </div>
          <p className="mt-2 max-w-md text-xs leading-relaxed text-white/70 line-clamp-2 sm:text-sm">
            {stripHtml(featured.description) || 'Pick a title. Stream episode-by-episode.'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button asChild size="lg" className="min-h-10 gap-2 px-4">
              <Link href={`/app/anime/?id=${featured.id}`} draggable={false}>
                <Play className="size-4 fill-current" />
                Watch now
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="min-h-10 px-4">
              <Link href="/app/search/" draggable={false}>
                Browse
              </Link>
            </Button>
          </div>

          {slides.length > 1 ? (
            <div className="mt-3.5 flex gap-1.5">
              {slides.map((media, i) => (
                <button
                  key={media.id}
                  type="button"
                  aria-label={`Show ${displayTitle(media)}`}
                  onClick={() => setIndex(i)}
                  className={cn(
                    'h-1 rounded-full transition-all duration-300',
                    i === index ? 'w-6 bg-primary' : 'w-2 bg-white/30 hover:bg-white/50'
                  )}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
