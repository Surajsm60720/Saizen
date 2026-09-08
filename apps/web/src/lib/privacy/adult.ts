import { setIncognitoMode } from '@/lib/privacy/incognito'

/** Fired when Adult Mode (or legacy showNsfw) changes. */
export const ADULT_MODE_CHANGED = 'saizen:adult-mode-changed'
/** @deprecated alias — same event as ADULT_MODE_CHANGED */
export const ADULT_CONTENT_CHANGED = ADULT_MODE_CHANGED

export const ADULT_MODE_KEY = 'saizen:adult-mode'
export const ADULT_PRIMARY_MODULE_KEY = 'saizen:adult-primary-module'
export const ADULT_INCOGNITO_PRIMED_KEY = 'saizen:adult-incognito-primed'

/** Legacy Modules “Show NSFW” key — migrated into ADULT_MODE_KEY on first read. */
export const SHOW_NSFW_MODULES_KEY = 'saizen:modules:showNsfw'

type Listener = (on: boolean) => void
const listeners = new Set<Listener>()

function canUseStorage(): boolean {
  return typeof window !== 'undefined'
}

function readRaw(key: string): string | null {
  if (!canUseStorage()) return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeRaw(key: string, value: string | null) {
  if (!canUseStorage()) return
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* quota */
  }
}

function migrateLegacyShowNsfw(): void {
  if (readRaw(ADULT_MODE_KEY) != null) return
  const legacy = readRaw(SHOW_NSFW_MODULES_KEY)
  if (legacy === '1') writeRaw(ADULT_MODE_KEY, '1')
  else if (legacy === '0') writeRaw(ADULT_MODE_KEY, '0')
}

function emitChanged(on: boolean) {
  try {
    window.dispatchEvent(new Event(ADULT_MODE_CHANGED))
  } catch {
    /* ignore */
  }
  for (const listener of listeners) {
    try {
      listener(on)
    } catch {
      /* ignore */
    }
  }
}

function primeIncognitoOnce() {
  if (readRaw(ADULT_INCOGNITO_PRIMED_KEY) === '1') return
  writeRaw(ADULT_INCOGNITO_PRIMED_KEY, '1')
  try {
    setIncognitoMode(true)
  } catch {
    /* ignore */
  }
}

/** Master Adult Mode switch. */
export function isAdultModeOn(): boolean {
  migrateLegacyShowNsfw()
  return readRaw(ADULT_MODE_KEY) === '1'
}

/**
 * Turn Adult Mode on/off.
 * First enable primes Incognito once (see ADULT_INCOGNITO_PRIMED_KEY).
 * Turning Adult Mode off also turns Incognito off.
 * Returns the new state.
 */
export function setAdultMode(on: boolean): boolean {
  migrateLegacyShowNsfw()
  writeRaw(ADULT_MODE_KEY, on ? '1' : '0')
  // Keep legacy key in sync for any stale readers.
  writeRaw(SHOW_NSFW_MODULES_KEY, on ? '1' : '0')
  if (on) {
    primeIncognitoOnce()
  } else {
    try {
      setIncognitoMode(false)
    } catch {
      /* ignore */
    }
  }
  emitChanged(on)
  return on
}

export function subscribeAdultMode(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getAdultPrimaryModuleId(): string | null {
  const id = readRaw(ADULT_PRIMARY_MODULE_KEY)
  return id && id.trim() ? id.trim() : null
}

export function setAdultPrimaryModuleId(id: string | null) {
  const next = id && id.trim() ? id.trim() : null
  const prev = getAdultPrimaryModuleId()
  writeRaw(ADULT_PRIMARY_MODULE_KEY, next)
  if (next !== prev) emitChanged(isAdultModeOn())
}

/** @deprecated Use isAdultModeOn */
export function isShowNsfwModulesOn(): boolean {
  return isAdultModeOn()
}

/** @deprecated Use setAdultMode */
export function setShowNsfwModules(on: boolean) {
  setAdultMode(on)
}

/**
 * Adult surfaces / native allowNsfw follow Adult Mode only.
 * Main Search must not use this for AniList includeAdult.
 */
export function hasAdultContentEnabled(): boolean {
  return isAdultModeOn()
}
