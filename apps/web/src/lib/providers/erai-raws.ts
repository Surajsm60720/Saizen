import type { ProviderQuery, ProviderResult, TorrentProvider } from './types'

/**
 * Erai-raws releases via AnimeTosho RSS (Erai’s own feed needs a personal token).
 */
export const eraiRawsProvider: TorrentProvider = {
  id: 'erai-raws',
  name: 'Erai-raws',
  description: 'Erai-raws multi-sub releases via AnimeTosho RSS mirror.',
  enabled: false,
  async search(query: ProviderQuery): Promise<ProviderResult[]> {
    const candidates = uniqueTitles(query)
    if (!candidates.length) return []

    let lastError = ''
    for (const title of candidates) {
      try {
        const url = `https://feed.animetosho.org/rss2?only_tor=1&q=${encodeURIComponent(`[Erai-raws] ${title}`)}`
        const res = await fetch(url, {
          headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*' }
        })
        if (!res.ok) {
          throw new Error(`AnimeTosho HTTP ${res.status} for “${title}”`)
        }
        const xml = await res.text()
        const matched = parseAnimeToshoRss(xml, this.id, this.name, query.episode, true)
        if (matched.length) return matched
        const loose = parseAnimeToshoRss(xml, this.id, this.name, query.episode, false)
        if (loose.length) return loose
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
      }
    }

    if (lastError) throw new Error(lastError)
    return []
  }
}

function uniqueTitles(query: ProviderQuery): string[] {
  const raw = [query.title, ...query.titles]
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of raw) {
    const s = (t || '').trim()
    if (!s) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out.slice(0, 4)
}

function parseAnimeToshoRss(
  xml: string,
  providerId: string,
  providerName: string,
  episode: number,
  requireEpisode: boolean
): ProviderResult[] {
  const results: ProviderResult[] = []
  const itemRx = /<item>([\s\S]*?)<\/item>/gi
  let m: RegExpExecArray | null
  const padded = String(episode).padStart(2, '0')

  while ((m = itemRx.exec(xml)) !== null && results.length < 24) {
    const item = m[1]!
    const title = textOf(item, 'title')
    if (!title || !/erai-raws/i.test(title)) continue
    if (requireEpisode && !titleMatchesEpisode(title, episode, padded)) continue

    const magnet = magnetFromItem(item, title)
    const torrentUrl = torrentUrlFromItem(item)
    if (!magnet && !torrentUrl) continue

    results.push({
      providerId,
      providerName,
      title,
      magnet,
      torrentUrl,
      resolution: guessRes(title),
      size: sizeFromDescription(item)
    })
  }
  return results
}

function textOf(item: string, tag: string): string {
  const m = item.match(
    new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i')
  )
  return (m?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').trim()
}

function torrentUrlFromItem(item: string): string | undefined {
  const enc = item.match(/<enclosure[^>]+url="([^"]+)"/i)?.[1]
  if (!enc) return undefined
  const url = enc.replace(/&amp;/g, '&')
  if (!/\.torrent(\?|$)/i.test(url) && !/\/torrent\//i.test(url)) return undefined
  // Prefer https — iOS ATS + reliability
  if (url.startsWith('http://')) return 'https://' + url.slice('http://'.length)
  return url
}

function magnetFromItem(item: string, title: string): string | undefined {
  const direct = item.match(/magnet:\?[^<"'\s]+/i)?.[0]
  if (direct) return direct.replace(/&amp;/g, '&')

  const enc = item.match(/<enclosure[^>]+url="([^"]+)"/i)?.[1]
  if (!enc) return undefined
  const hash = enc.match(/\/torrent\/([a-fA-F0-9]{40})\//)?.[1]
  if (!hash) return undefined
  const dn = encodeURIComponent(title)
  return (
    `magnet:?xt=urn:btih:${hash}&dn=${dn}` +
    '&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce' +
    '&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce' +
    '&tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce'
  )
}

function titleMatchesEpisode(title: string, episode: number, padded: string): boolean {
  if (new RegExp(` - 0*${episode}(?:\\s|\\[|$)`).test(title)) return true
  if (new RegExp(` - ${padded}(?:\\s|\\[|$)`).test(title)) return true
  return new RegExp(`(?:^|[^0-9])0*${episode}(?:[^0-9]|$)`).test(title)
}

function guessRes(title: string): string | undefined {
  return title.match(/\b(2160p|1080p|720p|480p)\b/i)?.[1]
}

function sizeFromDescription(item: string): number | undefined {
  const desc = textOf(item, 'description')
  const m = desc.match(/([\d.]+)\s*(GiB|MiB|GB|MB)/i)
  if (!m) return undefined
  const n = Number(m[1])
  const unit = m[2]!.toUpperCase()
  if (unit.startsWith('G')) return Math.round(n * 1024 * 1024 * 1024)
  if (unit.startsWith('M')) return Math.round(n * 1024 * 1024)
  return undefined
}
