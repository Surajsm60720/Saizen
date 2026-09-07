import {
  enterCatalogFallback,
  forceFallbackEnabled,
  isAniListOutageError,
  isCatalogFallback,
  leaveCatalogFallback,
  noteAniListProbeScheduled,
  shouldProbeAniList
} from './status'

/**
 * Try AniList first (unless sticky fallback and not time to probe).
 * On outage errors, switch to Jikan/MAL fallback and retry with `fallback`.
 */
export async function withCatalogFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  label = 'catalog'
): Promise<T> {
  const tryPrimary =
    !forceFallbackEnabled() && (!isCatalogFallback() || shouldProbeAniList())

  if (tryPrimary) {
    try {
      const value = await primary()
      if (isCatalogFallback()) leaveCatalogFallback()
      return value
    } catch (err) {
      if (!isAniListOutageError(err)) throw err
      enterCatalogFallback(
        err instanceof Error ? err.message : `AniList unavailable (${label})`
      )
      noteAniListProbeScheduled()
    }
  } else if (forceFallbackEnabled() && !isCatalogFallback()) {
    enterCatalogFallback('Forced catalog fallback (saizen:force-catalog-fallback)')
  }

  return fallback()
}

/** Like withCatalogFallback but primary returning null is not an outage. */
export async function withCatalogFallbackNullable<T>(
  primary: () => Promise<T | null>,
  fallback: () => Promise<T | null>,
  label = 'catalog'
): Promise<T | null> {
  const tryPrimary =
    !forceFallbackEnabled() && (!isCatalogFallback() || shouldProbeAniList())
  if (tryPrimary) {
    try {
      const value = await primary()
      if (isCatalogFallback()) leaveCatalogFallback()
      return value
    } catch (err) {
      if (!isAniListOutageError(err)) throw err
      enterCatalogFallback(
        err instanceof Error ? err.message : `AniList unavailable (${label})`
      )
      noteAniListProbeScheduled()
    }
  } else if (forceFallbackEnabled() && !isCatalogFallback()) {
    enterCatalogFallback('Forced catalog fallback (saizen:force-catalog-fallback)')
  }
  return fallback()
}
