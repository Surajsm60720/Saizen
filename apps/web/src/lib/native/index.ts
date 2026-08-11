import type {
  ClientSettings,
  DownloadJob,
  EnqueueDownloadOptions,
  InstalledModule,
  LibraryEntry,
  ModuleCatalogEntry,
  PlayStreamOptions,
  RecordModuleSuccessOptions,
  ResolveAndPlayOptions,
  ResolveStreamsOptions,
  SaizenNative,
  SpawnPlayerOptions,
  StorageUsage,
  StreamCandidate,
  TorrentFile,
  TorrentInfo
} from '@saizen/shared'

const emptyInfo = (hash = ''): TorrentInfo => ({
  name: '',
  hash,
  progress: 0,
  size: { total: 0, downloaded: 0, uploaded: 0 },
  speed: { down: 0, up: 0 },
  time: { remaining: 0, elapsed: 0 },
  peers: { seeders: 0, leechers: 0, wires: 0 },
  pieces: { total: 0, size: 0 }
})

/** Browser / stub fallbacks when Capacitor native bridge is absent. */
const webFallback: SaizenNative = {
  isApp: false,
  async version() {
    return '0.1.0-web'
  },
  async openURL(url) {
    try {
      const u = new URL(url)
      if (u.protocol !== 'https:' && u.protocol !== 'http:') {
        throw new Error('Only http(s) URLs can be opened')
      }
      window.open(u.toString(), '_blank')
    } catch (e) {
      console.warn('[saizen] openURL rejected', url, e)
    }
  },
  async share(data) {
    if (navigator.share) await navigator.share(data)
  },
  async getDeviceInfo() {
    return { platform: 'web', userAgent: navigator.userAgent }
  },
  async authAnilist() {
    throw new Error('AniList OAuth requires the native app')
  },
  async authMAL() {
    throw new Error('MAL OAuth requires the native app')
  },
  async playTorrent(id, _mediaId, _episode): Promise<TorrentFile[]> {
    if (typeof id === 'string' && /^https?:\/\//i.test(id)) {
      const hint = /\.mp4(\?|$)/i.test(id) ? 'avplayer' : 'vlc'
      return [
        {
          id: 0,
          name: 'web-stream',
          hash: 'web',
          size: 0,
          url: id,
          playerHint: hint
        }
      ]
    }
    throw new Error(
      'Torrent playback requires the iOS native bridge (libtorrent + loopback HTTP). Use Cap sync / device build.'
    )
  },
  async spawnPlayer(options: SpawnPlayerOptions) {
    console.info('[saizen] spawnPlayer (web fallback)', options)
  },
  async playStream(options: PlayStreamOptions) {
    console.info('[saizen] playStream (web fallback)', options)
  },
  async stopPlayer() {},
  async listModules(): Promise<InstalledModule[]> {
    return []
  },
  async browseModuleCatalog(): Promise<ModuleCatalogEntry[]> {
    throw new Error('Module catalog requires the iOS app')
  },
  async installModule() {
    throw new Error('Module install requires the iOS app')
  },
  async installModuleFromUrl() {
    throw new Error('Module install requires the iOS app')
  },
  async setModuleEnabled() {
    throw new Error('Module settings require the iOS app')
  },
  async reorderModules(): Promise<InstalledModule[]> {
    throw new Error('Module settings require the iOS app')
  },
  async removeModule(): Promise<InstalledModule[]> {
    throw new Error('Module settings require the iOS app')
  },
  async resolveStreams(_options: ResolveStreamsOptions): Promise<StreamCandidate[]> {
    throw new Error('Stream resolve requires the iOS app')
  },
  async resolveAndPlay(_options: ResolveAndPlayOptions): Promise<StreamCandidate> {
    throw new Error('Stream resolve requires the iOS app')
  },
  async recordModuleSuccess(_options: RecordModuleSuccessOptions) {
    // no-op on web
  },
  async torrentInfo(hash) {
    return emptyInfo(hash)
  },
  async library(): Promise<LibraryEntry[]> {
    return []
  },
  async deleteTorrents(_hashes?: string[]) {},
  async cachedTorrents() {
    return []
  },
  async updateSettings(_settings: Partial<ClientSettings>) {},
  async checkAvailableSpace() {
    return 10 * 1024 * 1024 * 1024
  },
  async enqueueDownload(_options: EnqueueDownloadOptions) {
    throw new Error('Downloads require the iOS app')
  },
  async downloadQueue(): Promise<DownloadJob[]> {
    return []
  },
  async pauseDownload() {},
  async resumeDownload() {},
  async cancelDownload() {},
  async playLibraryItem() {
    throw new Error('Downloads require the iOS app')
  },
  async storageUsage(): Promise<StorageUsage> {
    return { libraryBytes: 0, cacheBytes: 0, freeBytes: 0 }
  },
  async clearCache() {},
  async pickDownloadFolder() {
    throw new Error('Folder picker requires the iOS app')
  },
  async resetDownloadFolder() {
    return { path: '' }
  },
  async downloadFolder() {
    return { path: '' }
  }
}

function mergeNative(): SaizenNative {
  const injected = typeof window !== 'undefined' ? window.saizen : undefined
  return Object.assign({}, webFallback, injected ?? {}) as SaizenNative
}

let cached: SaizenNative | null = null

export function getNative(): SaizenNative {
  // Never stick on a pre-bridge webFallback cache — that made Keychain writes
  // no-op (memory-only login → signed out on every relaunch).
  if (typeof window !== 'undefined' && window.saizen?.isApp) {
    cached = mergeNative()
    return cached
  }
  if (!cached) cached = mergeNative()
  return cached
}

export function refreshNative(): SaizenNative {
  cached = mergeNative()
  return cached
}

export default getNative
