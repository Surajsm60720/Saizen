import type {
  ExtraModuleCatalog,
  InstallModuleFromUrlOptions,
  InstallModuleOptions,
  InstalledModule,
  ModuleCatalogEntry,
  PlayStreamOptions,
  RecordModuleSuccessOptions,
  ResolveAndPlayOptions,
  ResolveStreamsBatchEntry,
  ResolveStreamsBatchOptions,
  ResolveStreamsOptions,
  StreamCandidate
} from './stream'
import type {
  ClientSettings,
  DownloadJob,
  EnqueueDownloadOptions,
  LibraryEntry,
  PlayerHint,
  StorageUsage,
  TorrentFile,
  TorrentInfo
} from './torrent'

export interface AuthResponse {
  /** Native wrote the access token to Keychain — never returned over the bridge. */
  ok?: boolean
  expires_in: string
  token_type?: 'Bearer'
  /** OAuth `state` echoed from the authorize request. */
  state?: string
}

export interface MalAuthCodeResponse {
  code: string
  state: string
}

/** AniSkip opening/ending interval in seconds. */
export interface SkipInterval {
  start: number
  end: number
}

export interface SkipTimes {
  op?: SkipInterval
  ed?: SkipInterval
}

export interface SpawnPlayerOptions {
  url: string
  playerHint?: PlayerHint
  title?: string
  episode?: number
  /** AniList media id — required for native watch-progress events */
  anilistId?: number
  idMal?: number | null
  /** Current source resolution label (e.g. "1080p"), display-only */
  resolution?: string
  /** Short source / release title for the quality chip */
  sourceLabel?: string
  totalEpisodes?: number | null
  hasNextEpisode?: boolean
  /** From watch settings — when true, seek past OP/ED once on enter */
  autoSkipOpEd?: boolean
  gestureSeekEnabled?: boolean
  doubleTapSeekSec?: number
  tripleTapSeekSec?: number
  autoplayNext?: boolean
  skipTimes?: SkipTimes
}

/** Emitted by SaizenPlayer `playbackProgress` (native → JS). */
export interface NativePlaybackProgress {
  anilistId: number
  episode: number
  positionSec: number
  durationSec: number
  idMal?: number | null
}

/** Emitted by SaizenPlayer `playerAction` (native → JS). */
export type NativePlayerAction =
  | { action: 'nextEpisode'; episode: number; anilistId: number }
  | { action: 'changeSource'; episode: number; anilistId: number }

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

  authAnilist(
    url: string,
    options?: { clientId: string; redirectUri?: string }
  ): Promise<AuthResponse | MalAuthCodeResponse>
  authMAL(url: string): Promise<MalAuthCodeResponse>
  /** Native MAL token exchange (URLSession form POST + Basic auth). Persists to Keychain. */
  exchangeMalToken?(options: {
    clientId: string
    code: string
    codeVerifier: string
    redirectUri: string
  }): Promise<{
    ok?: boolean
    expires_in?: number
    token_type?: string
  }>
  /** Native MAL refresh (same URLSession + Basic auth as code exchange). Persists to Keychain. */
  refreshMalToken?(options: {
    clientId: string
    refreshToken: string
  }): Promise<{
    ok?: boolean
    expires_in?: number
    token_type?: string
  }>
  getSecureItem?(key: string): Promise<string | null>
  setSecureItem?(key: string, value: string): Promise<void>
  deleteSecureItem?(key: string): Promise<void>

  playTorrent(
    id: string | ArrayBufferView,
    mediaId: number,
    episode: number
  ): Promise<TorrentFile[]>
  spawnPlayer(options: SpawnPlayerOptions): Promise<void>
  /** CDN HTTPS stream → native player (default hint avplayer). */
  playStream(options: PlayStreamOptions): Promise<void>
  stopPlayer(): Promise<void>
  runModuleDay0Spike?(): Promise<{
    moduleId: string
    sourceName: string
    streamUrl: string
    quality?: string | null
  }>

  /** Installed CDN stream modules (native ModuleStore). */
  listModules?(): Promise<InstalledModule[]>
  browseModuleCatalog?(): Promise<ModuleCatalogEntry[]>
  listExtraModuleCatalogs?(): Promise<ExtraModuleCatalog[]>
  addExtraModuleCatalog?(url: string): Promise<ExtraModuleCatalog[]>
  removeExtraModuleCatalog?(url: string): Promise<ExtraModuleCatalog[]>
  installModule?(options: InstallModuleOptions): Promise<InstalledModule[]>
  installModuleFromUrl?(options: InstallModuleFromUrlOptions): Promise<InstalledModule[]>
  testModule?(options: {
    id: string
    query?: string
  }): Promise<{
    ok: boolean
    message: string
    searchResults?: number
  }>
  setModuleEnabled?(id: string, enabled: boolean): Promise<void>
  reorderModules?(ids: string[]): Promise<InstalledModule[]>
  removeModule?(id: string): Promise<InstalledModule[]>
  /** Ranked CDN stream candidates from enabled modules. */
  resolveStreams?(options: ResolveStreamsOptions): Promise<StreamCandidate[]>
  /** Batch resolve for offline queue — one show lookup, many episodes. */
  resolveStreamsBatch?(
    options: ResolveStreamsBatchOptions
  ): Promise<ResolveStreamsBatchEntry[]>
  /** Resolve + native AVPlayer fallback; records lastGoodModule on success. */
  resolveAndPlay?(options: ResolveAndPlayOptions): Promise<StreamCandidate>
  /**
   * After successful CDN `playStream`, record module success + lastGoodModule.
   * Used by product Watch (resolveStreams → playStream) which skips resolveAndPlay.
   */
  recordModuleSuccess?(options: RecordModuleSuccessOptions): Promise<void>
  /** Subscribe to native player position updates. Returns unsubscribe. */
  onPlaybackProgress?(
    cb: (progress: NativePlaybackProgress) => void
  ): Promise<() => void> | (() => void)
  /** Subscribe to native player UI actions (next ep / change source). */
  onPlayerAction?(
    cb: (action: NativePlayerAction) => void
  ): Promise<() => void> | (() => void)

  torrentInfo(hash: string): Promise<TorrentInfo>
  library(): Promise<LibraryEntry[]>
  deleteTorrents(hashes?: string[]): Promise<void>
  cachedTorrents(): Promise<string[]>
  updateSettings(settings: Partial<ClientSettings>): Promise<void>
  checkAvailableSpace(): Promise<number>

  enqueueDownload?(options: EnqueueDownloadOptions): Promise<{ id: string }>
  downloadQueue?(): Promise<DownloadJob[]>
  onDownloadProgress?(
    cb: (jobs: DownloadJob[], library?: LibraryEntry[]) => void
  ): Promise<() => void> | (() => void)
  pauseDownload?(id: string): Promise<void>
  resumeDownload?(id: string): Promise<void>
  cancelDownload?(id: string): Promise<void>
  playLibraryItem?(id: string): Promise<void>
  storageUsage?(): Promise<StorageUsage>
  clearCache?(): Promise<void>
  pickDownloadFolder?(): Promise<{ path: string }>
  resetDownloadFolder?(): Promise<{ path: string }>
  downloadFolder?(): Promise<{ path: string }>

  setMediaSession?(title: string, description: string, image: string): Promise<void>
}

declare global {
  interface Window {
    saizen?: Partial<SaizenNative>
  }
}

export type {
  ClientSettings,
  DownloadJob,
  EnqueueDownloadOptions,
  LibraryEntry,
  PlayerHint,
  StorageUsage,
  TorrentFile,
  TorrentInfo
}

export type {
  InstallModuleFromUrlOptions,
  InstallModuleOptions,
  InstalledModule,
  ModuleCatalogEntry,
  RecordModuleSuccessOptions,
  ResolveAndPlayOptions,
  ResolveStreamsBatchEntry,
  ResolveStreamsBatchOptions,
  ResolveStreamsOptions,
  StreamCandidate
} from './stream'
