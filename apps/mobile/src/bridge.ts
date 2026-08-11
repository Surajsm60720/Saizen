/**
 * Injected before the Next.js app on Capacitor.
 * Wires Capacitor plugins → window.saizen (SaizenNative contract).
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import type {
  AuthResponse,
  ClientSettings,
  DownloadJob,
  EnqueueDownloadOptions,
  InstallModuleFromUrlOptions,
  InstallModuleOptions,
  InstalledModule,
  LibraryEntry,
  MalAuthCodeResponse,
  ModuleCatalogEntry,
  NativePlaybackProgress,
  NativePlayerAction,
  PlayStreamOptions,
  RecordModuleSuccessOptions,
  ResolveAndPlayOptions,
  ResolveStreamsOptions,
  SaizenNative,
  SpawnPlayerOptions,
  StorageUsage,
  StreamCandidate,
  TorrentFile
} from '@saizen/shared'

interface SaizenTorrentPlugin {
  playTorrent(options: {
    source: string
    mediaId: number
    episode: number
  }): Promise<{ files: TorrentFile[] }>
  torrentInfo(options: { hash: string }): Promise<Record<string, unknown>>
  stop(): Promise<void>
  checkAvailableSpace(): Promise<{ bytes: number }>
  enqueueDownload(o: EnqueueDownloadOptions): Promise<{ id: string }>
  downloadQueue(): Promise<{ jobs: DownloadJob[] }>
  pauseDownload(o: { id: string }): Promise<void>
  resumeDownload(o: { id: string }): Promise<void>
  cancelDownload(o: { id: string }): Promise<void>
  library(): Promise<{ entries: LibraryEntry[] }>
  deleteTorrents(o: { hashes?: string[]; ids?: string[] }): Promise<void>
  cachedTorrents(): Promise<{ hashes: string[] }>
  updateSettings(o: Partial<ClientSettings>): Promise<void>
  storageUsage(): Promise<StorageUsage>
  clearCache(): Promise<void>
  pickDownloadFolder(): Promise<{ path: string }>
  resetDownloadFolder(): Promise<{ path: string }>
  downloadFolder(): Promise<{ path: string }>
  playLibraryItem(o: { id: string }): Promise<void>
  addListener(
    event: 'downloadProgress',
    cb: (p: { jobs: DownloadJob[]; library?: LibraryEntry[] }) => void
  ): Promise<{ remove: () => Promise<void> }>
}

interface SaizenPlayerPlugin {
  spawnPlayer(options: SpawnPlayerOptions): Promise<void>
  playStream?(options: PlayStreamOptions): Promise<void>
  stopPlayer(): Promise<void>
  runModuleDay0Spike?(): Promise<{
    moduleId: string
    sourceName: string
    streamUrl: string
    quality?: string | null
  }>
  addListener(
    event: 'playbackProgress',
    cb: (p: NativePlaybackProgress) => void
  ): Promise<{ remove: () => Promise<void> }>
  addListener(
    event: 'playerAction',
    cb: (p: NativePlayerAction) => void
  ): Promise<{ remove: () => Promise<void> }>
}

interface SaizenAuthPlugin {
  authAnilist(o: {
    url: string
    callbackScheme?: string
    clientId?: string
    redirectUri?: string
  }): Promise<AuthResponse | MalAuthCodeResponse>
  authMAL(o: { url: string; callbackScheme?: string }): Promise<MalAuthCodeResponse>
  exchangeMalToken(o: {
    clientId: string
    code: string
    codeVerifier: string
    redirectUri: string
  }): Promise<{
    ok?: boolean
    expires_in?: number
    token_type?: string
  }>
  refreshMalToken(o: {
    clientId: string
    refreshToken: string
  }): Promise<{
    ok?: boolean
    expires_in?: number
    token_type?: string
  }>
  getSecureItem(o: { key: string }): Promise<{ value: string | null }>
  setSecureItem(o: { key: string; value: string }): Promise<void>
  deleteSecureItem(o: { key: string }): Promise<void>
}

const SaizenTorrent = registerPlugin<SaizenTorrentPlugin>('SaizenTorrent')
const SaizenPlayer = registerPlugin<SaizenPlayerPlugin>('SaizenPlayer')
const SaizenAuth = registerPlugin<SaizenAuthPlugin>('SaizenAuth')
const SaizenModules = registerPlugin<{
  listModules(): Promise<{ modules: InstalledModule[] }>
  browseModuleCatalog(): Promise<{ entries: ModuleCatalogEntry[] }>
  installModule(o: InstallModuleOptions): Promise<{ modules: InstalledModule[] }>
  installModuleFromUrl(o: InstallModuleFromUrlOptions): Promise<{ modules: InstalledModule[] }>
  setModuleEnabled(o: { id: string; enabled: boolean }): Promise<{ ok?: boolean }>
  reorderModules(o: { ids: string[] }): Promise<{ modules: InstalledModule[] }>
  removeModule(o: { id: string }): Promise<{ modules: InstalledModule[] }>
  resolveStreams(o: ResolveStreamsOptions): Promise<{ candidates: StreamCandidate[] }>
  resolveAndPlay(o: ResolveAndPlayOptions): Promise<{ candidate: StreamCandidate }>
  recordModuleSuccess(o: RecordModuleSuccessOptions): Promise<{ ok?: boolean }>
}>('SaizenModules')

export function installSaizenBridge(): void {
  if (!Capacitor.isNativePlatform()) return

  const bridge: Partial<SaizenNative> = {
    isApp: true,
    async version() {
      return '0.1.0-ios'
    },
    async playTorrent(id, mediaId, episode) {
      const source = typeof id === 'string' ? id : ''
      const { files } = await SaizenTorrent.playTorrent({ source, mediaId, episode })
      return files
    },
    async spawnPlayer(options) {
      await SaizenPlayer.spawnPlayer(options)
    },
    async playStream(options) {
      if (!SaizenPlayer.playStream) {
        throw new Error('playStream is not available in this build')
      }
      await SaizenPlayer.playStream(options)
    },
    async stopPlayer() {
      await SaizenPlayer.stopPlayer()
    },
    async runModuleDay0Spike() {
      if (!SaizenPlayer.runModuleDay0Spike) {
        throw new Error('Day 0 spike is only available in a DEBUG iOS build')
      }
      return SaizenPlayer.runModuleDay0Spike()
    },
    async listModules() {
      const { modules } = await SaizenModules.listModules()
      return modules ?? []
    },
    async browseModuleCatalog() {
      const { entries } = await SaizenModules.browseModuleCatalog()
      return entries ?? []
    },
    async installModule(options) {
      const { modules } = await SaizenModules.installModule(options)
      return modules ?? []
    },
    async installModuleFromUrl(options) {
      const { modules } = await SaizenModules.installModuleFromUrl(options)
      return modules ?? []
    },
    async setModuleEnabled(id, enabled) {
      await SaizenModules.setModuleEnabled({ id, enabled })
    },
    async reorderModules(ids) {
      const { modules } = await SaizenModules.reorderModules({ ids })
      return modules ?? []
    },
    async removeModule(id) {
      const { modules } = await SaizenModules.removeModule({ id })
      return modules ?? []
    },
    async resolveStreams(options) {
      const { candidates } = await SaizenModules.resolveStreams(options)
      return candidates ?? []
    },
    async resolveAndPlay(options) {
      const { candidate } = await SaizenModules.resolveAndPlay(options)
      return candidate
    },
    async recordModuleSuccess(options) {
      await SaizenModules.recordModuleSuccess(options)
    },
    async onPlaybackProgress(cb) {
      const handle = await SaizenPlayer.addListener('playbackProgress', cb)
      return () => {
        void handle.remove()
      }
    },
    async onPlayerAction(cb) {
      const handle = await SaizenPlayer.addListener('playerAction', (raw) => {
        cb(raw as NativePlayerAction)
      })
      return () => {
        void handle.remove()
      }
    },
    async authAnilist(url, options) {
      return SaizenAuth.authAnilist({
        url,
        callbackScheme: 'saizen',
        clientId: options?.clientId,
        redirectUri: options?.redirectUri
      })
    },
    async authMAL(url) {
      return SaizenAuth.authMAL({ url, callbackScheme: 'saizen' })
    },
    async exchangeMalToken(options) {
      return SaizenAuth.exchangeMalToken(options)
    },
    async refreshMalToken(options) {
      return SaizenAuth.refreshMalToken(options)
    },
    async getSecureItem(key) {
      const { value } = await SaizenAuth.getSecureItem({ key })
      return value ?? null
    },
    async setSecureItem(key, value) {
      await SaizenAuth.setSecureItem({ key, value })
    },
    async deleteSecureItem(key) {
      await SaizenAuth.deleteSecureItem({ key })
    },
    async torrentInfo(hash) {
      const info = await SaizenTorrent.torrentInfo({ hash })
      return info as never
    },
    async checkAvailableSpace() {
      const { bytes } = await SaizenTorrent.checkAvailableSpace()
      return bytes
    },
    async deleteTorrents(hashes?: string[]) {
      const ids = (hashes ?? []).map((h) => h.trim()).filter(Boolean)
      if (!ids.length) return
      await SaizenTorrent.deleteTorrents({ hashes: ids, ids })
    },
    async cachedTorrents() {
      const { hashes } = await SaizenTorrent.cachedTorrents()
      return hashes
    },
    async library() {
      const { entries } = await SaizenTorrent.library()
      return entries
    },
    async updateSettings(settings) {
      await SaizenTorrent.updateSettings(settings)
    },
    async enqueueDownload(options) {
      return SaizenTorrent.enqueueDownload(options)
    },
    async downloadQueue() {
      const { jobs } = await SaizenTorrent.downloadQueue()
      return jobs
    },
    async onDownloadProgress(cb) {
      const handle = await SaizenTorrent.addListener('downloadProgress', (p) => {
        cb(p.jobs ?? [], Array.isArray(p.library) ? p.library : undefined)
      })
      return () => {
        void handle.remove()
      }
    },
    async pauseDownload(id) {
      await SaizenTorrent.pauseDownload({ id })
    },
    async resumeDownload(id) {
      await SaizenTorrent.resumeDownload({ id })
    },
    async cancelDownload(id) {
      await SaizenTorrent.cancelDownload({ id })
    },
    async playLibraryItem(id) {
      await SaizenTorrent.playLibraryItem({ id })
    },
    async storageUsage() {
      return SaizenTorrent.storageUsage()
    },
    async clearCache() {
      await SaizenTorrent.clearCache()
    },
    async pickDownloadFolder() {
      return SaizenTorrent.pickDownloadFolder()
    },
    async resetDownloadFolder() {
      return SaizenTorrent.resetDownloadFolder()
    },
    async downloadFolder() {
      return SaizenTorrent.downloadFolder()
    },
    async openURL(url) {
      window.open(url, '_blank')
    },
    async share() {},
    async getDeviceInfo() {
      return { platform: Capacitor.getPlatform() }
    }
  }

  window.saizen = Object.assign({}, window.saizen, bridge)
}

installSaizenBridge()
