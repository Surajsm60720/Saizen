/** AniList outage / catalog fallback mode. */

export type CatalogProvider = 'anilist' | 'jikan'

type Status = {
  provider: CatalogProvider
  reason: string | null
  since: number | null
  /** When to probe AniList again while in fallback. */
  probeAfter: number | null
}

const FALLBACK_TTL_MS = 20 * 60 * 1000
const PROBE_EVERY_MS = 2 * 60 * 1000

let status: Status = {
  provider: 'anilist',
  reason: null,
  since: null,
  probeAfter: null
}

const listeners = new Set<(s: Status) => void>()

function emit() {
  for (const fn of listeners) {
    try {
      fn({ ...status })
    } catch {
      /* ignore */
    }
  }
}

export function getCatalogStatus(): Status {
  return { ...status }
}

export function isCatalogFallback(): boolean {
  return status.provider === 'jikan'
}

export function subscribeCatalogStatus(fn: (s: Status) => void): () => void {
  listeners.add(fn)
  fn({ ...status })
  return () => {
    listeners.delete(fn)
  }
}

export function enterCatalogFallback(reason: string) {
  const now = Date.now()
  status = {
    provider: 'jikan',
    reason,
    since: status.since ?? now,
    probeAfter: now + PROBE_EVERY_MS
  }
  emit()
}

export function leaveCatalogFallback() {
  if (status.provider === 'anilist') return
  status = {
    provider: 'anilist',
    reason: null,
    since: null,
    probeAfter: null
  }
  emit()
}

/** True when we should try AniList again despite being in fallback. */
export function shouldProbeAniList(): boolean {
  if (forceFallbackEnabled()) return false
  if (status.provider !== 'jikan') return true
  if (status.since != null && Date.now() - status.since > FALLBACK_TTL_MS) return true
  if (status.probeAfter != null && Date.now() >= status.probeAfter) return true
  return false
}

/** Dev/test: `localStorage.setItem('saizen:force-catalog-fallback','1')` then reload. */
export function forceFallbackEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem('saizen:force-catalog-fallback') === '1'
  } catch {
    return false
  }
}

export function noteAniListProbeScheduled() {
  if (status.provider !== 'jikan') return
  status = { ...status, probeAfter: Date.now() + PROBE_EVERY_MS }
}

export function isAniListOutageError(err: unknown): boolean {
  const msg = errorMessage(err)
  if (!msg) return false
  if (/temporarily disabled|severe stability/i.test(msg)) return true
  if (/\[Network\]/i.test(msg)) return true
  if (/\[GraphQL\].*(disabled|403)/i.test(msg)) return true
  if (/failed to fetch|load failed|networkerror|network request failed/i.test(msg)) return true
  if (/anilist http 403|http 403/i.test(msg)) return true
  if (/econnreset|etimedout|enotfound|cert/i.test(msg)) return true
  // urql CombinedError often nests networkError / graphQLErrors
  const any = err as {
    networkError?: unknown
    response?: { status?: number }
    graphQLErrors?: Array<{ message?: string; status?: number; extensions?: { status?: number } }>
  }
  if (any?.response?.status === 403) return true
  if (any?.networkError) return true
  if (any?.graphQLErrors?.some((g) => g.status === 403 || g.extensions?.status === 403)) {
    return true
  }
  if (
    any?.graphQLErrors?.some((g) =>
      /temporarily disabled|severe stability/i.test(g.message || '')
    )
  ) {
    return true
  }
  return false
}

function errorMessage(err: unknown): string {
  if (!err) return ''
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  const any = err as { message?: string; graphQLErrors?: Array<{ message?: string }> }
  if (any.graphQLErrors?.[0]?.message) return any.graphQLErrors[0].message
  if (typeof any.message === 'string') return any.message
  try {
    return String(err)
  } catch {
    return ''
  }
}
