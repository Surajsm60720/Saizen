/** App marketing version — keep in sync with iOS MARKETING_VERSION. */
export const APP_VERSION = '1.0'
export const APP_VERSION_LABEL = `v${APP_VERSION}`

export type ChangelogEntry = {
  version: string
  date: string
  title: string
  highlights: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0',
    date: '2026-08-02',
    title: 'First release',
    highlights: [
      'Browse AniList (trending, seasonal, search) with a cinematic dark UI',
      'Anime detail: cast + Japanese VAs, staff, source material, OP/ED themes',
      'Episode list enriched via AniZip / MAL (titles, synopsis, thumbnails)',
      'Torrent + HTTP streaming through libtorrent → loopback Range → VLC',
      'Hayase-compatible remote extensions + built-in providers',
      'Local watch progress, continue-watching rail, mark-watched threshold',
      'AniList / MAL Sign in (app-owned OAuth) with list sync on threshold',
      'Personalized Home rails when AniList is connected',
      'Native playback progress reporting from the iOS player',
      'Security: Keychain-only tokens, no client secrets, authenticated loopback streams, Debug-only Web Inspector, HTTPS-only extensions, secret-scanned IPA packaging'
    ]
  }
]
