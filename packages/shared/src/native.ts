import type { ClientSettings, LibraryEntry, PlayerHint, TorrentFile, TorrentInfo } from './torrent'

export interface AuthResponse {
  access_token: string
  expires_in: string
  token_type: 'Bearer'
}

export interface MalAuthCodeResponse {
  code: string
  state: string
}

export interface SpawnPlayerOptions {
  url: string
  playerHint?: PlayerHint
  title?: string
  episode?: number
  /** AniList media id — required for native watch-progress events */
  anilistId?: number
  idMal?: number | null
}

/** Emitted by SaizenPlayer `playbackProgress` (native → JS). */
export interface NativePlaybackProgress {
  anilistId: number
  episode: number
  positionSec: number
  durationSec: number
  idMal?: number | null
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

  authAnilist(url: string): Promise<AuthResponse | MalAuthCodeResponse>
  authMAL(url: string): Promise<MalAuthCodeResponse>
  getSecureItem?(key: string): Promise<string | null>
  setSecureItem?(key: string, value: string): Promise<void>
  deleteSecureItem?(key: string): Promise<void>

  playTorrent(
    id: string | ArrayBufferView,
    mediaId: number,
    episode: number
  ): Promise<TorrentFile[]>
  spawnPlayer(options: SpawnPlayerOptions): Promise<void>
  stopPlayer(): Promise<void>
  /** Subscribe to native player position updates. Returns unsubscribe. */
  onPlaybackProgress?(
    cb: (progress: NativePlaybackProgress) => void
  ): Promise<() => void> | (() => void)

  torrentInfo(hash: string): Promise<TorrentInfo>
  library(): Promise<LibraryEntry[]>
  deleteTorrents(hashes?: string[]): Promise<void>
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
