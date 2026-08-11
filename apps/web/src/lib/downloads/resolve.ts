import type { DownloadQuality, StreamCandidate } from '@saizen/shared'

function qualityRank(q: string | undefined): number {
  if (!q) return 0
  const m = q.match(/(\d{3,4})/)
  return m ? Number(m[1]) : 0
}

/**
 * Pick a CDN stream for offline download closest to the preferred quality.
 * Prefers exact match, then nearest lower, then nearest higher.
 */
export function pickStreamForQuality(
  candidates: StreamCandidate[],
  preferred: DownloadQuality
): StreamCandidate | null {
  if (!candidates.length) return null
  const want = Number(preferred.replace('p', '')) || 1080
  const scored = candidates.map((c) => {
    const q = qualityRank(c.quality) || qualityRank(c.title)
    const kindBonus = c.kind === 'hls' || c.kind === 'mp4' ? 1 : 0
    return { c, q, kindBonus }
  })
  const exact = scored.filter((s) => s.q === want)
  if (exact.length) {
    return exact.sort((a, b) => b.kindBonus - a.kindBonus)[0]!.c
  }
  const lower = scored.filter((s) => s.q > 0 && s.q <= want).sort((a, b) => b.q - a.q)
  if (lower.length) return lower[0]!.c
  const higher = scored.filter((s) => s.q > want).sort((a, b) => a.q - b.q)
  if (higher.length) return higher[0]!.c
  return scored[0]!.c
}
