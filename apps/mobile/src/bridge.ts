/**
 * Injected before the Next.js app on Capacitor.
 * Wires Capacitor plugins → window.saizen (SaizenNative contract).
 *
 * Until plugins are registered in the Xcode project, methods fall through
 * to web stubs in apps/web/src/lib/native.
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import type { SaizenNative, SpawnPlayerOptions, TorrentFile } from '@saizen/shared'

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
}

const SaizenTorrent = registerPlugin<SaizenTorrentPlugin>('SaizenTorrent')
const SaizenPlayer = registerPlugin<SaizenPlayerPlugin>('SaizenPlayer')

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
    },
    async authAnilist() {
      throw new Error('Auth Phase 2')
    },
    async authMAL() {
      throw new Error('Auth Phase 2')
    }
  }

  window.saizen = Object.assign({}, window.saizen, bridge)
}

installSaizenBridge()
