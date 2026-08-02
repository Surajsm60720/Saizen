const CRED_KEY = 'saizen:oauth-credentials'

export const ANILIST_REDIRECT_URI = 'saizen://anilist/callback'
export const MAL_REDIRECT_URI = 'saizen://mal/callback'

export type OAuthCredentials = {
  anilistClientId: string
  malClientId: string
}

/**
 * App-owned OAuth clients (baked at build time).
 * Users sign in with their own AniList/MAL accounts — they never create a client.
 * Register ONE Saizen app as the developer, put public Client IDs in .env.local.
 *
 * NEVER put client secrets in NEXT_PUBLIC_* — they ship in the JS bundle.
 * MAL must be a public/installed client (PKCE only).
 */
const APP_DEFAULTS: OAuthCredentials = {
  anilistClientId: (process.env.NEXT_PUBLIC_ANILIST_CLIENT_ID || '').trim(),
  malClientId: (process.env.NEXT_PUBLIC_MAL_CLIENT_ID || '').trim()
}

const EMPTY: OAuthCredentials = {
  anilistClientId: '',
  malClientId: ''
}

function readOverrides(): Partial<OAuthCredentials> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(CRED_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      anilistClientId:
        typeof parsed.anilistClientId === 'string' ? parsed.anilistClientId : undefined,
      malClientId: typeof parsed.malClientId === 'string' ? parsed.malClientId : undefined
    }
  } catch {
    return {}
  }
}

/** Merged credentials: local override → app env defaults. */
export function getOAuthCredentials(): OAuthCredentials {
  const o = readOverrides()
  return {
    anilistClientId: String(o.anilistClientId || APP_DEFAULTS.anilistClientId || '').trim(),
    malClientId: String(o.malClientId || APP_DEFAULTS.malClientId || '').trim()
  }
}

export function getAppDefaultCredentials(): OAuthCredentials {
  return { ...APP_DEFAULTS }
}

export function hasAppClientIds(): boolean {
  return Boolean(APP_DEFAULTS.anilistClientId || APP_DEFAULTS.malClientId)
}

export function setOAuthCredentials(patch: Partial<OAuthCredentials>): OAuthCredentials {
  const prev = readOverrides()
  const next = {
    anilistClientId: String(patch.anilistClientId ?? prev.anilistClientId ?? '').trim(),
    malClientId: String(patch.malClientId ?? prev.malClientId ?? '').trim()
  }
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CRED_KEY, JSON.stringify(next))
    } catch {
      /* quota */
    }
  }
  return getOAuthCredentials()
}

/** Clear any legacy secret field that may still sit in localStorage from older builds. */
export function scrubLegacyCredentialSecrets(): void {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(CRED_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, unknown>
    let changed = false
    for (const key of Object.keys(parsed)) {
      if (/secret/i.test(key)) {
        delete parsed[key]
        changed = true
      }
    }
    if (changed) localStorage.setItem(CRED_KEY, JSON.stringify(parsed))
  } catch {
    /* ignore */
  }
}

export { EMPTY as EMPTY_OAUTH_CREDENTIALS }
