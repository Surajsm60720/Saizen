import { clearMalToken, getMalToken, setMalToken } from './tokens'
import { getOAuthCredentials } from './credentials'

async function refreshMalAccessToken(): Promise<string | null> {
  const existing = await getMalToken()
  if (!existing?.refreshToken) return null

  const { malClientId } = getOAuthCredentials()
  if (!malClientId) return null

  const body = new URLSearchParams()
  body.set('client_id', malClientId)
  body.set('grant_type', 'refresh_token')
  body.set('refresh_token', existing.refreshToken)

  const res = await fetch('https://myanimelist.net/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!res.ok) {
    // Fail closed — clear stale credentials so UI shows signed-out.
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

export async function saveMalProgress(opts: {
  idMal: number
  episode: number
  totalEpisodes?: number | null
}): Promise<void> {
  if (!opts.idMal) return

  let token = await getMalToken()
  if (!token?.accessToken) return

  if (token.expiresAt && token.expiresAt < Date.now() + 60_000) {
    const refreshed = await refreshMalAccessToken()
    if (!refreshed) return
    token = { ...token, accessToken: refreshed }
  }

  const completed =
    opts.totalEpisodes != null &&
    opts.totalEpisodes > 0 &&
    opts.episode >= opts.totalEpisodes

  const body = new URLSearchParams()
  body.set('num_watched_episodes', String(opts.episode))
  body.set('status', completed ? 'completed' : 'watching')

  const res = await fetch(
    `https://api.myanimelist.net/v2/anime/${opts.idMal}/my_list_status`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    }
  )

  if (res.status === 401) {
    const refreshed = await refreshMalAccessToken()
    if (!refreshed) throw new Error('MAL unauthorized')
    const retry = await fetch(
      `https://api.myanimelist.net/v2/anime/${opts.idMal}/my_list_status`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${refreshed}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
      }
    )
    if (!retry.ok) throw new Error(`MAL list update failed (${retry.status})`)
    return
  }

  if (!res.ok) throw new Error(`MAL list update failed (${res.status})`)
}
