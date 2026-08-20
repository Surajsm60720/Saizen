'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import {
  displayTitle,
  fetchMedia,
  stripHtml,
  type AnimeMedia
} from '@/lib/anilist'
import { PageHeader, PersonRail, PosterCard, PosterRail } from '@/components/saizen'
import { Skeleton } from '@/components/ui/skeleton'
import type { PersonRailItem } from '@/components/saizen/PersonRail'

function isMangaLike(m: AnimeMedia): boolean {
  const kind = (m as { type?: string | null }).type
  const fmt = (m as { format?: string | null }).format
  return kind === 'MANGA' || kind === 'NOVEL' || kind === 'ONE_SHOT' || fmt === 'MANGA'
}

function MangaDetail() {
  const searchParams = useSearchParams()
  const id = Number(searchParams.get('id') || 0)
  const from = Number(searchParams.get('from') || 0)

  const [media, setMedia] = useState<AnimeMedia | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) {
      setError('Missing media id')
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    void fetchMedia(id)
      .then((m) => {
        if (cancelled) return
        if (!m) setError('Not found')
        else setMedia(m)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id])

  const backHref = from > 0 ? `/app/anime/?id=${from}` : '/'

  const staffPeople: PersonRailItem[] = useMemo(() => {
    const edges = media?.staff?.edges ?? []
    return edges
      .filter((e) => e?.node?.id)
      .map((e) => ({
        id: e.node!.id,
        name: e.node!.name?.full || 'Unknown',
        role: e.role,
        image: e.node!.image?.large,
        href: `/app/staff/?id=${e.node!.id}${from ? `&from=${from}` : ''}`
      }))
  }, [from, media])

  const related: AnimeMedia[] = useMemo(() => {
    const edges = media?.relations?.edges ?? []
    return edges
      .filter((e) => e?.node?.id)
      .map((e) => e.node as AnimeMedia)
      .slice(0, 24)
  }, [media])

  const genres = useMemo(() => (media?.genres ?? []).filter(Boolean).slice(0, 8), [media])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <div className="flex gap-4">
          <Skeleton className="h-44 w-[7.25rem] rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !media) {
    return (
      <div className="space-y-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ChevronLeft className="size-4" />
          Back
        </Link>
        <p className="text-sm text-destructive">{error || 'Not found'}</p>
      </div>
    )
  }

  const name = media.title?.native || media.title?.romaji || media.title?.userPreferred
  const kind = (media as { type?: string | null }).type

  return (
    <div className="space-y-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {from > 0 ? 'Back to anime' : 'Home'}
      </Link>

      <div className="flex gap-4">
        <div className="h-44 w-[7.25rem] shrink-0 overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-white/10">
          {media.coverImage?.large ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media.coverImage.large} alt="" className="size-full object-cover" />
          ) : null}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <PageHeader title={displayTitle(media)} dense />
          {genres.length ? <p className="text-xs text-muted-foreground">{genres.join(' · ')}</p> : null}
          {media.isAdult ? <p className="text-xs text-destructive">Adult content</p> : null}
        </div>
      </div>

      {stripHtml(media.description) ? (
        <section className="space-y-2">
          <h2 className="text-section text-[1.25rem]">About</h2>
          <p className="text-sm leading-relaxed text-foreground/85 whitespace-pre-wrap">
            {stripHtml(media.description)}
          </p>
        </section>
      ) : null}

      {staffPeople.length ? <PersonRail title="Staff" subtitle="Key creatives" people={staffPeople} /> : null}

      {related.length ? (
        <PosterRail title="Related titles" dense>
          {related.map((m) => {
            const mid = m.id
            const href = isMangaLike(m) ? `/app/manga/?id=${mid}&from=${from || media.id}` : `/app/anime/?id=${mid}`
            const mKind = (m as { type?: string | null }).type
            return (
              <PosterCard
                key={mid}
                size="md"
                href={href}
                image={m.coverImage?.large ?? m.coverImage?.medium}
                title={displayTitle(m)}
                score={m.averageScore}
                format={mKind || m.format}
                year={m.seasonYear}
              />
            )
          })}
        </PosterRail>
      ) : null}
    </div>
  )
}

export default function MangaPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      }
    >
      <MangaDetail />
    </Suspense>
  )
}

