'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Play } from 'lucide-react'
import { displayTitle, stripHtml, type AnimeMedia } from '@/lib/anilist'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { hapticPress } from '@/lib/haptics'
import { rememberCurrentScroll } from '@/lib/nav/scrollMemory'

function shortTitle(title: string, max = 34) {
  const t = title.trim()
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(1, max - 1)).trimEnd()}…`
}

/** Prefer portrait covers — they fill the tall hero with far less crop than banners. */
function heroPosterSrc(media: AnimeMedia): string {
  return (
    media.coverImage?.extraLarge ||
    media.coverImage?.large ||
    media.coverImage?.medium ||
    media.bannerImage ||
    ''
  )
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
    if (slides.length === 0) {
      setIndex(0)
      return
    }
    setIndex((i) => Math.min(i, slides.length - 1))
  }, [slides.length])

  useEffect(() => {
    if (slides.length <= 1) return
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length)
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [slides.length, intervalMs])

  const featured = slides[index] ?? slides[0]
  if (!featured) return null

  const name = shortTitle(displayTitle(featured))

  return (
    <section className="relative overflow-hidden">
      {/* Full-bleed under the fixed header — no letterbox bars */}
      <div className="relative h-[min(70vh,620px)] min-h-[380px] w-full sm:h-[min(72vh,660px)]">
        {slides.map((media, i) => {
          const src = heroPosterSrc(media)
          return (
            <div
              key={media.id}
              className={cn(
                'absolute inset-0 transition-opacity duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
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
                  className="size-full object-cover object-[center_18%]"
                />
              ) : (
                <div className="size-full bg-background" />
              )}
            </div>
          )
        })}

        {/* Light top wash for status bar / brand — not a black band */}
        <div className="absolute inset-x-0 top-0 z-[1] h-[18%] bg-gradient-to-b from-background/35 to-transparent" />

        {/* Bottom fade into page content */}
        <div className="absolute inset-x-0 bottom-0 z-[1] h-[38%] bg-gradient-to-t from-background via-background/50 to-transparent" />

        <div
          className="absolute inset-x-0 bottom-0 z-[2] flex flex-col justify-end px-4 pb-4 sm:px-5 sm:pb-5"
          style={{
            paddingTop: 'calc(var(--safe-top) + 4.75rem)'
          }}
        >
          <h1
            key={featured.id}
            className="text-hero-title max-w-[16ch] sm:max-w-[20ch]"
            title={displayTitle(featured)}
          >
            {name}
          </h1>
          <p className="mt-2 text-sm text-white/70">
            {[
              featured.averageScore != null ? `${featured.averageScore}%` : null,
              featured.format,
              featured.genres?.[0]
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="mt-2 max-w-md text-xs leading-relaxed text-white/65 line-clamp-2 sm:text-sm">
            {stripHtml(featured.description) || 'Pick a title. Stream episode-by-episode.'}
          </p>
          <div className="mt-3.5 flex flex-wrap items-center gap-2.5 saizen-enter">
            <Button asChild size="lg" className="min-h-10 gap-2 px-4" haptic="medium">
              <Link
                href={`/app/anime/?id=${featured.id}`}
                scroll={false}
                draggable={false}
                onClick={() => rememberCurrentScroll()}
              >
                <Play className="size-4 fill-current" />
                Watch now
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="min-h-10 px-4" haptic="selection">
              <Link
                href="/app/search/"
                replace
                scroll={false}
                draggable={false}
                onClick={() => rememberCurrentScroll()}
              >
                Browse
              </Link>
            </Button>
          </div>

          {slides.length > 1 ? (
            <div className="mt-3 flex gap-1.5">
              {slides.map((media, i) => (
                <button
                  key={media.id}
                  type="button"
                  aria-label={`Show ${displayTitle(media)}`}
                  onClick={() => {
                    hapticPress('selection')
                    setIndex(i)
                  }}
                  className={cn(
                    'h-1 rounded-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                    i === index ? 'w-5 bg-primary' : 'w-1.5 bg-white/30'
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
