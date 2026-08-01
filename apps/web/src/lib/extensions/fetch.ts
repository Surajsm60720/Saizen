/**
 * Capacitor-aware fetch for extension code + extension network calls.
 * On native, CapacitorHttp bypasses WKWebView CORS.
 */
export async function saizenFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

  try {
    const { Capacitor, CapacitorHttp } = await import('@capacitor/core')
    if (Capacitor.isNativePlatform()) {
      const method = (init?.method ?? 'GET').toUpperCase()
      const headers: Record<string, string> = {}
      if (init?.headers) {
        const h = new Headers(init.headers)
        h.forEach((v, k) => {
          headers[k] = v
        })
      }
      let data: string | undefined
      if (init?.body != null) {
        data = typeof init.body === 'string' ? init.body : String(init.body)
      }
      const res = await CapacitorHttp.request({
        url,
        method,
        headers,
        data,
        // Always text so JS sources stay strings; JSON catalogs are parsed below.
        responseType: 'text'
      })
      const status =
        typeof res.status === 'number' && res.status >= 200 && res.status < 600 ? res.status : 200
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
    }
  } catch {
    // Fall through to window.fetch (web / Capacitor unavailable)
  }

  return fetch(input, init)
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
