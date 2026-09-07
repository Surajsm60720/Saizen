/**
 * MAL catalog read APIs (Jikan-compatible).
 * Tenrai is preferred — public Jikan often 504s when MAL is flaky, and
 * public Jikan is scheduled to shut down 2026-10-01.
 */
export const MAL_CATALOG_BASES = [
  'https://api.tenrai.org/v1',
  'https://api.jikan.moe/v4'
] as const

export const MAL_CATALOG_PRIMARY = MAL_CATALOG_BASES[0]
