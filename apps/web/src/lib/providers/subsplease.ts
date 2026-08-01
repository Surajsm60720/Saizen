import type { ProviderQuery, ProviderResult, TorrentProvider } from './types'

/**
 * SubsPlease JSON search API — no login, usually reachable when Nyaa is ISP-blocked.
 * https://subsplease.org/api/?f=search&tz=$&s=QUERY&p=0
 */
type SpDownload = { res: string; magnet: string }
type SpEntry = {
  key?: string
  show?: string
  episode?: string
  downloads?: SpDownload[]
}

export const subspleaseProvider: TorrentProvider = {
  id: 'subsplease',
  name: 'SubsPlease',
  description: 'Fansub releases via SubsPlease JSON API (1080p / 720p / 480p magnets).',
  enabled: false,
  async search(query: ProviderQuery): Promise<ProviderResult[]> {
    const candidates = uniqueTitles(query)
    if (!candidates.length) return []

    let lastError = ''
    for (const title of candidates) {
      try {
        const entries = await fetchSearch(title)
        if (!entries.length) continue

        const matched = resultsFromEntries(entries, this.id, this.name, query.episode, true)
        if (matched.length) return preferHigherRes(matched)

        // Episode filter too strict / show uses different ep numbering — still show hits
        const loose = resultsFromEntries(entries, this.id, this.name, query.episode, false)
        if (loose.length) return preferHigherRes(loose)
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

async function fetchSearch(title: string): Promise<SpEntry[]> {
  const url = `https://subsplease.org/api/?f=search&tz=%24&s=${encodeURIComponent(title)}&p=0`
  const res = await fetch(url, {
    headers: { Accept: 'application/json' }
  })
  if (!res.ok) {
    throw new Error(`SubsPlease HTTP ${res.status} for “${title}”`)
  }

  // CapacitorHttp may already parse JSON into an object
  const raw: unknown = await res.json()
  const data = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw
  if (!data || typeof data !== 'object') return []

  if (Array.isArray(data)) return data as SpEntry[]
  return Object.entries(data as Record<string, SpEntry>).map(([key, v]) => ({
    key,
    ...v
  }))
}

function resultsFromEntries(
  entries: SpEntry[],
  providerId: string,
  providerName: string,
  episode: number,
  requireEpisode: boolean
): ProviderResult[] {
  const out: ProviderResult[] = []
  for (const entry of entries) {
    const key = entry.key ?? ''
    const show = entry.show || key || 'Unknown'
    const epLabel = String(entry.episode ?? '')
    if (requireEpisode && !episodeMatches(epLabel, key, episode)) continue

    for (const dl of entry.downloads ?? []) {
      if (!dl.magnet?.startsWith('magnet:')) continue
      const resLabel = dl.res ? `${dl.res}p` : undefined
      out.push({
        providerId,
        providerName,
        title: `[SubsPlease] ${show} - ${epLabel || '?'} (${resLabel ?? '?'})`,
        magnet: dl.magnet,
        resolution: resLabel,
        size: sizeFromMagnet(dl.magnet)
      })
      if (out.length >= 24) return out
    }
  }
  return out
}

function episodeMatches(epLabel: string, key: string, raw: number): boolean {
  const padded = String(raw).padStart(2, '0')
  const label = epLabel.trim()
  const hay = `${label} ${key}`.toLowerCase()

  if (label === padded || label === String(raw)) return true
  if (new RegExp(`(?:^|[^0-9])0*${raw}(?:[^0-9]|$)`).test(label)) return true
  if (hay.includes(` - ${padded}`) || hay.includes(`-${padded}`) || hay.includes(` - ${raw} `)) {
    return true
  }

  const range = label.match(/^(\d+)\s*-\s*(\d+)$/)
  if (range) {
    const a = Number(range[1])
    const b = Number(range[2])
    if (raw >= a && raw <= b) return true
  }
  return false
}

function sizeFromMagnet(magnet: string): number | undefined {
  const m = magnet.match(/[?&]xl=(\d+)/i)
  return m ? Number(m[1]) : undefined
}

function preferHigherRes(results: ProviderResult[]): ProviderResult[] {
  const rank = (r?: string) => {
    if (!r) return 0
    if (r.includes('1080')) return 3
    if (r.includes('720')) return 2
    if (r.includes('480')) return 1
    return 0
  }
  return [...results].sort((a, b) => rank(b.resolution) - rank(a.resolution))
}
