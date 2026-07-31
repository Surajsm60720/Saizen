import type { ProviderQuery, ProviderResult, TorrentProvider } from './types'

/**
 * Nyaa.si RSS/search provider (unofficial HTML scrape via CORS proxy optional).
 * For personal sideload testing. Returns magnet links when parse succeeds.
 *
 * NOTE: Direct browser fetch to nyaa may be blocked by CORS in desktop web.
 * On Capacitor/iOS, CapacitorHttp or native fetch may work; otherwise search
 * falls back to empty + toast. Prefer Test Sample provider for pipeline checks.
 */
export const nyaaProvider: TorrentProvider = {
  id: 'nyaa',
  name: 'Nyaa',
  description: 'Anime torrent index (magnet). May require native CORS bypass on mobile.',
  // Off by default — many ISPs block nyaa.si (TLS failures). Use SubsPlease / Erai-raws.
  enabled: false,
  async search(query: ProviderQuery): Promise<ProviderResult[]> {
    const title = query.titles[0] || query.title
    const q = `${title} ${query.episode}`.trim()
    const url = `https://nyaa.si/?f=0&c=1_2&q=${encodeURIComponent(q)}&s=seeders&o=desc`

    try {
      const res = await fetch(url, {
        headers: { Accept: 'text/html' }
      })
      if (!res.ok) return []
      const html = await res.text()
      return parseNyaaHtml(html, this.id, this.name)
    } catch {
      // CORS or network — return empty; UI will show message
      return []
    }
  }
}

function parseNyaaHtml(html: string, providerId: string, providerName: string): ProviderResult[] {
  const results: ProviderResult[] = []
  // Match magnet links and nearby title cells (best-effort scrape)
  const rowRx =
    /<tr[^>]*>[\s\S]*?href="(magnet:\?xt=urn:btih:[^"]+)"[\s\S]*?<a[^>]*title="([^"]+)"[\s\S]*?<\/tr>/gi
  let match: RegExpExecArray | null
  while ((match = rowRx.exec(html)) !== null && results.length < 20) {
    const magnet = match[1]!.replace(/&amp;/g, '&')
    const title = match[2]!
    results.push({
      providerId,
      providerName,
      title,
      magnet,
      resolution: guessRes(title)
    })
  }

  // Fallback: magnets only
  if (!results.length) {
    const magnetRx = /href="(magnet:\?xt=urn:btih:[a-fA-F0-9]{40}[^"]*)"/g
    let m: RegExpExecArray | null
    while ((m = magnetRx.exec(html)) !== null && results.length < 15) {
      results.push({
        providerId,
        providerName,
        title: `Nyaa result ${results.length + 1}`,
        magnet: m[1]!.replace(/&amp;/g, '&')
      })
    }
  }
  return results
}

function guessRes(title: string): string | undefined {
  const m = title.match(/\b(2160p|1080p|720p|480p)\b/i)
  return m?.[1]
}
