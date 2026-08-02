/** In-memory context for the currently playing native/web session. */

export type ActivePlayback = {
  anilistId: number
  episode: number
  idMal?: number | null
  totalEpisodes?: number | null
}

let active: ActivePlayback | null = null

export function setActivePlayback(next: ActivePlayback | null) {
  active = next
}

export function getActivePlayback(): ActivePlayback | null {
  return active
}
