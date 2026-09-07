import { saizenFetchJson } from '@/lib/extensions/fetch'

const malToAni = new Map<number, number | null>()
const aniToMal = new Map<number, number | null>()

type ArmIds = {
  anilist?: number | null
  myanimelist?: number | null
}

async function armLookup(
  source: 'anilist' | 'myanimelist',
  id: number
): Promise<ArmIds | null> {
  try {
    return await saizenFetchJson<ArmIds>(
      `https://arm.haglund.dev/api/v2/ids?source=${source}&id=${id}&include=anilist,myanimelist`
    )
  } catch {
    return null
  }
}

/** Resolve MAL → AniList id (null if unknown). */
export async function malToAnilistId(malId: number): Promise<number | null> {
  if (!malId) return null
  if (malToAni.has(malId)) return malToAni.get(malId) ?? null
  const arm = await armLookup('myanimelist', malId)
  const ani = arm?.anilist && arm.anilist > 0 ? arm.anilist : null
  malToAni.set(malId, ani)
  if (ani) aniToMal.set(ani, malId)
  return ani
}

/** Resolve AniList → MAL id (null if unknown). */
export async function anilistToMalId(anilistId: number): Promise<number | null> {
  if (!anilistId) return null
  if (aniToMal.has(anilistId)) return aniToMal.get(anilistId) ?? null
  const arm = await armLookup('anilist', anilistId)
  const mal = arm?.myanimelist && arm.myanimelist > 0 ? arm.myanimelist : null
  aniToMal.set(anilistId, mal)
  if (mal) malToAni.set(mal, anilistId)
  return mal
}

/**
 * Canonical app media id: prefer AniList when ARM knows it, else MAL id.
 * Downstream stream mapping already uses idMal / title when needed.
 */
export async function canonicalMediaId(malId: number, knownAni?: number | null): Promise<number> {
  if (knownAni && knownAni > 0) {
    aniToMal.set(knownAni, malId)
    malToAni.set(malId, knownAni)
    return knownAni
  }
  const ani = await malToAnilistId(malId)
  return ani ?? malId
}

export async function mapMalIdsToCanonical(
  malIds: number[]
): Promise<Map<number, number>> {
  const out = new Map<number, number>()
  const unique = [...new Set(malIds.filter((id) => id > 0))]
  // Bound concurrency so ARM + Jikan don't stampede.
  const concurrency = 4
  let i = 0
  async function worker() {
    while (i < unique.length) {
      const idx = i++
      const mal = unique[idx]!
      out.set(mal, await canonicalMediaId(mal))
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, () => worker()))
  return out
}
