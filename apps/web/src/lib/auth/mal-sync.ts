import { clearMalToken, getMalToken, setMalToken } from './tokens'
import { getOAuthCredentials } from './credentials'
import type { AniListStatus } from './anilist-sync'
import { saizenFetch } from '@/lib/extensions/fetch'

async function refreshMalAccessToken(): Promise<string | null> {
  const existing = await getMalToken()
  if (!existing?.refreshToken) return null

  const { malClientId } = getOAuthCredentials()
  if (!malClientId) return null

  const body = new URLSearchParams()
  body.set('client_id', malClientId)
  body.set('grant_type', 'refresh_token')
  body.set('refresh_token', existing.refreshToken)

  const res = await saizenFetch('https://myanimelist.net/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })
  if (!res.ok) {
    await clearMalToken()
    return null
  }

  const json = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }
  await setMalToken({
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? existing.refreshToken,
    expiresAt:
      json.expires_in && Number.isFinite(json.expires_in)
        ? Date.now() + json.expires_in * 1000
        : null
  })
  return json.access_token
}

async function malAccessToken(): Promise<string | null> {
  let token = await getMalToken()
  if (!token?.accessToken) return null
  if (token.expiresAt && token.expiresAt < Date.now() + 60_000) {
    const refreshed = await refreshMalAccessToken()
    if (!refreshed) return null
    return refreshed
  }
  return token.accessToken
}

export function malStatusFromAniList(status: AniListStatus): string {
  switch (status) {
    case 'CURRENT':
      return 'watching'
    case 'COMPLETED':
      return 'completed'
    case 'PLANNING':
      return 'plan_to_watch'
    case 'PAUSED':
      return 'on_hold'
    case 'DROPPED':
      return 'dropped'
    case 'REPEATING':
      return 'watching'
    default:
      return 'plan_to_watch'
  }
}

async function malPatch(
  idMal: number,
  body: URLSearchParams,
  accessToken: string
): Promise<Response> {
  return saizenFetch(`https://api.myanimelist.net/v2/anime/${idMal}/my_list_status`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  })
}

/** Playback auto-sync — episodes + watching/completed. */
export async function saveMalProgress(opts: {
  idMal: number
  episode: number
  totalEpisodes?: number | null
}): Promise<void> {
  if (!opts.idMal) return

  let access = await malAccessToken()
  if (!access) return

  const completed =
    opts.totalEpisodes != null &&
    opts.totalEpisodes > 0 &&
    opts.episode >= opts.totalEpisodes

  const body = new URLSearchParams()
  body.set('num_watched_episodes', String(opts.episode))
  body.set('status', completed ? 'completed' : 'watching')

  let res = await malPatch(opts.idMal, body, access)
  if (res.status === 401) {
    const refreshed = await refreshMalAccessToken()
    if (!refreshed) throw new Error('MAL unauthorized')
    access = refreshed
    res = await malPatch(opts.idMal, body, access)
  }
  if (!res.ok) throw new Error(`MAL list update failed (${res.status})`)
}

/** Manual list editor — status, score, progress, rewatches. */
export async function saveMalEntry(opts: {
  idMal: number
  status: AniListStatus
  progress: number
  score: number
  repeat: number
}): Promise<void> {
  if (!opts.idMal) return

  let access = await malAccessToken()
  if (!access) throw new Error('MAL not connected')

  const body = new URLSearchParams()
  body.set('status', malStatusFromAniList(opts.status))
  body.set('num_watched_episodes', String(Math.max(0, Math.floor(opts.progress))))
  body.set('score', String(Math.min(10, Math.max(0, Math.round(opts.score)))))
  body.set('num_times_rewatched', String(Math.max(0, Math.floor(opts.repeat))))
  if (opts.status === 'REPEATING') {
    body.set('is_rewatching', 'true')
  }

  let res = await malPatch(opts.idMal, body, access)
  if (res.status === 401) {
    const refreshed = await refreshMalAccessToken()
    if (!refreshed) throw new Error('MAL unauthorized')
    access = refreshed
    res = await malPatch(opts.idMal, body, access)
  }
  if (!res.ok) throw new Error(`MAL list update failed (${res.status})`)
}

export async function deleteMalEntry(idMal: number): Promise<void> {
  if (!idMal) return
  let access = await malAccessToken()
  if (!access) throw new Error('MAL not connected')

  const url = `https://api.myanimelist.net/v2/anime/${idMal}/my_list_status`
  let res = await saizenFetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${access}` }
  })
  if (res.status === 401) {
    const refreshed = await refreshMalAccessToken()
    if (!refreshed) throw new Error('MAL unauthorized')
    access = refreshed
    res = await saizenFetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${access}` }
    })
  }
  // 404 = already gone
  if (!res.ok && res.status !== 404) {
    throw new Error(`MAL list delete failed (${res.status})`)
  }
}
