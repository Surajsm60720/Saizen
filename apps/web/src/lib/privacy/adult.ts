import { hasAdultExtensionsEnabled } from '@/lib/extensions'

export const ADULT_CONTENT_CHANGED = 'saizen:adult-content-changed'

export const SHOW_NSFW_MODULES_KEY = 'saizen:modules:showNsfw'

/** Modules page “Show NSFW” preference (localStorage). */
export function isShowNsfwModulesOn(): boolean {
  try {
    return localStorage.getItem(SHOW_NSFW_MODULES_KEY) === '1'
  } catch {
    return false
  }
}

export function setShowNsfwModules(on: boolean) {
  try {
    localStorage.setItem(SHOW_NSFW_MODULES_KEY, on ? '1' : '0')
  } catch {
    // ignore
  }
  try {
    window.dispatchEvent(new Event(ADULT_CONTENT_CHANGED))
  } catch {
    // ignore
  }
}

/**
 * Adult catalog/search should be on when either:
 * - a hentai torrent extension is enabled, or
 * - the user turned on Show NSFW modules (stream sources).
 */
export function hasAdultContentEnabled(): boolean {
  return hasAdultExtensionsEnabled() || isShowNsfwModulesOn()
}
