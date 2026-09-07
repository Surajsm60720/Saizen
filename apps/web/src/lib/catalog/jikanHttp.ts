import { saizenFetch } from '@/lib/extensions/fetch'
import { MAL_CATALOG_BASES } from './malCatalogBases'

const MIN_INTERVAL_MS = 350
let lastAt = 0
let chain: Promise<void> = Promise.resolve()

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastAt))
    if (wait) await new Promise((r) => setTimeout(r, wait))
    lastAt = Date.now()
    return fn()
  })
  chain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

/**
 * GET a Jikan-compatible path. Tries Tenrai first, then public Jikan.
 * Absolute URLs are fetched as-is (no base failover).
 */
export async function jikanGet<T>(path: string, init?: RequestInit): Promise<T> {
  if (path.startsWith('http')) {
    return enqueue(() => fetchJson<T>(path, init))
  }
  const suffix = path.startsWith('/') ? path : `/${path}`

  return enqueue(async () => {
    let lastErr: Error | null = null
    for (const base of MAL_CATALOG_BASES) {
      try {
        return await fetchJson<T>(`${base}${suffix}`, init)
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e))
        // Try next host on gateway / rate-limit style failures.
        if (!/HTTP (429|500|502|503|504)/i.test(lastErr.message)) throw lastErr
      }
    }
    throw lastErr ?? new Error('MAL catalog request failed')
  })
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let lastErr: Error | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await saizenFetch(url, {
      ...init,
      method: init?.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(init?.headers as Record<string, string> | undefined)
      }
    })
    if (isRetryableStatus(res.status)) {
      lastErr = new Error(`HTTP ${res.status}`)
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
      continue
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(text.slice(0, 180) || `HTTP ${res.status}`)
    }
    return (await res.json()) as T
  }
  throw lastErr ?? new Error('MAL catalog request failed')
}
