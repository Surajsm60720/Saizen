/** Shared torrent / library types for web ↔ native bridge. */

export type PlayerHint = 'vlc' | 'avplayer'

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
  mediaId: number
  episode: number
  hash: string
  progress: number
  date: number
  size: number
  name: string
  files: number
}

export interface ClientSettings {
  torrentPersist: boolean
  torrentStreamedDownload: boolean
  torrentSpeed: number
  maxConns: number
}
