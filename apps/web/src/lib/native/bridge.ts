import type { SaizenNative, SpawnPlayerOptions, TorrentFile } from '@saizen/shared'

/**
 * Install window.saizen when running inside Capacitor.
 * Safe no-op on plain web — Capacitor global may be absent.
 */
export async function installSaizenBridge(): Promise<void> {
  if (typeof window === 'undefined') return

  let Capacitor: { isNativePlatform(): boolean; getPlatform(): string } | null = null
  let registerPlugin: (<T>(name: string) => T) | undefined

  try {
    const core = await import('@capacitor/core')
    Capacitor = core.Capacitor
    registerPlugin = core.registerPlugin as unknown as <T>(name: string) => T
  } catch {
    return
  }

  if (!Capacitor?.isNativePlatform() || !registerPlugin) return

  const SaizenTorrent = registerPlugin<{
    playTorrent(o: { source: string; mediaId: number; episode: number }): Promise<{ files: TorrentFile[] }>
    torrentInfo(o: { hash: string }): Promise<Record<string, unknown>>
    stop(): Promise<void>
    checkAvailableSpace(): Promise<{ bytes: number }>
  }>('SaizenTorrent')

  const SaizenPlayer = registerPlugin<{
    spawnPlayer(o: SpawnPlayerOptions): Promise<void>
    stopPlayer(): Promise<void>
  }>('SaizenPlayer')

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
      return (await SaizenTorrent.torrentInfo({ hash })) as never
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
      return { platform: Capacitor!.getPlatform() }
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
