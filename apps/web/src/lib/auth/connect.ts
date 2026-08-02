import getNative from '@/lib/native'
import { clearViewerListCache } from '@/lib/anilist'
import {
  ANILIST_REDIRECT_URI,
  MAL_REDIRECT_URI,
  getOAuthCredentials
} from './credentials'
import {
  clearAnilistToken,
  clearMalToken,
  setAnilistToken,
  setMalToken
} from './tokens'

function randomVerifier(length = 64): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

export async function connectAnilist(): Promise<void> {
  const { anilistClientId } = getOAuthCredentials()
  if (!anilistClientId) {
    throw new Error(
      'AniList Client ID missing. Set NEXT_PUBLIC_ANILIST_CLIENT_ID in apps/web/.env.local and rebuild.'
    )
  }

  const native = getNative()
  if (!native.isApp) {
    throw new Error('AniList login requires the iOS app')
  }

  const url =
    `https://anilist.co/api/v2/oauth/authorize` +
    `?client_id=${encodeURIComponent(anilistClientId)}` +
    `&response_type=token`

  const res = await native.authAnilist(url)
  if (!('access_token' in res) || !res.access_token) {
    throw new Error('AniList did not return an access token')
  }
  const expiresIn = Number(res.expires_in)
  await setAnilistToken({
    accessToken: res.access_token,
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? Date.now() + expiresIn * 1000 : null
  })
  clearViewerListCache()
}

export async function disconnectAnilist(): Promise<void> {
  await clearAnilistToken()
}

/** MAL OAuth2 + PKCE (plain challenge = verifier, per MAL docs). Public client — no secret. */
export async function connectMal(): Promise<void> {
  const { malClientId } = getOAuthCredentials()
  if (!malClientId) {
    throw new Error(
      'MAL Client ID missing. Set NEXT_PUBLIC_MAL_CLIENT_ID in apps/web/.env.local and rebuild.'
    )
  }

  const native = getNative()
  if (!native.isApp) {
    throw new Error('MyAnimeList login requires the iOS app')
  }

  const verifier = randomVerifier(64)
  const state = randomVerifier(16)
  if (typeof sessionStorage === 'undefined') {
    throw new Error('sessionStorage required for MAL OAuth state')
  }
  sessionStorage.setItem('saizen:mal:verifier', verifier)
  sessionStorage.setItem('saizen:mal:state', state)

  const url =
    `https://myanimelist.net/v1/oauth2/authorize` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(malClientId)}` +
    `&code_challenge=${encodeURIComponent(verifier)}` +
    `&state=${encodeURIComponent(state)}` +
    `&redirect_uri=${encodeURIComponent(MAL_REDIRECT_URI)}`

  const res = await native.authMAL(url)
  if (!res.code) throw new Error('MAL did not return an authorization code')

  const expected = sessionStorage.getItem('saizen:mal:state')
  if (!expected || !res.state || res.state !== expected) {
    throw new Error('MAL OAuth state mismatch')
  }
  sessionStorage.removeItem('saizen:mal:state')
  sessionStorage.removeItem('saizen:mal:verifier')

  const body = new URLSearchParams()
  body.set('client_id', malClientId)
  body.set('code', res.code)
  body.set('code_verifier', verifier)
  body.set('grant_type', 'authorization_code')
  body.set('redirect_uri', MAL_REDIRECT_URI)

  const tokenRes = await fetch('https://myanimelist.net/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => '')
    throw new Error(`MAL token exchange failed (${tokenRes.status}) ${text.slice(0, 160)}`)
  }
  const json = (await tokenRes.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }
  await setMalToken({
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? '',
    expiresAt:
      json.expires_in && Number.isFinite(json.expires_in)
        ? Date.now() + json.expires_in * 1000
        : null
  })
}

export async function disconnectMal(): Promise<void> {
  await clearMalToken()
}

export { ANILIST_REDIRECT_URI, MAL_REDIRECT_URI }
