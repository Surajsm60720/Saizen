/** Whole-app Incognito Mode — no list sync / Home continue; tagged downloads. */

const KEY = 'saizen:incognito-mode'
const SESSION_CONTINUE_KEY = 'saizen:incognito-continue'
const SESSION_PROGRESS_KEY = 'saizen:incognito-watch-progress'

type Listener = (on: boolean) => void
const listeners = new Set<Listener>()

function readFlag(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

function writeFlag(on: boolean) {
  if (typeof window === 'undefined') return
  try {
    if (on) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    /* quota */
  }
}

export function isIncognitoMode(): boolean {
  return readFlag()
}

/** Clear ephemeral in-session resume (not disk downloads). */
export function clearIncognitoSession() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(SESSION_CONTINUE_KEY)
    sessionStorage.removeItem(SESSION_PROGRESS_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Turn Incognito on/off. Turning off clears ephemeral session resume.
 * Returns the new state.
 */
export function setIncognitoMode(on: boolean): boolean {
  const prev = readFlag()
  writeFlag(on)
  if (prev && !on) clearIncognitoSession()
  for (const listener of listeners) {
    try {
      listener(on)
    } catch {
      /* ignore */
    }
  }
  return on
}

export function subscribeIncognitoMode(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getIncognitoSessionContinueKey() {
  return SESSION_CONTINUE_KEY
}

export function getIncognitoSessionProgressKey() {
  return SESSION_PROGRESS_KEY
}
