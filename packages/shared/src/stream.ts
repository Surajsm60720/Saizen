import type { SpawnPlayerOptions } from './native'
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
