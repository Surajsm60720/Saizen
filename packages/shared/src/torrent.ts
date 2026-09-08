/** Shared torrent / library types for web ↔ native bridge. */

export type PlayerHint = 'vlc' | 'avplayer'

export type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'failed'

export type DownloadQuality = '2160p' | '1080p' | '720p' | '480p'

export type DownloadKind = 'torrent' | 'http' | 'hls'

export interface TorrentFile {
  id: number
  name: string
  hash: string
  size: number
  /** Loopback stream URL, e.g. http://127.0.0.1:7344/0/stream */
  url: string
  playerHint: PlayerHint
}

export interface TorrentInfo {
  name: string
  hash: string
  progress: number
  size: {
    total: number
    downloaded: number
    uploaded: number
  }
  speed: {
    down: number
    up: number
  }
  time: {
    remaining: number
    elapsed: number
  }
  peers: {
    seeders: number
    leechers: number
    wires: number
  }
  pieces: {
    total: number
    size: number
  }
}

export interface LibraryEntry {
  id: string
  mediaId: number
  episode: number
  hash: string
  progress: number
  date: number
  size: number
  name: string
  files: number
  seriesTitle?: string
  episodeTitle?: string
  poster?: string
  resolution?: string
  seasonLabel?: string
  sourceLabel?: string
  status?: DownloadStatus
  kind?: DownloadKind
  relativePath?: string
  /** Queued while Incognito Mode was on — hidden from library UI when Incognito is off. */
  isIncognito?: boolean
  /** Adult Mode / NSFW source download — hidden when Adult Mode is off. */
  isAdult?: boolean
}

export interface DownloadJob {
  id: string
  mediaId: number
  episode: number
  seriesTitle: string
  episodeTitle?: string
  poster?: string
  resolution?: string
  sourceLabel?: string
  seasonLabel?: string
  source: string
  kind: DownloadKind
  status: DownloadStatus
  progress: number
  size: number
  downloaded: number
  speed: number
  error?: string
  hash?: string
  isIncognito?: boolean
  isAdult?: boolean
}

export interface EnqueueDownloadOptions {
  source: string
  mediaId: number
  episode: number
  seriesTitle: string
  episodeTitle?: string
  poster?: string
  resolution?: string
  sourceLabel?: string
  seasonLabel?: string
  isIncognito?: boolean
  isAdult?: boolean
  /** When omitted, native infers from source (magnet/.torrent → torrent, .m3u8 → hls, else http). */
  kind?: DownloadKind
  /** Request headers for http/hls CDN downloads (Referer, User-Agent, etc.). */
  headers?: Record<string, string>
}

export interface StorageUsage {
  libraryBytes: number
  cacheBytes: number
  freeBytes: number
}

export interface ClientSettings {
  torrentPersist: boolean
  torrentStreamedDownload: boolean
  torrentSpeed: number
  maxConns: number
  maxParallelDownloads: number
  wifiOnly: boolean
  preferredQuality: DownloadQuality
}
