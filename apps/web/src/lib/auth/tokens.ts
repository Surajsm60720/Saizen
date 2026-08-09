import { refreshNative } from '@/lib/native'
import { whenBridgeReady } from '@/lib/native/ready'

const PREFIX = 'saizen.token.'

/** Session-only cache — never persisted to localStorage (S-03). */
const memory = new Map<string, string>()

const LEGACY_TOKEN_KEYS = ['anilist', 'mal'] as const

export const AUTH_CHANGED_EVENT = 'saizen:auth-changed'

function emitAuthChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
}

/** Notify Settings / Home after native Keychain writes that skip setAnilistToken. */
export function notifyAuthChanged(): void {
  emitAuthChanged()
}

/** Subscribe to sign-in / sign-out / Keychain hydrate. */
export function subscribeAuthChanged(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(AUTH_CHANGED_EVENT, listener)
  return () => window.removeEventListener(AUTH_CHANGED_EVENT, listener)
}

function scrubLegacyMirror(key: string) {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    /* ignore */
  }
}

/** Wipe any plaintext token mirrors left by older builds. */
export function scrubLegacyTokenMirrors(): void {
  for (const key of LEGACY_TOKEN_KEYS) scrubLegacyMirror(key)
}

async function nativeBridge() {
  await whenBridgeReady()
  return refreshNative()
}

async function secureGet(key: string): Promise<string | null> {
  const cached = memory.get(key)
  if (cached) return cached

  const native = await nativeBridge()
  if (native.isApp && native.getSecureItem) {
    try {
      const v = await native.getSecureItem(key)
      if (v) {
        memory.set(key, v)
        scrubLegacyMirror(key)
        return v
      }
    } catch (e) {
      console.warn('[saizen] Keychain read failed', key, e)
    }
  }
  return null
}

async function secureSet(key: string, value: string): Promise<void> {
  memory.set(key, value)
  scrubLegacyMirror(key)

  const native = await nativeBridge()
  if (native.isApp && native.setSecureItem) {
    await native.setSecureItem(key, value)
    // Round-trip so a silent Keychain miss can't look like a successful login.
    const roundTrip = native.getSecureItem ? await native.getSecureItem(key) : null
    if (roundTrip !== value) {
      memory.delete(key)
      throw new Error(
        'Could not save login to Keychain. Rebuild the iOS app (pnpm sync:ios) and try again.'
      )
    }
    emitAuthChanged()
    return
  }

  // Cap platform without bridge = broken install; don't pretend memory-only login persists.
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (Capacitor.isNativePlatform()) {
      memory.delete(key)
      throw new Error(
        'Secure storage unavailable — rebuild the iOS app (pnpm sync:ios).'
      )
    }
  } catch (e) {
    if (e instanceof Error && /Secure storage|Keychain/i.test(e.message)) throw e
  }

  emitAuthChanged()
}

async function secureDel(key: string): Promise<void> {
  memory.delete(key)
  scrubLegacyMirror(key)
  const native = await nativeBridge()
  if (native.isApp && native.deleteSecureItem) {
    try {
      await native.deleteSecureItem(key)
    } catch {
      /* ignore */
    }
  }
  emitAuthChanged()
}

export type StoredAnilistToken = {
  accessToken: string
  expiresAt: number | null
}

export type StoredMalToken = {
  accessToken: string
  refreshToken: string
  expiresAt: number | null
}

export async function getAnilistToken(): Promise<StoredAnilistToken | null> {
  const raw = await secureGet('anilist')
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredAnilistToken
  } catch {
    return null
  }
}

export async function setAnilistToken(token: StoredAnilistToken): Promise<void> {
  await secureSet('anilist', JSON.stringify(token))
}

export async function clearAnilistToken(): Promise<void> {
  await secureDel('anilist')
}

export async function getMalToken(): Promise<StoredMalToken | null> {
  const raw = await secureGet('mal')
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredMalToken
  } catch {
    return null
  }
}

export async function setMalToken(token: StoredMalToken): Promise<void> {
  await secureSet('mal', JSON.stringify(token))
}

export async function clearMalToken(): Promise<void> {
  await secureDel('mal')
}

export async function isAnilistConnected(): Promise<boolean> {
  const t = await getAnilistToken()
  return Boolean(t?.accessToken)
}

export async function isMalConnected(): Promise<boolean> {
  const t = await getMalToken()
  return Boolean(t?.accessToken)
}

/**
 * After the native bridge is up: wipe legacy localStorage token mirrors,
 * then warm the in-memory cache from Keychain so Home personalization works
 * without a Settings hop.
 */
export async function hydrateTokenMirrors(): Promise<void> {
  scrubLegacyTokenMirrors()
  const native = await nativeBridge()
  if (!native.isApp || !native.getSecureItem) {
    emitAuthChanged()
    return
  }
  for (const key of LEGACY_TOKEN_KEYS) {
    try {
      const v = await native.getSecureItem(key)
      if (v) memory.set(key, v)
      else memory.delete(key)
    } catch {
      /* ignore */
    }
  }
  emitAuthChanged()
}
