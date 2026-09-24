export type ContinueEntryLike = {
  anilistId: number
  title: string
  cover?: string | null
  episode: number
  updatedAt: number
}

export type ListEntryLike = {
  status?: string | null
  progress?: number | null
  media: { id: number; episodes?: number | null }
}

/** Titles that should not sit on Continue watching (finished or abandoned). */
export function dropIdsFromListEntries(entries: ListEntryLike[]): number[] {
  const ids: number[] = []
  for (const e of entries) {
    const total = e.media.episodes
    const doneByStatus = e.status === 'COMPLETED' || e.status === 'DROPPED'
    const doneByProgress = total != null && total > 0 && (e.progress ?? 0) >= total
    if (doneByStatus || doneByProgress) ids.push(e.media.id)
  }
  return ids
}

/**
 * Union local play records with list CURRENT/REPEATING rows, dropping titles
 * the list says are finished. When both sides have a title, keep the later episode
 * so AniList progress ahead of a stale local tap wins.
 */
export function reconcileContinueWatching(
  local: ContinueEntryLike[],
  remoteCurrent: ContinueEntryLike[],
  dropIds: Iterable<number>
): ContinueEntryLike[] {
  const drop = new Set(dropIds)
  const map = new Map<number, ContinueEntryLike>()

  for (const e of local) {
    if (!e.anilistId || drop.has(e.anilistId)) continue
    map.set(e.anilistId, e)
  }

  for (const e of remoteCurrent) {
    if (!e.anilistId || drop.has(e.anilistId)) continue
    const prev = map.get(e.anilistId)
    if (!prev) {
      map.set(e.anilistId, e)
      continue
    }
    const episode = Math.max(prev.episode, e.episode)
    const updatedAt = Math.max(prev.updatedAt, e.updatedAt)
    const newer = e.updatedAt >= prev.updatedAt ? e : prev
    map.set(e.anilistId, { ...newer, episode, updatedAt })
  }

  return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 24)
}

export function advanceContinueAfterCompletion(
  entry: ContinueEntryLike | undefined,
  completedEpisode: number,
  totalEpisodes?: number | null,
  now = Date.now()
): ContinueEntryLike | 'remove' | null {
  if (
    totalEpisodes != null &&
    totalEpisodes > 0 &&
    completedEpisode >= totalEpisodes
  ) {
    return 'remove'
  }
  if (!entry) return null
  return {
    ...entry,
    episode: Math.max(entry.episode, completedEpisode + 1),
    updatedAt: now
  }
}
