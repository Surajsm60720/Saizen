/** Shared torrent / library types for web ↔ native bridge. */

export type PlayerHint = 'vlc' | 'avplayer'

export type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'failed'

export type DownloadQuality = '2160p' | '1080p' | '720p' | '480p'

export type DownloadKind = 'torrent' | 'http'

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
  status?: DownloadStatus
  kind?: DownloadKind
  relativePath?: string
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
