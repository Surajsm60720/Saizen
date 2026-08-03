/** AniSkip — crowdsourced OP/ED timestamps by MAL id. No auth required. */

import type { SkipInterval, SkipTimes } from '@saizen/shared'

const BASE = 'https://api.aniskip.com/v2'

type ApiInterval = {
  startTime?: number
  endTime?: number
}

type ApiResult = {
  interval?: ApiInterval
  skipType?: string
  episodeLength?: number
}

type ApiResponse = {
  found?: boolean
  results?: ApiResult[]
}

function toInterval(raw?: ApiInterval): SkipInterval | undefined {
  if (!raw) return undefined
  const start = Number(raw.startTime)
  const end = Number(raw.endTime)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return undefined
  return { start, end }
}

/**
 * Fetch OP/ED skip intervals for a MAL anime + episode.
 * Returns `null` on network/API miss (fail soft).
 *
 * @param episodeLengthSec AniSkip filter; `0` means return all matches (API-required param).
 */
export async function fetchSkipTimes(
  malId: number,
  episode: number,
  episodeLengthSec = 0,
  signal?: AbortSignal
): Promise<SkipTimes | null> {
  if (!Number.isFinite(malId) || malId <= 0) return null
  if (!Number.isFinite(episode) || episode <= 0) return null

  const url = new URL(`${BASE}/skip-times/${malId}/${episode}`)
  url.searchParams.append('types', 'op')
  url.searchParams.append('types', 'ed')
  url.searchParams.set(
    'episodeLength',
    String(Number.isFinite(episodeLengthSec) && episodeLengthSec > 0 ? Math.round(episodeLengthSec) : 0)
  )

  try {
    const res = await fetch(url.toString(), {
      signal,
      headers: { Accept: 'application/json' }
    })
    if (!res.ok) return null
    const data = (await res.json()) as ApiResponse
    if (!data.found || !data.results?.length) return null

    const out: SkipTimes = {}
    for (const row of data.results) {
      const interval = toInterval(row.interval)
      if (!interval) continue
      const kind = (row.skipType || '').toLowerCase()
      if (kind === 'op' || kind === 'mixed-op') {
        if (!out.op) out.op = interval
      } else if (kind === 'ed' || kind === 'mixed-ed') {
        if (!out.ed) out.ed = interval
      }
    }
    return out.op || out.ed ? out : null
  } catch {
    return null
  }
}
