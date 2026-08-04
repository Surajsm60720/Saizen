/** App marketing version — keep in sync with iOS MARKETING_VERSION. */
export const APP_VERSION = '1.1.2'
export const APP_VERSION_LABEL = `v${APP_VERSION}`

export type ChangelogEntry = {
  version: string
  date: string
  title: string
  highlights: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.1.2',
    date: '2026-08-04',
    title: 'Search session & glass tab bar',
    highlights: [
      'Search stays alive when you open an anime and go back — query, filters, and results are preserved',
      'Keyboard no longer autofocuses on return to Search; it only opens when you tap the search field',
      'Bottom tab bar hides while the keyboard is open (no nav sitting on top of it)',
      'Tab bar is always a floating glass pill — no dock↔compact morph flicker on scroll',
      'Lighter liquid-glass chrome: lower fill opacity and stronger backdrop blur'
    ]
  },
  {
    version: '1.1.1',
    date: '2026-08-04',
    title: 'Search filters',
    highlights: [
      'Search Filters sheet: genre dropdown, year (1900+), season, format, status, sort, and In my list',
      'Filters control sits beside the Search title so the title field stays full-width',
      'Active filter chips under the search bar — tap to remove; Clear all resets',
      'Browse by filters alone (title optional); Load more pagination',
      'AniList filter queries omit unused nulls and fall back from Best match → Popularity when there’s no title'
    ]
  },
  {
    version: '1.1.0',
    date: '2026-08-04',
    title: 'Continue watching, themes resilience & adult sources',
    highlights: [
      'Continue watching EP xx on anime pages — jump straight to the episode you left off',
      'Opening & Ending rows show song names only (no outbound YouTube / catalog links)',
      'Deleting a list entry clears continue-watching and refreshes Home rails immediately (no app restart)',
      'AniList MediaList 404 treated as already removed so local delete still succeeds',
      'Theme catalogs: AnimeThemes → Jikan → official MAL fallback; correct AniList lookup filter',
      'Home hydration fixed (React #418) when restoring local rails on Capacitor',
      'Adult / Sukebei: Nyaa mirror failover after TLS failure (canonical host first); encode + in queries; drop MediaTitle typename noise; title-match filter against junk hits',
      'Adult searches only query hentai extensions (skip Seadex / built-ins that never index adult)'
    ]
  },
  {
    version: '1.0.3',
    date: '2026-08-03',
    title: 'Typography, themes & airing calendar',
    highlights: [
      'Typography: Fraunces for titles + DM Sans for UI, with shared type roles (brand, hero, page, section, body, meta)',
      'Schedule calendar in the main tab bar (replaces Client): week strip with Mon–Sun labels and local date cells',
      'Smart local air times — AniList airing timestamps mapped to your device timezone and weekday',
      'My list / Season toggle — Watching & Rewatching, or the full current-season airing board',
      'Opening & Ending rows: play AnimeThemes clips and open the AnimeThemes anime page',
      'Client / torrent-stats screen removed from primary navigation'
    ]
  },
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
