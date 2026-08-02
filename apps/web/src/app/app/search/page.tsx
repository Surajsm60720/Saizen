'use client'

import { useEffect, useRef, useState } from 'react'
import { searchAnime, displayTitle, type AnimeMedia } from '@/lib/anilist'
import { ensureExtensions, hasAdultExtensionsEnabled } from '@/lib/extensions'
import { PageHeader, PosterCard, PosterGrid } from '@/components/saizen'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function SearchPage() {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<AnimeMedia[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [includeAdult, setIncludeAdult] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    void ensureExtensions().then(() => {
      setIncludeAdult(hasAdultExtensionsEnabled())
    })
  }, [])

  async function run(e?: React.FormEvent) {
    e?.preventDefault()
    if (!term.trim()) return
    setLoading(true)
    setError('')
    try {
      setResults(await searchAnime(term.trim(), 1, { includeAdult }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <PageHeader title="Search" description="Find anime by romaji, English, or native title." dense />

      <form className="flex gap-2" onSubmit={(e) => void run(e)}>
        <Input
          ref={inputRef}
          className="min-h-11"
          placeholder="Romaji / English / Japanese title"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <Button type="submit" size="lg" className="min-h-11 px-5" disabled={loading}>
          {loading ? '…' : 'Search'}
        </Button>
      </form>

      {includeAdult ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Adult titles included (hentai extension enabled).
        </p>
      ) : null}

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <PosterGrid className="mt-5">
        {results.map((media) => (
          <PosterCard
            key={media.id}
            size="sm"
            className="w-full min-w-0"
            href={`/app/anime/?id=${media.id}`}
            image={media.coverImage?.large}
            title={displayTitle(media)}
            score={media.averageScore}
            format={media.format}
            year={media.seasonYear}
          />
        ))}
      </PosterGrid>
    </>
  )
}
