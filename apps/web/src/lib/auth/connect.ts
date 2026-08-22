import { refreshNative } from '@/lib/native'
import { whenBridgeReady } from '@/lib/native/ready'
import {
  clearViewerListCache,
  fetchViewerAnimeList
} from '@/lib/anilist'
import { flushPendingListSync } from '@/lib/watch/progress'
import {
  ANILIST_REDIRECT_URI,
  MAL_REDIRECT_URI,
  clearOAuthCredentialOverrides,
  getOAuthCredentials
} from './credentials'
import {
  clearAnilistToken,
  clearMalToken,
  getAnilistToken,
  getMalToken,
  notifyAuthChanged
} from './tokens'

function randomVerifier(length = 64): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

export async function connectAnilist(): Promise<void> {
  clearOAuthCredentialOverrides()
  const { anilistClientId } = getOAuthCredentials()
  if (!anilistClientId) {
    throw new Error(
      'AniList Client ID missing. Set NEXT_PUBLIC_ANILIST_CLIENT_ID in apps/web/.env.local and rebuild.'
    )
  }

  await whenBridgeReady()
  const native = refreshNative()
  if (!native.isApp) {
    throw new Error('AniList login requires the iOS app')
  }

  const state = randomVerifier(16)
  if (typeof sessionStorage === 'undefined') {
    throw new Error('sessionStorage required for AniList OAuth state')
  }
  sessionStorage.setItem('saizen:anilist:state', state)

  // Authorization Code — `?code=` works with saizen://; secret from AnilistSecret.local.swift / Keychain.
  const url =
    `https://anilist.co/api/v2/oauth/authorize` +
    `?client_id=${encodeURIComponent(anilistClientId)}` +
    `&response_type=code` +
    `&state=${encodeURIComponent(state)}` +
    `&redirect_uri=${encodeURIComponent(ANILIST_REDIRECT_URI)}`

  if (!native.authAnilist) {
    throw new Error('Native AniList auth unavailable — rebuild the iOS app (pnpm sync:ios).')
  }

  const res = await native.authAnilist(url, {
    clientId: anilistClientId,
    redirectUri: ANILIST_REDIRECT_URI
  })
  const expected = sessionStorage.getItem('saizen:anilist:state')
  const returnedState = 'state' in res && typeof res.state === 'string' ? res.state : ''
  sessionStorage.removeItem('saizen:anilist:state')
  if (returnedState && expected && returnedState !== expected) {
    throw new Error('AniList OAuth state mismatch')
  }

  // Token was written to Keychain by native — never returned over the bridge.
  const stored = await getAnilistToken()
  if (!stored?.accessToken) {
    throw new Error('AniList login did not persist to Keychain')
  }
  notifyAuthChanged()

  clearViewerListCache()
  try {
    await fetchViewerAnimeList(
      ['CURRENT', 'REPEATING', 'COMPLETED', 'PAUSED', 'PLANNING'],
      { force: true }
    )
    const { refreshHomePersonalization } = await import('@/lib/home/personalize')
    await refreshHomePersonalization({ force: false })
  } catch {
    /* rate limit — cache stays empty until Home retries */
  }
  void flushPendingListSync()
}

export async function disconnectAnilist(): Promise<void> {
  await clearAnilistToken()
  clearViewerListCache()
  try {
    const { refreshHomePersonalization } = await import('@/lib/home/personalize')
    await refreshHomePersonalization({ force: false })
  } catch {
    /* ignore */
  }
}

/** MAL OAuth2 + PKCE (plain challenge = verifier, per MAL docs). Public client — no secret. */
export async function connectMal(): Promise<void> {
  clearOAuthCredentialOverrides()
  const { malClientId } = getOAuthCredentials()
  if (!malClientId) {
    throw new Error(
      'MAL Client ID missing. Set NEXT_PUBLIC_MAL_CLIENT_ID in apps/web/.env.local and rebuild.'
    )
  }

  await whenBridgeReady()
  const native = refreshNative()
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
    `&code_challenge_method=plain` +
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

  if (!native.exchangeMalToken) {
    throw new Error('Native MAL token exchange unavailable — rebuild the iOS app (pnpm sync:ios).')
  }
  try {
    await native.exchangeMalToken({
      clientId: malClientId,
      code: res.code,
      codeVerifier: verifier,
      redirectUri: MAL_REDIRECT_URI
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/invalid_client/i.test(msg)) {
      throw new Error(
        'MAL invalid_client — at myanimelist.net/apiconfig the app must be type other/iOS (public, no secret) with App Redirect URL exactly saizen://mal/callback. Web-type apps need a secret and will not work. Put that Client ID in NEXT_PUBLIC_MAL_CLIENT_ID and rebuild.'
      )
    }
    throw new Error(msg)
  }

  const stored = await getMalToken()
  if (!stored?.accessToken) {
    throw new Error('MAL login did not persist to Keychain')
  }
  notifyAuthChanged()
  void flushPendingListSync()
}

export async function disconnectMal(): Promise<void> {
  await clearMalToken()
}

export { ANILIST_REDIRECT_URI, MAL_REDIRECT_URI }
