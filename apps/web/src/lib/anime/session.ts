import type { FranchiseGraph } from '@/lib/anilist'

export type AnimeDetailTab = 'overview' | 'franchise'

export type AnimeSession = {
  tab: AnimeDetailTab
  scrollY: number
}

const sessions = new Map<number, AnimeSession>()
const franchiseCache = new Map<number, FranchiseGraph>()

function isTab(v: unknown): v is AnimeDetailTab {
  return v === 'overview' || v === 'franchise'
}

export function getAnimeSession(id: number): AnimeSession | null {
  if (!Number.isFinite(id) || id <= 0) return null
  return sessions.get(id) ?? null
}

export function setAnimeSession(id: number, patch: Partial<AnimeSession>): AnimeSession | null {
  if (!Number.isFinite(id) || id <= 0) return null
  const prev = sessions.get(id) ?? { tab: 'overview', scrollY: 0 }
  const next: AnimeSession = {
    tab: isTab(patch.tab) ? patch.tab : prev.tab,
    scrollY:
      typeof patch.scrollY === 'number' && Number.isFinite(patch.scrollY)
        ? Math.max(0, patch.scrollY)
        : prev.scrollY
  }
  sessions.set(id, next)
  return next
}

export function cacheFranchiseGraph(id: number, graph: FranchiseGraph | null): void {
  if (!Number.isFinite(id) || id <= 0) return
  if (graph) franchiseCache.set(id, graph)
  else franchiseCache.delete(id)
}

export function peekFranchiseGraph(id: number): FranchiseGraph | null {
  if (!Number.isFinite(id) || id <= 0) return null
  return franchiseCache.get(id) ?? null
}
