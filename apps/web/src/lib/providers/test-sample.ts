import type { ProviderQuery, ProviderResult, TorrentProvider } from './types'

/**
 * Pipeline test provider.
 * Primary source is a bundled MP4 (`bundle:sample-test.mp4`) — no CDN / TLS / 403.
 * Remote URLs kept as optional fallbacks (often blocked on device networks).
 */
export const testSampleProvider: TorrentProvider = {
  id: 'test-sample',
  name: 'Test Sample (Public Domain)',
  description:
    'Bundled offline MP4 first (recommended). Remote CDN samples may 403 on device.',
  enabled: true,
  async search(query: ProviderQuery): Promise<ProviderResult[]> {
    return [
      {
        providerId: this.id,
        providerName: this.name,
        title: `[TEST] Bundled sample — ep ${query.episode} (offline MP4 ~1MB)`,
        // Handled by ProgressiveHTTPEngine → Bundle.main → Documents → AVPlayer
        httpUrl: 'bundle:sample-test.mp4',
        resolution: '480p',
        seeders: 999,
        size: 1_048_576
      },
      {
        providerId: this.id,
        providerName: this.name,
        title: `[TEST] Remote 1MB sample — ep ${query.episode} (needs network)`,
        httpUrl: 'https://cdn.truefilesize.com/mp4/sample-1mb.mp4',
        resolution: '480p',
        seeders: 999,
        size: 1_048_576
      },
      {
        providerId: this.id,
        providerName: this.name,
        title: `[TEST] Sintel trailer magnet (needs libtorrent)`,
        magnet:
          'magnet:?xt=urn:btih:08ada5a7a618cebba05aaa62433374b7bfad9be4&dn=Sintel&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce&tr=http%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=http%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&tr=udp%3A%2F%2Fexplodie.org%3A6969%2Fannounce',
        resolution: '1080p',
        seeders: 0
      }
    ]
  }
}
