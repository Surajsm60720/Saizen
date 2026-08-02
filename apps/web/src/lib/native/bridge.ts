import type {
  AuthResponse,
  MalAuthCodeResponse,
  NativePlaybackProgress,
  SaizenNative,
  SpawnPlayerOptions,
  TorrentFile
} from '@saizen/shared'
import { updateWatchProgress } from '@/lib/watch/progress'
import { getActivePlayback } from '@/lib/watch/activePlayback'

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

  type PlayerPlugin = {
    spawnPlayer(o: SpawnPlayerOptions): Promise<void>
    stopPlayer(): Promise<void>
    addListener(
      event: 'playbackProgress',
      cb: (p: NativePlaybackProgress) => void
    ): Promise<{ remove: () => Promise<void> }>
  }

  const SaizenPlayer = registerPlugin<PlayerPlugin>('SaizenPlayer')

  const SaizenAuth = registerPlugin<{
    authAnilist(o: { url: string; callbackScheme?: string }): Promise<AuthResponse | MalAuthCodeResponse>
    authMAL(o: { url: string; callbackScheme?: string }): Promise<MalAuthCodeResponse>
    getSecureItem(o: { key: string }): Promise<{ value: string | null }>
    setSecureItem(o: { key: string; value: string }): Promise<void>
    deleteSecureItem(o: { key: string }): Promise<void>
  }>('SaizenAuth')

  void SaizenPlayer.addListener('playbackProgress', (p) => {
    const active = getActivePlayback()
    updateWatchProgress({
      anilistId: Number(p.anilistId),
      episode: Number(p.episode),
      idMal: p.idMal ?? active?.idMal ?? null,
      positionSec: Number(p.positionSec),
      durationSec: Number(p.durationSec),
      totalEpisodes: active?.totalEpisodes
    })
  }).catch(() => {})

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
    async share() {},
    async getDeviceInfo() {
      return { platform: Capacitor!.getPlatform() }
    }
  }

  window.saizen = Object.assign({}, window.saizen, bridge)
}
