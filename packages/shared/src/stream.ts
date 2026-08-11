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
}

export interface PlayStreamOptions extends SpawnPlayerOptions {
  /** Required https URL */
  url: string
  headers?: Record<string, string>
  playerHint?: PlayerHint // default 'avplayer' for CDN
}

export interface ResolveStreamsOptions {
  title: string
  anilistId: number
  episode: number
  idMal?: number | null
  query?: string
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

/** Catalog entry from library.cufiy.net (or equivalent). */
export interface ModuleCatalogEntry {
  id: string
  sourceName: string
  scriptUrl: string
  baseUrl?: string | null
  streamType?: string | null
  status?: string | null
  type?: string | null
  quality?: string | null
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
}

export interface InstallModuleFromUrlOptions {
  url: string
  name?: string
}
