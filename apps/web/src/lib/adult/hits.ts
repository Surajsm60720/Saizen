import type { AdultSearchHit } from '@saizen/shared'

export function adultHitTitle(hit: AdultSearchHit): string {
  const t = hit.title ?? hit.name
  return typeof t === 'string' && t.trim() ? t.trim() : 'Untitled'
}

export function adultHitUrl(hit: AdultSearchHit): string | null {
  const u = hit.url ?? hit.href
  return typeof u === 'string' && u.trim() ? u.trim() : null
}

export function adultHitImage(hit: AdultSearchHit): string | undefined {
  const img = hit.image ?? hit.poster ?? hit.cover
  return typeof img === 'string' && img.trim() ? img.trim() : undefined
}

export function adultTitleHref(
  moduleId: string,
  showUrl: string,
  title?: string,
  image?: string
): string {
  const q = new URLSearchParams({
    moduleId,
    showUrl,
    ...(title ? { title } : {}),
    ...(image ? { image } : {})
  })
  return `/app/adult/title/?${q.toString()}`
}

/** Prefer first-seen URL when the same title appears on multiple home rails. */
export function dedupeAdultHitsByUrl<T extends AdultSearchHit>(
  hits: T[],
  seenUrls: Set<string>
): T[] {
  const out: T[] = []
  for (const hit of hits) {
    const url = adultHitUrl(hit)
    if (!url) continue
    const key = url.replace(/\/+$/, '').toLowerCase()
    if (seenUrls.has(key)) continue
    seenUrls.add(key)
    out.push(hit)
  }
  return out
}

/**
 * Prefer unseen titles across rails, but never wipe a rail that had items.
 * Hard cross-rail dedupe was hiding New releases / Most viewed when modules
 * returned overlapping catalog pages.
 */
export function preferUnseenAdultHits<T extends AdultSearchHit>(
  hits: T[],
  seenUrls: Set<string>,
  limit = 24
): T[] {
  const fresh: T[] = []
  const reused: T[] = []
  for (const hit of hits) {
    const url = adultHitUrl(hit)
    if (!url) continue
    const key = url.replace(/\/+$/, '').toLowerCase()
    if (seenUrls.has(key)) reused.push(hit)
    else fresh.push(hit)
  }
  const out = [...fresh, ...reused].slice(0, limit)
  for (const hit of out) {
    const url = adultHitUrl(hit)
    if (!url) continue
    seenUrls.add(url.replace(/\/+$/, '').toLowerCase())
  }
  return out
}
