import type { SkipTimes, SpawnPlayerOptions } from './native'
import type { PlayerHint } from './torrent'

export type StreamKind = 'hls' | 'mp4' | 'other'

export interface StreamCandidate {
  url: string
  headers?: Record<string, string>
  quality?: string
  title?: string
  moduleId: string
  kind: StreamKind
  /** Optional external WebVTT sidecar from the module (`extractStreamUrl.subtitle`). */
  subtitle?: string
}

export interface PlayStreamOptions extends SpawnPlayerOptions {
  /** Required https URL */
  url: string
  headers?: Record<string, string>
  playerHint?: PlayerHint // default 'avplayer' for CDN
  /** Optional https WebVTT URL shown as an overlay in the native AVPlayer. */
  subtitle?: string
}

export interface ResolveStreamsOptions {
  title: string
  anilistId: number
  episode: number
  idMal?: number | null
  query?: string
  /** When true, resolve via lastGood module first (for offline queue). Watch keeps parallel fan-out. */
  fast?: boolean
  /** Include installed NSFW modules in resolve (adult titles only). */
  allowNsfw?: boolean
}

export interface ResolveStreamsBatchOptions {
  title: string
  anilistId: number
  episodes: number[]
  idMal?: number | null
  query?: string
  allowNsfw?: boolean
}

export interface ResolveStreamsBatchEntry {
  episode: number
  candidates: StreamCandidate[]
}

/** Native resolve + AVPlayer fallback loop (`SaizenModules.resolveAndPlay`). */
export interface ResolveAndPlayOptions extends ResolveStreamsOptions {
  playerHint?: PlayerHint
  resolution?: string
  sourceLabel?: string
  totalEpisodes?: number | null
  hasNextEpisode?: boolean
  autoSkipOpEd?: boolean
  gestureSeekEnabled?: boolean
  doubleTapSeekSec?: number
  tripleTapSeekSec?: number
  autoplayNext?: boolean
  skipTimes?: SkipTimes
}

/** Catalog entry from library.cufiy.net (or custom NSFW index). */
export interface ModuleCatalogEntry {
  id: string
  sourceName: string
  scriptUrl: string
  baseUrl?: string | null
  streamType?: string | null
  status?: string | null
  type?: string | null
  quality?: string | null
  /** Adult / NSFW source — hidden unless Show NSFW is on. */
  nsfw?: boolean | null
}

/** Module installed via SaizenModules bridge; script cached on device. */
export interface InstalledModule {
  id: string
  name: string
  scriptUrl: string
  baseUrl?: string | null
  enabled: boolean
  order: number
  lastSuccessAt?: string | null
  scriptPath: string
  nsfw?: boolean | null
}

export interface InstallModuleOptions {
  id: string
  scriptUrl?: string
  sourceName?: string
  name?: string
  baseUrl?: string
  streamType?: string
  status?: string
  type?: string
  quality?: string
  nsfw?: boolean
}

export interface InstallModuleFromUrlOptions {
  url: string
  name?: string
  nsfw?: boolean
}

/** Persist module success after CDN `playStream` (mirrors resolveAndPlay bookkeeping). */
export interface RecordModuleSuccessOptions {
  moduleId: string
  anilistId: number
}

export interface ExtraModuleCatalog {
  url: string
  label?: string | null
}

/** Card / hit from an NSFW stream module browse or search. */
export interface AdultSearchHit {
  title?: string
  url?: string
  image?: string
  href?: string
  poster?: string
  cover?: string
  [key: string]: unknown
}

export interface AdultHomeSection {
  id?: string
  title?: string
  name?: string
  items?: AdultSearchHit[]
  [key: string]: unknown
}

export interface AdultGenre {
  id?: string
  name?: string
  [key: string]: unknown
}

export interface AdultEpisode {
  title?: string
  url?: string
  number?: number | string
  episode?: number | string
  image?: string
  [key: string]: unknown
}
