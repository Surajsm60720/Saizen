import getNative from '@/lib/native'

const PREFIX = 'saizen.token.'

/** Session-only cache — never persisted to localStorage (S-03). */
const memory = new Map<string, string>()

const LEGACY_TOKEN_KEYS = ['anilist', 'mal'] as const

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

async function secureGet(key: string): Promise<string | null> {
  const cached = memory.get(key)
  if (cached) return cached

  const native = getNative()
  if (native.isApp && native.getSecureItem) {
    try {
      const v = await native.getSecureItem(key)
      if (v) {
        memory.set(key, v)
        scrubLegacyMirror(key)
        return v
      }
    } catch {
      /* fall through */
    }
  }
  return null
}

async function secureSet(key: string, value: string): Promise<void> {
  memory.set(key, value)
  scrubLegacyMirror(key)
  const native = getNative()
  if (native.isApp && native.setSecureItem) {
    try {
      await native.setSecureItem(key, value)
    } catch {
      /* memory already set for this session */
    }
  }
}

async function secureDel(key: string): Promise<void> {
  memory.delete(key)
  scrubLegacyMirror(key)
  const native = getNative()
  if (native.isApp && native.deleteSecureItem) {
    try {
      await native.deleteSecureItem(key)
    } catch {
      /* ignore */
    }
  }
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
  const native = getNative()
  if (!native.isApp || !native.getSecureItem) return
  for (const key of LEGACY_TOKEN_KEYS) {
    if (memory.has(key)) continue
    try {
      const v = await native.getSecureItem(key)
      if (v) memory.set(key, v)
    } catch {
      /* ignore */
    }
  }
}
