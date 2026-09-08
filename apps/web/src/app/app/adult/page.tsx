'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AdultGenre, AdultHomeSection, AdultSearchHit, InstalledModule } from '@saizen/shared'
import {
  AdultHeroCarousel,
  AdultModeGate,
  PosterCard,
  PosterRail,
  HomePlaceholderRail
} from '@/components/saizen'
import { Skeleton } from '@/components/ui/skeleton'
import { getNative } from '@/lib/native'
import { whenBridgeReady } from '@/lib/native/ready'
import {
  getAdultPrimaryModuleId,
  isAdultModeOn,
  setAdultPrimaryModuleId,
  subscribeAdultMode
} from '@/lib/privacy/adult'
import {
  adultHitImage,
  adultHitTitle,
  adultHitUrl,
  adultTitleHref,
  preferUnseenAdultHits
} from '@/lib/adult/hits'
import { adultHomeRailQueries, adultHomeRailTitles, adultHomeRailTitle } from '@/lib/adult/genres'
import {
  clearAdultHomeSnapshot,
  isAdultHomeFresh,
  readAdultHomeSnapshot,
  readCachedAdultHome,
  writeAdultHomeSnapshot
} from '@/lib/adult/homeStore'

function asModules(value: unknown): InstalledModule[] {
  return Array.isArray(value) ? (value as InstalledModule[]) : []
}

function sectionTitle(section: AdultHomeSection, index: number): string {
  const t = section.title ?? section.name
  return typeof t === 'string' && t.trim() ? t.trim() : `Section ${index + 1}`
}

function sectionItems(section: AdultHomeSection): AdultSearchHit[] {
  return Array.isArray(section.items) ? section.items : []
}

function RailSkeleton() {
  return (
    <div className="mt-4 flex gap-3.5 overflow-hidden">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="min-w-[10rem] space-y-2">
          <Skeleton className="aspect-[2/3] w-full rounded-xl" />
          <Skeleton className="h-4 w-[80%]" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}

export default function AdultHomePage() {
  const boot = readAdultHomeSnapshot()
  const [primaryId, setPrimaryId] = useState<string | null>(boot.moduleId || null)
  const [primaryName, setPrimaryName] = useState(boot.primaryName)
  const [sections, setSections] = useState<AdultHomeSection[]>(boot.sections)
  const [loading, setLoading] = useState(!boot.ready)
  const [error, setError] = useState('')

  const load = useCallback(async (opts?: { force?: boolean }) => {
    if (!isAdultModeOn()) return
    setError('')
    try {
      await whenBridgeReady()
      const native = getNative()
      const modules = asModules(await native.listModules?.())
      const nsfwEnabled = modules.filter((m) => m.nsfw && m.enabled)
      let id = getAdultPrimaryModuleId()
      if (!id || !nsfwEnabled.some((m) => m.id === id)) {
        id = nsfwEnabled[0]?.id ?? null
        if (id) setAdultPrimaryModuleId(id)
      }
      setPrimaryId(id)
      const name = nsfwEnabled.find((m) => m.id === id)?.name ?? ''
      setPrimaryName(name)

      if (!id) {
        setSections([])
        setLoading(false)
        return
      }

      if (!opts?.force && isAdultHomeFresh(id)) {
        const snap = readCachedAdultHome(id) ?? readAdultHomeSnapshot()
        if (snap.sections.some((s) => Array.isArray(s.items) && s.items.length > 0)) {
          setSections(snap.sections)
          setPrimaryName(snap.primaryName || name)
          setLoading(false)
          return
        }
        clearAdultHomeSnapshot(id)
      }

      if (!native.browseAdultHome) {
        setError('Adult browse requires the iOS app')
        setSections([])
        setLoading(false)
        return
      }

      // Instant paint from per-provider cache while refreshing.
      const cached = readCachedAdultHome(id)
      if (cached) {
        setSections(cached.sections)
        setPrimaryName(cached.primaryName || name)
        setLoading(false)
      } else if (!readAdultHomeSnapshot().ready) {
        setLoading(true)
      }

      const railQueries = adultHomeRailQueries(id)
      const railTitles = adultHomeRailTitles(id)
      const browsed = await native.browseAdultHome({
        moduleId: id,
        allowNsfw: true,
        railQueries,
        railTitles
      })
      const next = Array.isArray(browsed.sections) ? browsed.sections : []
      const moduleGenres = (browsed.genres ?? []) as AdultGenre[]
      // If native ignored railQueries (older build), fill once in parallel.
      let rails: AdultHomeSection[] = next.map((s, i) => ({
        ...s,
        title: adultHomeRailTitle(
          String(s.title ?? s.name ?? s.id ?? railTitles[i] ?? `Section ${i + 1}`)
        )
      }))
      if (rails.length === 0 && native.searchAdult && railQueries.length > 0) {
        const settled = await Promise.allSettled(
          railQueries.map(async (query, i) => {
            const { results } = await native.searchAdult!({
              moduleId: id!,
              query,
              allowNsfw: true
            })
            const items = Array.isArray(results) ? results.slice(0, 24) : []
            const section: AdultHomeSection = {
              id: query.toLowerCase(),
              title: railTitles[i] ?? adultHomeRailTitle(query),
              items
            }
            return section
          })
        )
        rails = settled
          .filter((r): r is PromiseFulfilledResult<AdultHomeSection> => r.status === 'fulfilled')
          .map((r) => r.value)
          .filter((s) => sectionItems(s).length > 0)
      }

      setSections(rails)
      writeAdultHomeSnapshot({
        moduleId: id,
        primaryName: name,
        sections: rails,
        genres: moduleGenres,
        ready: true
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      if (!readAdultHomeSnapshot().ready) setSections([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setPrimaryId(getAdultPrimaryModuleId())
    void load()
    return subscribeAdultMode(() => {
      // Primary switch and master switch both emit here.
      void load({ force: false })
    })
  }, [load])

  const heroSlides = useMemo(() => {
    if (!primaryId) return []
    const flat: AdultSearchHit[] = []
    for (const section of sections) {
      for (const hit of sectionItems(section)) {
        if (adultHitUrl(hit)) flat.push(hit)
        if (flat.length >= 8) break
      }
      if (flat.length >= 8) break
    }
    return flat.map((hit) => {
      const url = adultHitUrl(hit)!
      const title = adultHitTitle(hit)
      return {
        title,
        image: adultHitImage(hit),
        href: adultTitleHref(primaryId, url, title, adultHitImage(hit)),
        subtitle: primaryName || undefined
      }
    })
  }, [primaryId, primaryName, sections])

  return (
    <AdultModeGate>
      {loading && sections.length === 0 ? (
        <div className="relative h-[min(70vh,620px)] min-h-[380px] overflow-hidden bg-background">
          <div
            className="absolute inset-x-0 bottom-0 flex flex-col justify-end px-4 pb-6 sm:px-5"
            style={{ paddingTop: 'calc(var(--safe-top) + 4.75rem)' }}
          >
            <Skeleton className="h-8 w-2/3 max-w-xs bg-white/10" />
            <Skeleton className="mt-2 h-3 w-1/2 max-w-sm bg-white/10" />
          </div>
        </div>
      ) : heroSlides.length > 0 ? (
        <AdultHeroCarousel items={heroSlides} />
      ) : null}

      <div className="px-4 pt-0 sm:px-5">
        {error ? <p className="mb-4 mt-3 text-sm text-destructive">{error}</p> : null}

        {loading && sections.length === 0 ? (
          <>
            <RailSkeleton />
            <RailSkeleton />
          </>
        ) : !primaryId ? (
          <HomePlaceholderRail
            title="Adult"
            description="Install an NSFW module in Adult settings, enable it, then set it as primary."
            ctaHref="/app/adult/settings/"
            ctaLabel="Open Adult settings"
            className="!mt-4"
          />
        ) : (
          <>
            {sections.length === 0 ? (
              <HomePlaceholderRail
                title={primaryName || 'Adult'}
                description="Nothing on the home rails yet — search titles or pick a genre."
                ctaHref="/app/adult/search/"
                ctaLabel="Open Adult search"
                className="!mt-4"
              />
            ) : null}

            {(() => {
              const seenUrls = new Set<string>()
              return sections.map((section, i) => {
                const raw = sectionItems(section).filter((h) => adultHitUrl(h))
                const items = preferUnseenAdultHits(raw, seenUrls, 24)
                if (!items.length || !primaryId) return null
                const title = sectionTitle(section, i)
                const queryId = String(section.id ?? '')
                return (
                  <PosterRail
                    key={section.id ?? title}
                    title={title}
                    className={i === 0 ? '!mt-4' : undefined}
                    viewMoreHref={
                      queryId.startsWith('order:')
                        ? '/app/adult/search/'
                        : `/app/adult/search/?genre=${encodeURIComponent(title)}`
                    }
                  >
                    {items.map((hit, j) => {
                      const url = adultHitUrl(hit)!
                      const name = adultHitTitle(hit)
                      const image = adultHitImage(hit)
                      return (
                        <PosterCard
                          key={`${url}-${j}`}
                          size="lg"
                          href={adultTitleHref(primaryId, url, name, image)}
                          image={image}
                          title={name}
                        />
                      )
                    })}
                  </PosterRail>
                )
              })
            })()}
          </>
        )}
      </div>
    </AdultModeGate>
  )
}
