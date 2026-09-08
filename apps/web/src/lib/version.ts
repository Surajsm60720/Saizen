/** App marketing version — keep in sync with iOS MARKETING_VERSION. */
export const APP_VERSION = '1.4.6'
export const APP_VERSION_LABEL = `v${APP_VERSION}`

export type ChangelogEntry = {
  version: string
  date: string
  title: string
  highlights: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.4.6',
    date: '2026-09-08',
    title: 'Adult home polish & provider stability',
    highlights: [
      'Adult home catalog rails (Recently uploaded / New releases / Most viewed + tags) with faster parallel browse; haho stays sequential to avoid rate-limit crashes',
      'Adult title page uses an anime-style hero (cover + safe-area title) and episode Play/Save list',
      'Provider switch: per-module home cache, soft cross-rail dedupe so categories stay visible, module scripts auto-refresh (catalog v6)',
      'Haho covers via JSON search / top tabs; Mama episode listing pages collapse to series cards',
      'Native ModuleFetchSession uses a locked in-memory cookie jar (fixes EXC_BAD_ACCESS under parallel haho fetches)',
      'Turning Adult Mode off also turns Incognito off'
    ]
  },
  {
    version: '1.4.5',
    date: '2026-09-08',
    title: 'Adult Mode master switch',
    highlights: [
      'Settings → Adult settings: one master switch (no duplicate on main Settings); primary source is a dropdown',
      'SFW Modules vs Adult Modules are separate pages — NSFW never appears in Settings → Modules',
      'Torrent Extensions catalog removed; Adult home matches SFW home hero/rails layout',
      'Fifth tab + module-backed Adult search/title; main Search stays SFW; Incognito auto-on once'
    ]
  },
  {
    version: '1.4.4',
    date: '2026-09-07',
    title: 'NSFW module catalogs & adult stream sources',
    highlights: [
      'Settings → Modules: optional HTTPS NSFW catalogs (Cufiy-shaped index.json), Show NSFW toggle, and safer install/reinstall (main-queue Cap resolves)',
      'Adult titles only: installed NSFW modules join stream resolve via allowNsfw; Search include-adult follows Show NSFW + hentai extensions',
      'Native player plays optional WebVTT sidecars from modules; StreamResolver no longer silently falls back to episode 1 when a number is missing',
      'Module scripts stay HTTPS-hosted (e.g. saizen-modules) — never baked into the IPA; local /modules/ harness mirror is gitignored'
    ]
  },
  {
    version: '1.4.3',
    date: '2026-09-07',
    title: 'AniList outage fallback via Jikan/MAL',
    highlights: [
      'When AniList GraphQL fails (403 / network), catalog reads fail over to MAL catalog (Tenrai primary, public Jikan secondary)',
      'List personalization uses MAL when connected during fallback; otherwise stale AniList cache + connect CTA',
      'Dismissible “catalog fallback” banner while failover mode is active (TTL ~20 min or until AniList recovers)',
      'Search, Schedule, Home rails, themes, and episode metadata keep working through the routed catalog layer',
      'Episode titles prefer AniZip/Jikan metadata and ignore platform-name streaming labels that slip in during MAL fallback'
    ]
  },
  {
    version: '1.4.2',
    date: '2026-08-22',
    title: 'Airier UI, Home auth rails & liquid-glass controls',
    highlights: [
      'Home hero uses a taller carousel with portrait covers that fill edge-to-edge; quieter chrome spacing across browse surfaces',
      'Prequels & sequels and For your genres rails match Popular/Trending card size',
      'Settings, Appearance, Downloads, Modules, Extensions, and Schedule get the same airy section rhythm',
      'AniList personalization loads after Keychain hydrate and paints from cache first — no Settings hop to fill Home rails',
      'Appearance → Liquid glass: transparency slider plus optional Frosted blur for the tab bar and top chrome'
    ]
  },
  {
    version: '1.4.1',
    date: '2026-08-20',
    title: 'Downloads reliability & faster batch queue',
    highlights: [
      'Downloads: single app-wide store for queue + library — leaving and returning no longer blanks the page or stacks Cap listeners',
      'Pause / Resume / Cancel / Delete run off the Cap UI thread with timeouts so the WebView stays responsive',
      'Progress UI: HTTP shows speed + downloaded/total; HLS shows percent without fake byte totals; source labels stay visible',
      'Batch Save uses resolveStreamsBatch — one show lookup, lastGood module first — so queuing many episodes no longer waits on every module for every episode',
      'Clear cache also sweeps failed jobs, orphan .movpkg / partial saves, and leftover UserManagedAssets HLS packs',
      'Modules and Extensions screens refreshed; manga detail page for relations; appearance polish'
    ]
  },
  {
    version: '1.4.0',
    date: '2026-08-11',
    title: 'CDN Watch architecture',
    highlights: [
      'Watch path rebuilt around installable stream modules (HLS/MP4) instead of live torrent playback',
      'Settings → Modules: browse a catalog, install, enable, and reorder sources used for Play and Save',
      'Episode sources list module streams; Play opens a custom native AVPlayer (compact chrome, OP/ED skip, gesture seek)',
      'Downloads / batch Save resolve module streams and prefer your quality setting; Downloads UI is CDN-focused',
      'Incognito Mode: pause list sync and Home continue; session resume clears when you leave Incognito',
      'Module runtime hardened for redirects, timers, and empty-stream cases; torrent tooling remains for optional offline use'
    ]
  },
  {
    version: '1.3.3',
    date: '2026-08-09',
    title: 'Chrome, landscape & sources dismiss',
    highlights: [
      'Search, Schedule, Settings, and nested pages no longer sit under the Saizen glass header — titles and back links stay clear',
      'Home brand mark stays more readable over light carousel art (stronger scrim + text shadow)',
      'Landscape: left/right safe-area padding clears the Dynamic Island; wide-layout text tabs use higher-contrast labels',
      'Sources sheet: swipe down from the handle or top of the list to dismiss (X still works)',
      'Sources sheet: removed multi-select checkboxes — use Save per source, or episode multi-select for bulk downloads'
    ]
  },
  {
    version: '1.3.2',
    date: '2026-08-09',
    title: 'Navigation, scroll, auth & icons',
    highlights: [
      'Tab switches replace history instead of stacking — edge-swipe no longer jumps across Home / Search / Schedule / More',
      'Home, Search, Schedule, and Settings stay mounted; scroll position is restored when you return',
      'Opening anime posters no longer wipes the list scroll you came from',
      'Enabling an extension applies immediately — no app restart (Search adult flag + registry stay in sync)',
      'Auth: Keychain login persists across relaunch; Settings refreshes after hydrate',
      'AniList: Authorization Code via ASWebAuthenticationSession; Client Secret from gitignored local file (not Settings / not NEXT_PUBLIC)',
      'MAL: ASWebAuthenticationSession + native URLSession token exchange (no more CapacitorHttp grant_type wipe)',
      'Security: Cap bridge logging off; OAuth tokens written to Keychain and omitted from plugin resolve payloads',
      'iOS: UIScene lifecycle (SceneDelegate); updated App Icon (light / dark / tinted)'
    ]
  },
  {
    version: '1.3.1',
    date: '2026-08-08',
    title: 'Security hardening & glass nav',
    highlights: [
      'Security: Keychain bridge allowlisted to anilist/mal only; OAuth sheets locked to anilist.co / myanimelist.net',
      'Security: AniList OAuth now uses state (like MAL); loopback playback must match an active stream token',
      'Security: HTTP downloads require http(s); stream tokens redacted from NSLog; Documents/Saizen excluded from iCloud backup',
      'Security: CSP meta on the bundled UI; Authorization headers never forwarded to Nyaa/Sukebei mirrors',
      'UI: Puritan + Quando type; compact Liquid Glass tab bar (icon-only) with drag-to-scrub selection',
      'UI: Quieter frosted chrome (no border halo); haptics on tab scrub'
    ]
  },
  {
    version: '1.3.0',
    date: '2026-08-05',
    title: 'Settings power-user controls',
    highlights: [
      'Settings → Appearance: color wheel plus saturation / brightness / contrast on deep black',
      'Appearance: enter a hex code, live UI preview, and Downloads / Extensions above About',
      'Home rails: View more opens Search with matching season / trending / genre / score filters',
      'Scrollbars hidden in the Capacitor WebView; Downloads no longer shows a Settings back link',
      'Player: double / triple tap seek on left and right (web + VLC)',
      'Autoplay next opens the next episode’s source sheet when an episode ends',
      'Transfers: torrent download speed cap (Mbps) and max peers, applied live',
      'Extensions live under Settings (removed from the tab bar)',
      'Relations tab and scroll are remembered when you open another title and go back',
      'Tap an opening or ending to copy the song for Spotify / YouTube search',
      'Hardened daily-use paths: folder picker crash guard, next-episode single fire, Home/Search error isolation'
    ]
  },
  {
    version: '1.2.0',
    date: '2026-08-05',
    title: 'Offline downloads',
    highlights: [
      'Settings → Downloads: folder access, parallel jobs, Wi‑Fi only, storage use',
      'Download all aired, a range, or picked episodes — auto-selects preferred quality',
      'Save from the sources sheet (Play + Save); multi-select sources to queue several',
      'Files land in Show / Season / original release name; play offline from the library',
      'Lock-screen progress notification; torrents keep running while Saizen is open or locked',
      'Torrent Save fetches the full episode (not just the stream head) with real % progress',
      'Download notification updates quietly — no spam banners every few hundred ms',
      'Library updates live, groups long series, and clears leftover download cache after delete'
    ]
  },
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
