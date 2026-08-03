/** App marketing version — keep in sync with iOS MARKETING_VERSION. */
export const APP_VERSION = '1.0.2'
export const APP_VERSION_LABEL = `v${APP_VERSION}`

export type ChangelogEntry = {
  version: string
  date: string
  title: string
  highlights: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.2',
    date: '2026-08-03',
    title: 'Cast, relations & list editing',
    highlights: [
      'Character and Staff detail pages (AniList-backed bios, appearances, voice roles, crew credits)',
      'Anime page splits Characters, Voice actors, and Staff into separate clickable rails',
      'Relations tab: franchise BFS over AniList links, shown as numbered watch-order cards (no Mermaid diagram)',
      'Edit list entry on anime pages — status, score, progress, rewatches; syncs to AniList and MyAnimeList',
      'List editor never invents Plan to watch when a lookup fails; Save waits until the entry is loaded',
      'AniList Home rails and progress sync fixed (score field + warm list after sign-in / Refresh list)',
      'Offline completions flush to connected list providers on reconnect',
      'MAL sign-in uses native token exchange (public iOS/other client + PKCE; redirect saizen://mal/callback)',
      'Finished shows trust AniList episode counts (fixes inflated lists like K-On from AniZip/TVDB)',
      'Hentai / Sukebei extension reliability: safer media payload, magnet-from-hash, browser User-Agent, catalog gating'
    ]
  },
  {
    version: '1.0.1',
    date: '2026-08-03',
    title: 'Media player redesign',
    highlights: [
      'Native VLC + web players rebuilt to match Saizen glass/gold chrome',
      'Transport controls: ±5s / ±10s, play/pause, next episode',
      'Speed picker; native audio & subtitle track selection; quality chip',
      'Volume button opens a vertical slider panel (replaces cramped horizontal slider)',
      'Torrent download stats in a compact bottom pill instead of center overlay',
      'AniSkip opening/ending skip pill; optional auto-skip in Settings → Playback',
      'Portrait & landscape chrome fixes: pinned volume, shorter landscape bar, tight top header',
      'Fixed controls dismissing on every button tap; removed mid-play Sources chip',
      'AniSkip client fixed (required episodeLength); spawnPlayer contract extended for skip times & player actions'
    ]
  },
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
