import type { ClientSettings, LibraryEntry, PlayerHint, TorrentFile, TorrentInfo } from './torrent'

export interface AuthResponse {
  access_token: string
  expires_in: string
  token_type: 'Bearer'
}

export interface SpawnPlayerOptions {
  url: string
  playerHint?: PlayerHint
  title?: string
  episode?: number
}

/**
 * Capacitor native bridge contract (window.saizen).
 * Implement incrementally — stubs must never throw.
 */
export interface SaizenNative {
  isApp: boolean
  version(): Promise<string>
  openURL(url: string): Promise<void>
  share(data: ShareData): Promise<void>
  getDeviceInfo(): Promise<Record<string, unknown>>

  authAnilist(url: string): Promise<AuthResponse>
  authMAL(url: string): Promise<{ code: string; state: string }>

  playTorrent(
    id: string | ArrayBufferView,
    mediaId: number,
    episode: number
  ): Promise<TorrentFile[]>
  spawnPlayer(options: SpawnPlayerOptions): Promise<void>
  stopPlayer(): Promise<void>

  torrentInfo(hash: string): Promise<TorrentInfo>
  library(): Promise<LibraryEntry[]>
  deleteTorrents(hashes: string[]): Promise<void>
  cachedTorrents(): Promise<string[]>
  updateSettings(settings: ClientSettings): Promise<void>
  checkAvailableSpace(): Promise<number>

  setMediaSession?(title: string, description: string, image: string): Promise<void>
}

declare global {
  interface Window {
    saizen?: Partial<SaizenNative>
  }
}

export type { ClientSettings, LibraryEntry, PlayerHint, TorrentFile, TorrentInfo }
