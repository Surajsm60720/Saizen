/**
 * Many ISPs/regions reset TLS to nyaa.si / sukebei.nyaa.si (NSURLError -1200 / -9805).
 * Prefer public mirrors first; keep the original host as a last resort.
 */
const HOST_MIRRORS: Record<string, string[]> = {
  'sukebei.nyaa.si': ['sukebei.nyaa.net', 'sukebei.iss.one'],
  'nyaa.si': ['nyaa.iss.one']
}

/**
 * Nyaa/Sukebei episode filters use literal `+` (e.g. `"E01+"`). URL loaders treat
 * bare `+` as space, which turns the query into `"E01 "` / `" 01 "` and returns
 * unrelated torrents. Encode before CapacitorHttp / fetch.
 */
function encodeQueryPluses(url: string): string {
  const i = url.indexOf('?')
  if (i < 0) return url
  return url.slice(0, i + 1) + url.slice(i + 1).replace(/\+/g, '%2B')
}

function swapHostname(url: string, host: string): string | null {
  const m = url.match(/^(https?:\/\/)([^/?#]+)(.*)$/i)
  if (!m) return null
  return `${m[1]}${host}${m[3]}`
}

function candidateUrls(url: string): string[] {
  const m = url.match(/^https?:\/\/([^/?#]+)/i)
  if (!m) return [encodeQueryPluses(url)]
  const hostname = m[1]!.toLowerCase()
  const mirrors = HOST_MIRRORS[hostname]
  // Canonical host first; mirrors only after TLS/network failure (supply-chain).
  const raw = mirrors?.length
    ? [url, ...mirrors.map((h) => swapHostname(url, h)!).filter(Boolean)]
    : [url]
  // Dedupe while preserving order
  const seen = new Set<string>()
  const out: string[] = []
  for (const u of raw) {
    const fixed = encodeQueryPluses(u)
    if (seen.has(fixed)) continue
    seen.add(fixed)
    out.push(fixed)
  }
  return out
}

/**
 * Capacitor-aware fetch for extension code + extension network calls.
 * On native, CapacitorHttp bypasses WKWebView CORS.
 */
export async function saizenFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const urls = candidateUrls(url)

  try {
    const { Capacitor, CapacitorHttp } = await import('@capacitor/core')
    if (Capacitor.isNativePlatform()) {
      const method = (init?.method ?? 'GET').toUpperCase()
      const headers: Record<string, string> = {
        // Many trackers (Nyaa/Sukebei) reject empty/non-browser UAs.
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      }
      if (init?.headers) {
        const h = new Headers(init.headers)
        h.forEach((v, k) => {
          headers[k] = v
        })
      }
      const hasAuth = Object.keys(headers).some((k) => k.toLowerCase() === 'authorization')
      // Never forward Authorization to mirror hosts (token leak footgun).
      const tryUrls = hasAuth ? [encodeQueryPluses(url)] : urls

      let data: string | undefined
      if (init?.body != null) {
        if (typeof init.body === 'string') {
          data = init.body
        } else if (
          typeof URLSearchParams !== 'undefined' &&
          init.body instanceof URLSearchParams
        ) {
          // String(URLSearchParams) => "[object URLSearchParams]" — breaks MAL OAuth.
          data = init.body.toString()
        } else if (typeof Blob !== 'undefined' && init.body instanceof Blob) {
          data = await init.body.text()
        } else {
          data = String(init.body)
        }
      }

      let lastErr: unknown
      for (const candidate of tryUrls) {
        try {
          const res = await CapacitorHttp.request({
            url: candidate,
            method,
            headers,
            data,
            // Always text so JS sources stay strings; JSON catalogs are parsed below.
            responseType: 'text'
          })
          const status =
            typeof res.status === 'number' && res.status >= 200 && res.status < 600
              ? res.status
              : 200
          let body: string
          if (typeof res.data === 'string') {
            body = res.data
          } else if (res.data == null) {
            body = ''
          } else {
            // Capacitor sometimes auto-parses JSON despite responseType: 'text'
            body = JSON.stringify(res.data)
          }
          return new Response(body, {
            status,
            headers: (res.headers ?? {}) as HeadersInit
          })
        } catch (e) {
          lastErr = e
          // Keep trying mirrors; only give up after the last candidate.
          if (candidate === tryUrls[tryUrls.length - 1]) break
        }
      }
      if (lastErr) throw lastErr
    }
  } catch {
    // Fall through to window.fetch (web / Capacitor unavailable)
  }

  const webHasAuth =
    init?.headers != null &&
    new Headers(init.headers).has('Authorization')
  const webUrls = webHasAuth ? [encodeQueryPluses(url)] : urls

  let lastFetchErr: unknown
  for (const candidate of webUrls) {
    try {
      return await fetch(candidate, init)
    } catch (e) {
      lastFetchErr = e
      if (candidate === webUrls[webUrls.length - 1]) break
    }
  }
  if (lastFetchErr) throw lastFetchErr
  return fetch(url, init)
}

/** Text helper for loading JSON catalogs / mappings. */
export async function saizenFetchJson<T>(url: string): Promise<T> {
  const res = await saizenFetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Invalid JSON from ${url}`)
  }
}
