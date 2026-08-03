/**
 * Injected before the Next.js app on Capacitor.
 * Wires Capacitor plugins → window.saizen (SaizenNative contract).
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import type {
  AuthResponse,
  MalAuthCodeResponse,
  NativePlaybackProgress,
  NativePlayerAction,
  SaizenNative,
  SpawnPlayerOptions,
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
}

interface SaizenPlayerPlugin {
  spawnPlayer(options: SpawnPlayerOptions): Promise<void>
  stopPlayer(): Promise<void>
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
  authAnilist(o: { url: string; callbackScheme?: string }): Promise<AuthResponse | MalAuthCodeResponse>
  authMAL(o: { url: string; callbackScheme?: string }): Promise<MalAuthCodeResponse>
  getSecureItem(o: { key: string }): Promise<{ value: string | null }>
  setSecureItem(o: { key: string; value: string }): Promise<void>
  deleteSecureItem(o: { key: string }): Promise<void>
}

const SaizenTorrent = registerPlugin<SaizenTorrentPlugin>('SaizenTorrent')
const SaizenPlayer = registerPlugin<SaizenPlayerPlugin>('SaizenPlayer')
const SaizenAuth = registerPlugin<SaizenAuthPlugin>('SaizenAuth')

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
    async stopPlayer() {
      await SaizenPlayer.stopPlayer()
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
    async onPlayerAction(cb) {
      const handle = await SaizenPlayer.addListener('playerAction', cb)
      return () => {
        void handle.remove()
      }
    },
    async authAnilist(url) {
      return SaizenAuth.authAnilist({ url, callbackScheme: 'saizen' })
    },
    async authMAL(url) {
      return SaizenAuth.authMAL({ url, callbackScheme: 'saizen' })
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
    async deleteTorrents(_hashes?: string[]) {
      await SaizenTorrent.stop()
    },
    async cachedTorrents() {
      return []
    },
    async library() {
      return []
    },
    async updateSettings() {},
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
