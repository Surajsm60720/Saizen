import { getAnilistToken } from './tokens'

export type AniListStatus =
  | 'CURRENT'
  | 'PLANNING'
  | 'COMPLETED'
  | 'DROPPED'
  | 'PAUSED'
  | 'REPEATING'

export type AniListEntryInput = {
  mediaId: number
  status: AniListStatus
  /** Episodes watched */
  progress: number
  /** 0–10 user score; 0 means unrated */
  score: number
  /** Rewatch count */
  repeat: number
}

async function anilistMutation<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const token = await getAnilistToken()
  if (!token?.accessToken) {
    throw new Error('AniList not connected')
  }

  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token.accessToken}`
    },
    body: JSON.stringify({ query, variables })
  })

  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as {
      errors?: Array<{ message?: string }>
    } | null
    const msg = json?.errors?.[0]?.message || `AniList HTTP ${res.status}`
    // Already deleted / missing entry id
    if (res.status === 404 || /not found/i.test(msg)) {
      throw new Error(msg)
    }
    throw new Error(msg)
  }
  const json = (await res.json()) as {
    data?: T
    errors?: Array<{ message?: string }>
  }
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message || 'AniList mutation error')
  }
  if (!json.data) throw new Error('AniList empty response')
  return json.data
}

/** Playback auto-sync — progress + CURRENT/COMPLETED only. */
export async function saveAniListProgress(opts: {
  mediaId: number
  episode: number
  totalEpisodes?: number | null
}): Promise<void> {
  const token = await getAnilistToken()
  if (!token?.accessToken) return

  const completed =
    opts.totalEpisodes != null &&
    opts.totalEpisodes > 0 &&
    opts.episode >= opts.totalEpisodes

  await anilistMutation(
    `
    mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus) {
      SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status) {
        id
        progress
        status
      }
    }
  `,
    {
      mediaId: opts.mediaId,
      progress: opts.episode,
      status: completed ? 'COMPLETED' : 'CURRENT'
    }
  )
}

/** Manual list editor — status, score, progress, rewatches. */
export async function saveAniListEntry(opts: AniListEntryInput): Promise<{
  id: number
  status: string
  progress: number
  score: number
  repeat: number
}> {
  const scoreRaw =
    opts.score > 0 ? Math.round(Math.min(10, Math.max(0, opts.score)) * 10) : 0

  const data = await anilistMutation<{
    SaveMediaListEntry: {
      id: number
      status: string
      progress: number
      score: number
      repeat: number
    }
  }>(
    `
    mutation (
      $mediaId: Int
      $status: MediaListStatus
      $progress: Int
      $scoreRaw: Int
      $repeat: Int
    ) {
      SaveMediaListEntry(
        mediaId: $mediaId
        status: $status
        progress: $progress
        scoreRaw: $scoreRaw
        repeat: $repeat
      ) {
        id
        status
        progress
        score(format: POINT_10)
        repeat
      }
    }
  `,
    {
      mediaId: opts.mediaId,
      status: opts.status,
      progress: Math.max(0, Math.floor(opts.progress)),
      scoreRaw,
      repeat: Math.max(0, Math.floor(opts.repeat))
    }
  )

  const e = data.SaveMediaListEntry
  const rawScore = e.score ?? 0
  return {
    id: e.id,
    status: e.status,
    progress: e.progress ?? 0,
    score: rawScore > 10 ? Math.round(rawScore / 10) : Math.round(rawScore),
    repeat: e.repeat ?? 0
  }
}

export async function deleteAniListEntry(entryId: number): Promise<void> {
  try {
    await anilistMutation(
      `
    mutation ($id: Int) {
      DeleteMediaListEntry(id: $id) {
        deleted
      }
    }
  `,
      { id: entryId }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase()
    // Already removed on AniList — treat as success so local rails can clear.
    if (msg.includes('not found') || msg.includes('404')) return
    throw e
  }
}
