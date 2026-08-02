import { getAnilistToken } from './tokens'

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

  const mutation = `
    mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus) {
      SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status) {
        id
        progress
        status
      }
    }
  `

  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token.accessToken}`
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
        mediaId: opts.mediaId,
        progress: opts.episode,
        status: completed ? 'COMPLETED' : 'CURRENT'
      }
    })
  })

  if (!res.ok) {
    throw new Error(`AniList SaveMediaListEntry HTTP ${res.status}`)
  }
  const json = (await res.json()) as { errors?: Array<{ message?: string }> }
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message || 'AniList mutation error')
  }
}
