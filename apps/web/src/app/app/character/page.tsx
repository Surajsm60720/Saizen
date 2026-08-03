'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  displayTitle,
  fetchCharacter,
  stripHtml,
  type AniCharacter
} from '@/lib/anilist'
import { PageHeader, PosterCard, PosterRail } from '@/components/saizen'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronLeft } from 'lucide-react'

function formatDob(d?: { year?: number | null; month?: number | null; day?: number | null } | null) {
  if (!d?.year) return null
  const m = d.month ? String(d.month).padStart(2, '0') : '??'
  const day = d.day ? String(d.day).padStart(2, '0') : '??'
  return `${d.year}-${m}-${day}`
}

function CharacterDetail() {
  const searchParams = useSearchParams()
  const id = Number(searchParams.get('id') || 0)
  const from = Number(searchParams.get('from') || 0)

  const [character, setCharacter] = useState<AniCharacter | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) {
      setError('Missing character id')
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    void fetchCharacter(id)
      .then((c) => {
        if (cancelled) return
        if (!c) setError('Character not found')
        else setCharacter(c)
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

  if (error || !character) {
    return (
      <div className="space-y-3">
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ChevronLeft className="size-4" />
          Back
        </Link>
        <p className="text-sm text-destructive">{error || 'Not found'}</p>
      </div>
    )
  }

  const name = character.name?.full || character.name?.native || `Character #${character.id}`
  const media = (character.media?.edges ?? [])
    .filter((e) => e?.node?.id)
    .map((e) => ({
      id: e.node!.id,
      role: e.characterRole,
      media: e.node!
    }))

  const meta: string[] = []
  if (character.gender) meta.push(character.gender)
  if (character.age) meta.push(`Age ${character.age}`)
  const dob = formatDob(character.dateOfBirth)
  if (dob) meta.push(`Born ${dob}`)
  if (character.favourites) meta.push(`${character.favourites.toLocaleString()} favourites`)

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
          {character.image?.large ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={character.image.large} alt="" className="size-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <PageHeader title={name} dense />
          {character.name?.native ? (
            <p className="text-sm text-muted-foreground">{character.name.native}</p>
          ) : null}
          {meta.length ? (
            <p className="text-xs text-muted-foreground">{meta.join(' · ')}</p>
          ) : null}
        </div>
      </div>

      {stripHtml(character.description) ? (
        <section className="space-y-2">
          <div className="mb-1 h-0.5 w-8 rounded-full bg-primary/80" />
          <h2 className="text-section text-[1.25rem]">About</h2>
          <p className="text-sm leading-relaxed text-foreground/85 whitespace-pre-wrap">
            {stripHtml(character.description)}
          </p>
        </section>
      ) : null}

      {media.length ? (
        <PosterRail title="Appears in" dense>
          {media.map(({ id: mid, role, media: m }) => {
            const kind = (m as { type?: string | null }).type
            const href =
              kind === 'MANGA'
                ? `https://anilist.co/manga/${mid}`
                : `/app/anime/?id=${mid}`
            return (
              <PosterCard
                key={mid}
                size="md"
                href={href}
                image={m.coverImage?.large ?? m.coverImage?.medium}
                title={displayTitle(m)}
                score={m.averageScore}
                format={
                  [kind, role?.replaceAll('_', ' ')].filter(Boolean).join(' · ') || m.format
                }
                year={m.seasonYear}
              />
            )
          })}
        </PosterRail>
      ) : null}
    </div>
  )
}

export default function CharacterPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      }
    >
      <CharacterDetail />
    </Suspense>
  )
}
