/** Torrent source providers — search anime episode → list of magnets/links. */

export interface ProviderQuery {
  anilistId: number
  title: string
  titles: string[]
  episode: number
  episodeCount?: number | null
}

export interface ProviderResult {
  providerId: string
  providerName: string
  title: string
  magnet?: string
  /** Direct .torrent file URL (preferred — skips magnet metadata exchange) */
  torrentUrl?: string
  /** Direct HTTP(S) media URL for progressive-download test path */
  httpUrl?: string
  size?: number
  seeders?: number
  leechers?: number
  resolution?: string
  isBatch?: boolean
}

export interface TorrentProvider {
  id: string
  name: string
  description: string
  enabled: boolean
  search(query: ProviderQuery): Promise<ProviderResult[]>
}

export type { ProviderQuery as Query }
