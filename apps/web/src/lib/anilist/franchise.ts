import {
  fetchMediaRelations,
  type AnimeMedia,
  type AnimeRelationEdge,
  type AnimeRelationNode
} from './client'

/** Story-family relation types used by the franchise walk. */
export const FRANCHISE_RELATION_TYPES = new Set([
  'PREQUEL',
  'SEQUEL',
  'PARENT',
  'SIDE_STORY',
  'SPIN_OFF',
  'ALTERNATIVE',
  'SUMMARY'
])

const RELATION_PRIORITY: Record<string, number> = {
  PREQUEL: 0,
  SEQUEL: 1,
  PARENT: 2,
  SIDE_STORY: 3,
  SPIN_OFF: 4,
  ALTERNATIVE: 5,
  SUMMARY: 6
}

export type FranchiseNode = AnimeRelationNode & {
  /** Relation from the root anime when first discovered (best-effort). */
  relationFromRoot?: string | null
}

export type FranchiseEdge = {
  from: number
  to: number
  relationType: string
}

export type FranchiseGraph = {
  rootId: number
  nodes: FranchiseNode[]
  edges: FranchiseEdge[]
}

export type RelatedTitle = {
  id: number
  relationType: string
  media: AnimeRelationNode
}

function isAnimeNode(node: AnimeRelationNode): boolean {
  if (node.type === 'ANIME') return true
  if (node.type && node.type !== 'ANIME') return false
  const fmt = (node.format || '').toUpperCase()
  return !fmt || ['TV', 'TV_SHORT', 'MOVIE', 'OVA', 'ONA', 'SPECIAL', 'MUSIC'].includes(fmt)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * BFS over AniList relations (same walk previously used for Mermaid).
 * Caps node count and depth; sequential fetches with delay for rate limits.
 */
export async function buildFranchiseGraph(
  rootId: number,
  opts?: { maxNodes?: number; maxDepth?: number; delayMs?: number }
): Promise<FranchiseGraph> {
  const delayMs = opts?.delayMs ?? 400
  const maxNodes = opts?.maxNodes ?? 16
  const maxDepth = opts?.maxDepth ?? 4

  const nodes = new Map<number, FranchiseNode>()
  const edgeKeys = new Set<string>()
  const edges: FranchiseEdge[] = []
  const queue: Array<{ id: number; depth: number; relationFromRoot?: string | null }> = [
    { id: rootId, depth: 0, relationFromRoot: null }
  ]
  const enqueued = new Set<number>([rootId])

  while (queue.length && nodes.size < maxNodes) {
    const { id, depth, relationFromRoot } = queue.shift()!
    if (nodes.has(id)) continue

    let media: Awaited<ReturnType<typeof fetchMediaRelations>>
    try {
      media = await fetchMediaRelations(id)
    } catch {
      continue
    }
    if (!media?.id) continue
    if (!isAnimeNode(media) && id !== rootId) continue

    nodes.set(id, { ...media, relationFromRoot: relationFromRoot ?? null })

    if (depth >= maxDepth) continue

    const relEdges = (media.relations?.edges ?? []).filter(
      (e): e is AnimeRelationEdge & { node: AnimeRelationNode; relationType: string } =>
        Boolean(e?.node?.id && e.relationType && FRANCHISE_RELATION_TYPES.has(e.relationType))
    )

    for (const e of relEdges) {
      const child = e.node!
      if (!isAnimeNode(child) && child.id !== rootId) continue

      const key = `${id}->${child.id}:${e.relationType}`
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key)
        edges.push({ from: id, to: child.id, relationType: e.relationType! })
      }

      if (!enqueued.has(child.id) && nodes.size + queue.length < maxNodes) {
        enqueued.add(child.id)
        queue.push({
          id: child.id,
          depth: depth + 1,
          relationFromRoot: depth === 0 ? e.relationType : relationFromRoot
        })
      }
    }

    if (queue.length) await sleep(delayMs)
  }

  return {
    rootId,
    nodes: [...nodes.values()],
    edges
  }
}

/** Card list for Relations tab: franchise titles in story/watch order (local sort, no API). */
export function franchiseRelatedList(graph: FranchiseGraph): RelatedTitle[] {
  const ordered = franchiseWatchOrder(graph)
  return ordered
    .filter((n) => n.id !== graph.rootId)
    .map((n) => ({
      id: n.id,
      relationType: n.relationFromRoot ?? 'RELATED',
      media: n
    }))
}

/**
 * Order franchise nodes the way a relation diagram would read left→right:
 * follow PREQUEL/SEQUEL as a timeline, then attach side stories by year.
 * Purely local — uses the graph already built by `buildFranchiseGraph`.
 */
export function franchiseWatchOrder(graph: FranchiseGraph): FranchiseNode[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  if (byId.size === 0) return []

  // Directed "comes before" edges for mainline story.
  const before = new Map<number, Set<number>>() // a → set of nodes that must come after a
  const indegree = new Map<number, number>()
  for (const id of byId.keys()) {
    before.set(id, new Set())
    indegree.set(id, 0)
  }

  const ensureEdge = (earlier: number, later: number) => {
    if (!byId.has(earlier) || !byId.has(later) || earlier === later) return
    const set = before.get(earlier)!
    if (set.has(later)) return
    set.add(later)
    indegree.set(later, (indegree.get(later) ?? 0) + 1)
  }

  for (const e of graph.edges) {
    const t = e.relationType
    if (t === 'SEQUEL' || t === 'PARENT') {
      // from → to means to is sequel / child of from → from first
      ensureEdge(e.from, e.to)
    } else if (t === 'PREQUEL') {
      // from has prequel to → to comes before from
      ensureEdge(e.to, e.from)
    }
  }

  const yearOf = (id: number) => byId.get(id)?.seasonYear ?? 9999
  const ready = [...byId.keys()]
    .filter((id) => (indegree.get(id) ?? 0) === 0)
    .sort((a, b) => yearOf(a) - yearOf(b) || a - b)

  const mainline: number[] = []
  const seen = new Set<number>()
  while (ready.length) {
    const id = ready.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    mainline.push(id)
    for (const next of before.get(id) ?? []) {
      const d = (indegree.get(next) ?? 1) - 1
      indegree.set(next, d)
      if (d === 0) {
        ready.push(next)
        ready.sort((a, b) => yearOf(a) - yearOf(b) || a - b)
      }
    }
  }

  // Cycle leftovers / unreachable: append by year
  for (const id of [...byId.keys()].sort((a, b) => yearOf(a) - yearOf(b) || a - b)) {
    if (!seen.has(id)) {
      seen.add(id)
      mainline.push(id)
    }
  }

  // Prefer side-story / spin-off / alternative / summary after related main entries by year
  // within the same relative bucket — already covered by topo + year; refine labels only.
  return mainline.map((id) => byId.get(id)!).filter(Boolean)
}

/** Instant one-hop fallback from the anime detail payload (no extra requests). */
export function listStoryRelations(media: AnimeMedia | null | undefined): RelatedTitle[] {
  const edges = media?.relations?.edges ?? []
  const seen = new Set<number>()
  const out: RelatedTitle[] = []

  for (const e of edges) {
    const node = e?.node
    const relationType = e?.relationType
    if (!node?.id || !relationType || !FRANCHISE_RELATION_TYPES.has(relationType)) continue
    if (!isAnimeNode(node)) continue
    if (seen.has(node.id)) continue
    seen.add(node.id)
    out.push({ id: node.id, relationType, media: node })
  }

  return out.sort((a, b) => {
    const ya = a.media.seasonYear ?? 9999
    const yb = b.media.seasonYear ?? 9999
    if (ya !== yb) return ya - yb
    const pa = RELATION_PRIORITY[a.relationType] ?? 50
    const pb = RELATION_PRIORITY[b.relationType] ?? 50
    return pa - pb
  })
}
