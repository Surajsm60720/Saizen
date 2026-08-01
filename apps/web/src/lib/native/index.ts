import type {
  ClientSettings,
  LibraryEntry,
  SaizenNative,
  SpawnPlayerOptions,
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
    window.open(url, '_blank')
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
    // Web stub: if id looks like http(s), expose it directly for <video> / spawnPlayer no-op
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
    // Web: open in new tab / use HTML5 video on player page
    console.info('[saizen] spawnPlayer (web fallback)', options)
  },
  async stopPlayer() {},
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
  async updateSettings(_settings: ClientSettings) {},
  async checkAvailableSpace() {
    return 10 * 1024 * 1024 * 1024
  }
}

function mergeNative(): SaizenNative {
  const injected = typeof window !== 'undefined' ? window.saizen : undefined
  return Object.assign({}, webFallback, injected ?? {}) as SaizenNative
}

let cached: SaizenNative | null = null

export function getNative(): SaizenNative {
  if (!cached) cached = mergeNative()
  return cached
}

export function refreshNative(): SaizenNative {
  cached = mergeNative()
  return cached
}

export default getNative
