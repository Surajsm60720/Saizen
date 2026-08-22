'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  fetchAnime,
  displayTitle,
  stripHtml,
  formatSource,
  mainStudioName,
  trailerWatchUrl,
  deriveSourceMaterials,
  peekViewerListCache,
  fetchViewerListEntry,
  buildFranchiseGraph,
  franchiseWatchOrder,
  listStoryRelations,
  type AnimeMedia,
  type FranchiseGraph
} from '@/lib/anilist'
import {
  fetchThemesByAniListId,
  type AnimeThemeTrack
} from '@/lib/animethemes'
import { fetchSkipTimes } from '@/lib/aniskip'
import { fetchAniZipEpisodes, type AniZipEpisode } from '@/lib/anizip/episodes'
import { fetchJikanEpisodeList, type JikanEpisodeDetail } from '@/lib/jikan/episodes'
import getNative from '@/lib/native'
import { whenBridgeReady } from '@/lib/native/ready'
import type {
  LibraryEntry,
  NativePlayerAction,
  PlayStreamOptions,
  StreamCandidate
} from '@saizen/shared'
import { isAnilistConnected, isMalConnected } from '@/lib/auth/tokens'
import type { AniListStatus } from '@/lib/auth/sync'
import { listContinueWatching, recordContinueWatching } from '@/lib/watch/continue'
import { getProbedDurationSec } from '@/lib/watch/episodeMeta'
import { isEpisodeWatched } from '@/lib/watch/progress'
import { setActivePlayback } from '@/lib/watch/activePlayback'
import { getWatchSettings } from '@/lib/watch/settings'
import { getDownloadSettings } from '@/lib/downloads/settings'
import { seasonFolderLabel } from '@/lib/downloads/season'
import { isIncognitoMode, subscribeIncognitoMode } from '@/lib/privacy/incognito'
import { pickStreamForQuality } from '@/lib/downloads/resolve'
import { subscribeLibraryForMedia } from '@/lib/downloads/store'
import { toast } from 'sonner'
import {
  consumePendingPlayerAction,
  onPlayerAction
} from '@/lib/watch/playerActions'
import {
  cacheFranchiseGraph,
  getAnimeSession,
  peekFranchiseGraph,
  setAnimeSession,
  type AnimeDetailTab
} from '@/lib/anime/session'
import {
  AnimeHeader,
  DownloadPickerSheet,
  EpisodeList,
  EpisodeRow,
  EpisodeSourcesSheet,
  ListEditSheet,
  PersonRail,
  PosterCard,
  PosterRail,
  ThemeTracks,
  buildEpisodeItems,
  type EpisodeItem,
  type ListEditValues,
  type PersonRailItem
} from '@/components/saizen'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

function AnimeDetail() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const id = Number(searchParams.get('id') || 0)

  const [media, setMedia] = useState<AnimeMedia | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /** Bumped to re-fetch after WebView process death / transient AniList failures. */
  const [mediaReloadToken, setMediaReloadToken] = useState(0)
  const [selected, setSelected] = useState<EpisodeItem | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [streamsSearching, setStreamsSearching] = useState(false)
  const [streamCandidates, setStreamCandidates] = useState<StreamCandidate[]>([])
  const [moduleNames, setModuleNames] = useState<Record<string, string>>({})
  const [playing, setPlaying] = useState(false)
  const [streamStatus, setStreamStatus] = useState('')
  const [themes, setThemes] = useState<AnimeThemeTrack[]>([])
  const [themesLoading, setThemesLoading] = useState(false)
  const [themesNotice, setThemesNotice] = useState<string | null>(null)
  const [themesReload, setThemesReload] = useState(0)
  const [probedTick, setProbedTick] = useState(0)
  const [jikanByEp, setJikanByEp] = useState<Map<number, JikanEpisodeDetail>>(
    () => new Map()
  )
  const [aniZipByEp, setAniZipByEp] = useState<Map<number, AniZipEpisode>>(
    () => new Map()
  )
  const [aniZipCount, setAniZipCount] = useState<number | null>(null)
  const [listProgress, setListProgress] = useState<number | null>(null)
  const [listEntry, setListEntry] = useState<ListEditValues | null>(null)
  const [listConnected, setListConnected] = useState(false)
  const [listSheetOpen, setListSheetOpen] = useState(false)
  const [detailTab, setDetailTab] = useState<AnimeDetailTab>(
    () => getAnimeSession(id)?.tab ?? 'overview'
  )
  const [sessionId, setSessionId] = useState(id)
  if (sessionId !== id) {
    setSessionId(id)
    setDetailTab(getAnimeSession(id)?.tab ?? 'overview')
  }
  const [franchise, setFranchise] = useState<FranchiseGraph | null>(null)
  const [franchiseLoading, setFranchiseLoading] = useState(false)
  const [franchiseLoadedFor, setFranchiseLoadedFor] = useState<number | null>(null)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [selectingEps, setSelectingEps] = useState(false)
  const [selectedEps, setSelectedEps] = useState<Set<number>>(() => new Set())
  const [downloadedEps, setDownloadedEps] = useState<Set<number>>(() => new Set())
  const [downloadedByEp, setDownloadedByEp] = useState<Map<number, string>>(() => new Map())
  const [downloadBusy, setDownloadBusy] = useState(false)
  const [incognito, setIncognito] = useState(false)

  useEffect(() => {
    setIncognito(isIncognitoMode())
    return subscribeIncognitoMode(setIncognito)
  }, [])

  const LIST_STATUS_LABELS: Record<string, string> = {
    CURRENT: 'Watching',
    PLANNING: 'Plan to watch',
    COMPLETED: 'Completed',
    PAUSED: 'On hold',
    DROPPED: 'Dropped',
    REPEATING: 'Rewatching'
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!id) {
        setError('Invalid anime id')
        setLoading(false)
        return
      }
      setLoading(true)
      setError('')
      setSelected(null)
      setSheetOpen(false)
      setStreamCandidates([])
      setModuleNames({})
      setStreamStatus('')
      setStreamsSearching(false)
      setThemes([])
      setThemesNotice(null)
      setJikanByEp(new Map())
      setAniZipByEp(new Map())
      setAniZipCount(null)
      setListProgress(null)
      setListEntry(null)
      setListSheetOpen(false)
      const cachedFranchise = peekFranchiseGraph(id)
      setFranchise(cachedFranchise)
      setFranchiseLoadedFor(cachedFranchise ? id : null)
      setFranchiseLoading(false)
      try {
        const m = await fetchAnime(id)
        if (cancelled) return
        if (!m) setError('Anime not found')
        else {
          setMedia(m)
          const cached = peekViewerListCache()?.find((e) => e.media.id === id)
          if (cached) {
            setListProgress(cached.progress)
            setListEntry({
              entryId: cached.id,
              status: (cached.status as AniListStatus) || 'CURRENT',
              score: cached.score ?? 0,
              progress: cached.progress ?? 0,
              repeat: cached.repeat ?? 0
            })
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, mediaReloadToken])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      // After a WKWebView content-process crash+reload, in-flight fetches die — retry.
      if (error || (!media && !loading && id)) {
        setMediaReloadToken((n) => n + 1)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
    }
  }, [error, media, loading, id])

  useEffect(() => {
    if (!id) return
    setAnimeSession(id, { tab: detailTab })
  }, [id, detailTab])

  useEffect(() => {
    if (!id) return
    let lastY = getAnimeSession(id)?.scrollY ?? window.scrollY
    const onScroll = () => {
      lastY = window.scrollY
      setAnimeSession(id, { scrollY: lastY })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      // Persist last in-page Y — don't re-read window.scrollY (AppShell may
      // already have restored another route's position).
      setAnimeSession(id, { scrollY: lastY })
      window.removeEventListener('scroll', onScroll)
    }
  }, [id])

  useEffect(() => {
    if (!id || loading) return
    const y = getAnimeSession(id)?.scrollY ?? 0
    const apply = () => window.scrollTo(0, y)
    apply()
    const frame = window.requestAnimationFrame(apply)
    return () => window.cancelAnimationFrame(frame)
  }, [id, loading])

  useEffect(() => {
    let cancelled = false
    void Promise.all([isAnilistConnected(), isMalConnected()]).then(([a, m]) => {
      if (!cancelled) setListConnected(a || m)
    })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (!id) return
    const apply = (entries: LibraryEntry[]) => {
      const eps = new Set<number>()
      const byEp = new Map<number, string>()
      const showIncognito = isIncognitoMode()
      for (const e of entries) {
        if (e.isIncognito && !showIncognito) continue
        if (e.status === 'completed' || e.progress >= 1) {
          eps.add(e.episode)
          byEp.set(e.episode, e.id)
        }
      }
      setDownloadedEps(eps)
      setDownloadedByEp(byEp)
    }
    return subscribeLibraryForMedia(id, apply)
  }, [id])

  useEffect(() => {
    if (!id || !listConnected) return
    let cancelled = false
    // Prefer full list cache (fewer AniList hits) then fall back to single-entry fetch.
    void (async () => {
      try {
        const { fetchViewerAnimeList } = await import('@/lib/anilist')
        const entries = await fetchViewerAnimeList(
          ['CURRENT', 'REPEATING', 'COMPLETED', 'PAUSED', 'PLANNING', 'DROPPED']
        )
        if (cancelled) return
        const hit = entries.find((e) => e.media.id === id)
        if (hit) {
          setListProgress(hit.progress)
          setListEntry({
            entryId: hit.id,
            status: (hit.status as AniListStatus) || 'CURRENT',
            score: hit.score ?? 0,
            progress: hit.progress ?? 0,
            repeat: hit.repeat ?? 0
          })
          return
        }
      } catch {
        /* fall through to single-entry */
      }

      const result = await fetchViewerListEntry(id)
      if (cancelled) return
      if (result.status === 'found') {
        setListProgress(result.entry.progress)
        setListEntry({
          entryId: result.entry.id,
          status: (result.entry.status as AniListStatus) || 'CURRENT',
          score: result.entry.score ?? 0,
          progress: result.entry.progress ?? 0,
          repeat: result.entry.repeat ?? 0
        })
        return
      }
      if (result.status === 'missing') {
        setListEntry(null)
        setListProgress(null)
        return
      }
      if (result.entry) {
        setListProgress(result.entry.progress)
        setListEntry({
          entryId: result.entry.id,
          status: (result.entry.status as AniListStatus) || 'CURRENT',
          score: result.entry.score ?? 0,
          progress: result.entry.progress ?? 0,
          repeat: result.entry.repeat ?? 0
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, listConnected])

  useEffect(() => {
    if (!media?.id) return
    let cancelled = false
    const t = window.setTimeout(() => {
      if (cancelled) return
      setThemesLoading(true)
      setThemesNotice(null)
      void fetchThemesByAniListId(media.id, {
        idMal: media.idMal,
        title: displayTitle(media)
      })
        .then((res) => {
          if (cancelled) return
          setThemes(res.tracks)
          setThemesNotice(
            res.source === 'jikan' || res.source === 'mal'
              ? 'From MyAnimeList'
              : res.tracks.length === 0
                ? 'No themes found for this title'
                : null
          )
        })
        .catch(() => {
          if (cancelled) return
          setThemes([])
          setThemesNotice('Could not load themes')
        })
        .finally(() => {
          if (!cancelled) setThemesLoading(false)
        })
    }, 120)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [media?.id, media?.idMal, themesReload])

  // media title used inside effect — ok as media changes with id


  useEffect(() => {
    if (!media?.id) return
    let cancelled = false
    const t = window.setTimeout(() => {
      if (cancelled) return
      void fetchAniZipEpisodes(media.id)
        .then((bundle) => {
          if (cancelled) return
          setAniZipByEp(bundle.episodes)
          setAniZipCount(bundle.episodeCount)
        })
        .catch(() => {})
    }, 40)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [media?.id])

  // Franchise BFS only when Relations tab opens (same walk as Mermaid, cards only).
  useEffect(() => {
    if (detailTab !== 'franchise' || !media?.id) return
    if (franchiseLoadedFor === media.id) return
    let cancelled = false
    setFranchiseLoading(true)
    void buildFranchiseGraph(media.id)
      .then((g) => {
        if (cancelled) return
        setFranchise(g)
        cacheFranchiseGraph(media.id, g)
        setFranchiseLoadedFor(media.id)
      })
      .catch(() => {
        if (!cancelled) {
          setFranchise(null)
          setFranchiseLoadedFor(media.id)
        }
      })
      .finally(() => {
        if (!cancelled) setFranchiseLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [detailTab, media?.id, franchiseLoadedFor])

  useEffect(() => {
    if (!media?.idMal) return
    let cancelled = false
    const t = window.setTimeout(() => {
      if (cancelled) return
      void fetchJikanEpisodeList(media.idMal!)
        .then((map) => {
          if (!cancelled) setJikanByEp(map)
        })
        .catch(() => {})
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [media?.idMal])

  // Re-read probed durations / watched flags when returning to this page
  useEffect(() => {
    const onVis = () => setProbedTick((n) => n + 1)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
    }
  }, [])

  const probedByEpisode = useMemo(() => {
    void probedTick
    if (!media?.id) return {} as Record<number, number>
    const map: Record<number, number> = {}
    const total = Math.max(
      media.episodes ?? 0,
      media.nextAiringEpisode?.episode ?? 0,
      aniZipCount ?? 0,
      aniZipByEp.size,
      24
    )
    for (let n = 1; n <= total; n++) {
      const sec = getProbedDurationSec(media.id, n)
      if (sec != null) map[n] = sec
    }
    return map
  }, [media, probedTick, aniZipCount, aniZipByEp.size])

  const episodes = useMemo(() => {
    const jikanMax = jikanByEp.size ? Math.max(...jikanByEp.keys()) : 0
    const zipMax = aniZipByEp.size ? Math.max(...aniZipByEp.keys()) : 0
    const externalCount = Math.max(aniZipCount ?? 0, jikanMax, zipMax)
    // Count aired eps from AniZip (have airDate in the past or any entry ≤ next-1)
    const nextNum = media?.nextAiringEpisode?.episode
    const zipReleased =
      nextNum != null
        ? Math.min(zipMax, Math.max(0, nextNum - 1))
        : zipMax

    const base = buildEpisodeItems({
      episodeCount: media?.episodes,
      duration: media?.duration,
      probedDurationSecByEpisode: probedByEpisode,
      status: media?.status,
      nextAiringEpisode: media?.nextAiringEpisode,
      streamingEpisodes: media?.streamingEpisodes,
      externalEpisodeCount: externalCount || null,
      externalReleasedCount: Math.max(zipReleased, jikanMax) || null
    })

    return base.map((ep) => {
      const zip = aniZipByEp.get(ep.number)
      const j = jikanByEp.get(ep.number)
      const generic =
        !ep.title ||
        /^Episode\s*\d+$/i.test(ep.title) ||
        ep.title === 'Upcoming' ||
        ep.title === `Episode ${ep.number}`
      const title =
        (generic && (zip?.title || j?.title)) || ep.title
      const synopsis = zip?.synopsis || j?.synopsis || ep.synopsis
      const thumbnail = zip?.thumbnail || ep.thumbnail
      const watched =
        !ep.unreleased &&
        media?.id != null &&
        isEpisodeWatched(media.id, ep.number, incognito ? null : listProgress)
      void probedTick
      return {
        ...ep,
        title,
        synopsis,
        thumbnail,
        watched,
        meta:
          ep.meta ||
          (zip?.runtime ? `~${zip.runtime} min` : undefined)
      }
    })
  }, [
    media,
    probedByEpisode,
    jikanByEp,
    aniZipByEp,
    aniZipCount,
    listProgress,
    probedTick,
    incognito
  ])

  const related = useMemo(() => {
    if (franchise && franchise.nodes.length > 1) {
      // Full franchise in diagram-style watch order (local), including current title.
      return franchiseWatchOrder(franchise).map((n) => ({
        id: n.id,
        relationType:
          n.id === franchise.rootId ? 'CURRENT' : n.relationFromRoot ?? 'RELATED',
        media: n,
        isCurrent: n.id === franchise.rootId
      }))
    }
    return listStoryRelations(media).map((r) => ({ ...r, isCurrent: false }))
  }, [media, franchise])

  const sourceMaterials = useMemo(
    () => (media ? deriveSourceMaterials(media) : []),
    [media]
  )

  /** Next episode to resume — local continue rail, list progress, or first unwatched. */
  const continueEpisode = useMemo(() => {
    const released = episodes.filter((e) => !e.unreleased)
    if (!media?.id || !released.length) return null

    const local = listContinueWatching().find((e) => e.anilistId === media.id)
    const hasProgress =
      Boolean(local) ||
      (listProgress != null && listProgress > 0) ||
      released.some((e) => e.watched)
    if (!hasProgress) return null

    const candidate =
      local?.episode ??
      (listProgress != null && listProgress >= 0 ? listProgress + 1 : null)

    if (candidate != null) {
      const hit = released.find((e) => e.number === candidate)
      if (hit && !hit.watched) return hit
      const after = released.find(
        (e) => e.number > (candidate as number) && !e.watched
      )
      if (after) return after
    }

    return released.find((e) => !e.watched) ?? null
  }, [media?.id, episodes, listProgress])

  const recommendations = useMemo(() => {
    const nodes = media?.recommendations?.nodes ?? []
    const seen = new Set<number>()
    return nodes
      .map((n) => n.mediaRecommendation)
      .filter((m): m is NonNullable<typeof m> => Boolean(m?.id))
      .filter((m) => {
        if (seen.has(m.id)) return false
        seen.add(m.id)
        return true
      })
      .slice(0, 12)
  }, [media])

  const characters: PersonRailItem[] = useMemo(() => {
    if (!media) return []
    return (media.characters?.edges ?? [])
      .filter((e) => e?.node?.id)
      .map((e) => {
        const va = (e.voiceActors ?? []).find((v) => v?.id && v?.name?.full)
        return {
          id: e.node!.id,
          name: e.node!.name?.full || 'Unknown',
          role: e.role,
          detail: va?.name?.full ? `CV: ${va.name.full}` : null,
          image: e.node!.image?.large,
          overlayImage: va?.image?.large ?? null,
          href: `/app/character/?id=${e.node!.id}&from=${media.id}`
        }
      })
  }, [media])

  const voiceActors: PersonRailItem[] = useMemo(() => {
    if (!media) return []
    const seen = new Set<number>()
    const out: PersonRailItem[] = []
    for (const e of media.characters?.edges ?? []) {
      const charName = e?.node?.name?.full
      for (const va of e?.voiceActors ?? []) {
        if (!va?.id || !va.name?.full || seen.has(va.id)) continue
        seen.add(va.id)
        out.push({
          id: va.id,
          name: va.name.full,
          role: 'Voice actor',
          detail: charName ? `as ${charName}` : null,
          image: va.image?.large,
          href: `/app/staff/?id=${va.id}&from=${media.id}`
        })
      }
    }
    return out
  }, [media])

  const staff: PersonRailItem[] = useMemo(() => {
    if (!media) return []
    return (media.staff?.edges ?? [])
      .filter((e) => e?.node?.id)
      .map((e) => ({
        id: e.node!.id,
        name: e.node!.name?.full || 'Unknown',
        role: e.role,
        image: e.node!.image?.large,
        href: `/app/staff/?id=${e.node!.id}&from=${media.id}`
      }))
  }, [media])

  const searchSources = useCallback(
    (ep: EpisodeItem) => {
      if (!media || ep.unreleased) return
      setSelected(ep)
      setSheetOpen(true)
      setStreamCandidates([])
      setStreamsSearching(true)
      setStreamStatus(`Searching streams for episode ${ep.number}…`)

      const query =
        media.title.romaji || media.title.english || displayTitle(media)

      void (async () => {
        try {
          // Cap wires SaizenModules in AppShell — wait so we don't hit web stubs
          // (empty listModules / throw resolveStreams) and show a blank sheet.
          await whenBridgeReady()
          const native = getNative()
          if (!native.isApp || !native.resolveStreams || !native.listModules) {
            setStreamCandidates([])
            setStreamStatus('Module streams need the iOS app (bridge not ready)')
            return
          }
          const modules = await native.listModules()
          const names: Record<string, string> = {}
          for (const m of modules) names[m.id] = m.name
          setModuleNames(names)
          const enabled = modules.filter((m) => m.enabled)
          if (!enabled.length) {
            setStreamCandidates([])
            setStreamStatus('Install modules in Settings → Modules')
            return
          }
          const candidates = await native.resolveStreams({
            title: displayTitle(media),
            anilistId: media.id,
            episode: ep.number,
            idMal: media.idMal ?? null,
            query
          })
          const list = candidates ?? []
          setStreamCandidates(list)
          setStreamStatus(
            list.length > 0
              ? `${list.length} stream(s) from modules`
              : enabled.some((m) => /pahe/i.test(m.name) || m.id === 'jLCx0')
                ? 'No streams — AnimePahe’s bypass is down; install Animex in Settings → Modules'
                : 'No streams from modules — try another module in Settings → Modules'
          )
        } catch (e) {
          setStreamCandidates([])
          setStreamStatus(
            `Streams unavailable: ${e instanceof Error ? e.message : String(e)}`
          )
        } finally {
          setStreamsSearching(false)
        }
      })()
    },
    [media]
  )

  useEffect(() => {
    if (!media || !episodes.length) return

    function handleAction(action: NativePlayerAction) {
      if (action.anilistId !== media!.id) return
      if (action.action === 'nextEpisode') {
        const nextNum = action.episode + 1
        const next = episodes.find((e) => e.number === nextNum && !e.unreleased)
        if (next) void searchSources(next)
        return
      }
      if (action.action === 'changeSource') {
        const current = episodes.find((e) => e.number === action.episode && !e.unreleased)
        if (current) void searchSources(current)
      }
    }

    const pending = consumePendingPlayerAction()
    if (pending) handleAction(pending)

    return onPlayerAction(handleAction)
  }, [media, episodes, searchSources])

  async function openTrailer() {
    if (!media) return
    const url = trailerWatchUrl(media.trailer)
    if (!url) return
    try {
      await getNative().openURL(url)
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  async function enqueueStreamCandidate(candidate: StreamCandidate, episode: EpisodeItem) {
    if (!media) return
    const native = getNative()
    if (!native.isApp || !native.enqueueDownload) {
      toast.error('Downloads require the iOS app')
      return
    }
    const url = candidate.url?.trim()
    if (!url) throw new Error('Stream candidate has no url')
    await native.enqueueDownload({
      source: url,
      kind: candidate.kind === 'hls' ? 'hls' : 'http',
      headers: candidate.headers,
      mediaId: media.id,
      episode: episode.number,
      seriesTitle: displayTitle(media),
      episodeTitle: episode.title,
      poster: media.coverImage?.large ?? media.coverImage?.medium ?? undefined,
      resolution: candidate.quality,
      sourceLabel: candidate.title || candidate.quality || candidate.moduleId,
      seasonLabel: seasonFolderLabel(media),
      isIncognito: isIncognitoMode()
    })
  }

  async function queueEpisodes(targets: EpisodeItem[]) {
    if (!media || !targets.length) return
    const native = getNative()
    if (!native.isApp || !native.enqueueDownload) {
      toast.error('Downloads require the iOS app with modules')
      return
    }
    setDownloadBusy(true)
    const quality = getDownloadSettings().preferredQuality
    const query =
      media.title.romaji || media.title.english || displayTitle(media)
    const pending = targets.filter((ep) => !downloadedEps.has(ep.number))
    if (!pending.length) {
      toast.message('Selected episodes are already saved')
      setDownloadBusy(false)
      return
    }

    let ok = 0
    let failed = 0
    const total = pending.length

    try {
      if (native.resolveStreamsBatch) {
        toast.message(`Finding streams for ${total} episode${total === 1 ? '' : 's'}…`)
        const batch = await native.resolveStreamsBatch({
          title: displayTitle(media),
          anilistId: media.id,
          episodes: pending.map((ep) => ep.number),
          idMal: media.idMal ?? null,
          query
        })
        const byEp = new Map(batch.map((row) => [row.episode, row.candidates]))
        for (const ep of pending) {
          const candidates = byEp.get(ep.number) ?? []
          const pick = pickStreamForQuality(candidates, quality)
          if (!pick) {
            failed += 1
            continue
          }
          try {
            await enqueueStreamCandidate(pick, ep)
            ok += 1
            toast.message(`Queued ${ok}/${total}…`)
          } catch {
            failed += 1
          }
        }
      } else if (native.resolveStreams) {
        for (const ep of pending) {
          try {
            const candidates =
              (await native.resolveStreams({
                title: displayTitle(media),
                anilistId: media.id,
                episode: ep.number,
                idMal: media.idMal ?? null,
                query,
                fast: true
              })) ?? []
            const pick = pickStreamForQuality(candidates, quality)
            if (!pick) {
              failed += 1
              continue
            }
            await enqueueStreamCandidate(pick, ep)
            ok += 1
            toast.message(`Queued ${ok}/${total}…`)
          } catch {
            failed += 1
          }
        }
      } else {
        toast.error('Downloads require stream modules')
        return
      }

      if (ok) toast.success(`Queued ${ok} episode${ok === 1 ? '' : 's'}`)
      if (failed) toast.error(`${failed} episode${failed === 1 ? '' : 's'} had no stream`)
      setDownloadOpen(false)
      setSelectingEps(false)
      setSelectedEps(new Set())
    } finally {
      setDownloadBusy(false)
    }
  }

  /** Shared skipTimes / continue / activePlayback / player options for CDN Watch. */
  async function buildPlayStreamOptions(opts: {
    url: string
    headers?: Record<string, string>
    resolution?: string
    sourceLabel?: string
  }): Promise<PlayStreamOptions> {
    if (!media || !selected) {
      throw new Error('No episode selected')
    }
    const watch = getWatchSettings()
    const totalEpisodes = media.episodes ?? null
    const hasNextEpisode =
      typeof totalEpisodes === 'number' &&
      totalEpisodes > 0 &&
      selected.number < totalEpisodes

    let skipTimes = undefined as PlayStreamOptions['skipTimes']
    if (media.idMal) {
      // episodeLength=0 → AniSkip returns all matches (avoid missing OP/ED when probed duration is off)
      skipTimes =
        (await fetchSkipTimes(media.idMal, selected.number, 0)) ?? undefined
    }

    recordContinueWatching(media, selected.number)
    setActivePlayback({
      anilistId: media.id,
      episode: selected.number,
      idMal: media.idMal ?? null,
      totalEpisodes
    })

    return {
      url: opts.url,
      headers: opts.headers,
      playerHint: 'avplayer',
      title: `${displayTitle(media)} · Ep ${selected.number}`,
      episode: selected.number,
      anilistId: media.id,
      idMal: media.idMal ?? null,
      resolution: opts.resolution,
      sourceLabel: opts.sourceLabel,
      totalEpisodes,
      hasNextEpisode,
      autoSkipOpEd: watch.autoSkipOpEd,
      gestureSeekEnabled: watch.gestureSeekEnabled,
      doubleTapSeekSec: watch.doubleTapSeekSec,
      tripleTapSeekSec: watch.tripleTapSeekSec,
      autoplayNext: watch.autoplayNext,
      skipTimes
    }
  }

  async function playWithOptions(
    startLabel: string,
    opts: {
      url: string
      headers?: Record<string, string>
      resolution?: string
      sourceLabel?: string
    }
  ): Promise<boolean> {
    if (!media || !selected) return false
    setPlaying(true)
    setStreamStatus(`Starting: ${startLabel}`)
    try {
      const native = getNative()
      if (!native.isApp || !native.playStream) {
        throw new Error('CDN Watch requires the iOS app')
      }
      const playOpts = await buildPlayStreamOptions(opts)
      setStreamStatus('Opening player…')
      await native.playStream(playOpts)
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStreamStatus(msg)
      toast.error(msg)
      return false
    } finally {
      setPlaying(false)
    }
  }

  async function playStreamCandidate(candidate: StreamCandidate) {
    const label =
      candidate.title ||
      candidate.quality ||
      moduleNames[candidate.moduleId] ||
      candidate.moduleId
    const ok = await playWithOptions(label, {
      url: candidate.url,
      headers: candidate.headers,
      resolution: candidate.quality,
      sourceLabel:
        moduleNames[candidate.moduleId] || candidate.title || candidate.moduleId
    })
    if (!ok || !media) return
    // Product Watch uses resolveStreams → playStream (not resolveAndPlay),
    // so persist lastGoodModule / lastSuccessAt here.
    try {
      await getNative().recordModuleSuccess?.({
        moduleId: candidate.moduleId,
        anilistId: media.id
      })
    } catch {
      // Non-fatal: playback already started.
    }
  }

  if (loading) {
    return (
      <div className="-mx-4 space-y-6 sm:-mx-5">
        <Skeleton className="h-[280px] w-full rounded-none bg-white/5 sm:h-[320px]" />
        <div className="flex gap-5 px-4 sm:px-5">
          <Skeleton className="h-48 w-[7.75rem] shrink-0 rounded-xl bg-white/8" />
          <div className="flex-1 space-y-3 pt-8">
            <Skeleton className="h-3 w-24 bg-white/8" />
            <Skeleton className="h-8 w-3/4 bg-white/10" />
            <Skeleton className="h-5 w-1/2 bg-white/8" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-3 pt-[calc(3.5rem+var(--safe-top))]">
        <p className="text-sm text-destructive">{error}</p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="text-sm font-medium text-primary"
            onClick={() => setMediaReloadToken((n) => n + 1)}
          >
            Try again
          </button>
          <Link href="/" className="text-sm">
            ← Home
          </Link>
        </div>
      </div>
    )
  }
  if (!media) return null

  const trailerUrl = trailerWatchUrl(media.trailer)

  return (
    <div className="space-y-9">
      <AnimeHeader
        title={displayTitle(media)}
        cover={media.coverImage?.large}
        banner={media.bannerImage}
        description={stripHtml(media.description)}
        score={media.averageScore ?? media.meanScore}
        format={media.format}
        episodes={media.episodes}
        duration={media.duration}
        genres={media.genres}
        status={media.status}
        season={typeof media.season === 'string' ? media.season : null}
        seasonYear={media.seasonYear}
        source={formatSource(media.source)}
        studio={mainStudioName(media)}
        onTrailer={trailerUrl ? () => void openTrailer() : null}
        onEditList={listConnected && !incognito ? () => setListSheetOpen(true) : null}
        listStatusLabel={
          incognito
            ? null
            : listEntry
              ? LIST_STATUS_LABELS[listEntry.status] || listEntry.status
              : null
        }
        continueEpisode={continueEpisode?.number ?? null}
        onContinueWatching={
          continueEpisode
            ? () => void searchSources(continueEpisode)
            : null
        }
      />

      <Tabs
        value={detailTab}
        onValueChange={(next) => {
          const tab = next === 'franchise' ? 'franchise' : 'overview'
          setDetailTab(tab)
          if (id) setAnimeSession(id, { tab })
        }}
        className="gap-6"
      >
        <TabsList variant="line" className="w-full max-w-md">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="franchise">Relations</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-9">
          <section className="space-y-4">
            <div className="flex items-end justify-between gap-2">
              <div>
                <h2 className="text-section">
                  Episodes
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tap an episode to hunt sources, or download for offline
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg px-2.5 py-1.5 text-[0.7rem] font-medium text-muted-foreground ring-1 ring-white/10 active:bg-white/[0.04]"
                  onClick={() => {
                    setSelectingEps((v) => !v)
                    setSelectedEps(new Set())
                  }}
                >
                  {selectingEps ? 'Cancel' : 'Select'}
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-primary px-2.5 py-1.5 text-[0.7rem] font-medium text-primary-foreground"
                  onClick={() => setDownloadOpen(true)}
                >
                  Download
                </button>
              </div>
            </div>
            <EpisodeList>
              {episodes.map((ep) => (
                <li key={ep.number}>
                  <EpisodeRow
                    episode={ep}
                    downloaded={downloadedEps.has(ep.number)}
                    selecting={selectingEps}
                    selected={selectedEps.has(ep.number)}
                    onSelect={() => {
                      if (selectingEps) {
                        if (ep.unreleased) return
                        setSelectedEps((prev) => {
                          const next = new Set(prev)
                          if (next.has(ep.number)) next.delete(ep.number)
                          else next.add(ep.number)
                          return next
                        })
                        return
                      }
                      if (downloadedEps.has(ep.number) && !ep.unreleased) {
                        const libId = downloadedByEp.get(ep.number)
                        const native = getNative()
                        if (libId && native.playLibraryItem) {
                          void native.playLibraryItem(libId).catch((e) =>
                            toast.error(e instanceof Error ? e.message : String(e))
                          )
                          return
                        }
                      }
                      void searchSources(ep)
                    }}
                  />
                </li>
              ))}
            </EpisodeList>
          </section>

          <ThemeTracks
            tracks={themes}
            loading={themesLoading}
            notice={themesNotice}
            onRetry={() => setThemesReload((n) => n + 1)}
          />

          {sourceMaterials.length > 0 ? (
            <PosterRail title="Source material" dense>
              {sourceMaterials.map(({ media: m, relationType }) => {
                const kind = (m as { type?: string | null }).type
                const isMangaLike =
                  kind === 'MANGA' || kind === 'NOVEL' || kind === 'ONE_SHOT'
                const href = isMangaLike
                  ? `/app/manga/?id=${m.id}&from=${media.id}`
                  : `/app/anime/?id=${m.id}`
                return (
                  <PosterCard
                    key={m.id}
                    size="md"
                    href={href}
                    image={m.coverImage?.large ?? m.coverImage?.medium}
                    title={displayTitle(m)}
                    score={m.averageScore}
                    format={
                      [kind, relationType.replaceAll('_', ' ')].filter(Boolean).join(' · ') ||
                      m.format
                    }
                    year={m.seasonYear}
                  />
                )
              })}
            </PosterRail>
          ) : null}

          <PersonRail
            title="Characters"
            subtitle="Tap for character details"
            people={characters}
          />
          <PersonRail
            title="Voice actors"
            subtitle="Japanese CVs when AniList has data"
            people={voiceActors}
          />
          <PersonRail title="Staff" subtitle="Key creatives" people={staff} />

          {recommendations.length > 0 ? (
            <PosterRail title="More like this" dense>
              {recommendations.map((m) => (
                <PosterCard
                  key={m.id}
                  size="md"
                  href={`/app/anime/?id=${m.id}`}
                  image={m.coverImage?.large ?? m.coverImage?.medium}
                  title={displayTitle(m)}
                  score={m.averageScore}
                  format={m.format}
                  year={m.seasonYear}
                />
              ))}
            </PosterRail>
          ) : null}
        </TabsContent>

        <TabsContent value="franchise" className="space-y-7">
          <div>
            <h2 className="text-section">
              Relations
            </h2>
            <p className="text-meta mt-0.5">
              Watch order from AniList prequel/sequel links — same graph as before, cards only
            </p>
          </div>
          {franchiseLoading && related.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading related titles…</p>
          ) : null}
          {franchiseLoading && related.length > 0 ? (
            <p className="text-xs text-muted-foreground">Expanding franchise…</p>
          ) : null}
          {!franchiseLoading && related.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No franchise links on AniList for this title.
            </p>
          ) : null}
          {related.length > 0 ? (
            <PosterRail title="Watch order" dense>
              {related.map(({ id: rid, relationType, media: m, isCurrent }, index) => (
                <PosterCard
                  key={rid}
                  size="md"
                  href={`/app/anime/?id=${rid}`}
                  image={m.coverImage?.large ?? m.coverImage?.medium}
                  title={`${index + 1}. ${displayTitle(m)}`}
                  score={m.averageScore}
                  format={
                    isCurrent
                      ? 'This title'
                      : relationType.replaceAll('_', ' ')
                  }
                  year={m.seasonYear}
                />
              ))}
            </PosterRail>
          ) : null}
        </TabsContent>
      </Tabs>

      <EpisodeSourcesSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open)
        }}
        episode={selected}
        malId={media.idMal}
        durationMin={media.duration}
        streamsSearching={streamsSearching}
        status={streamStatus}
        streamCandidates={streamCandidates}
        moduleNames={moduleNames}
        playing={playing}
        onPlayStream={(c) => void playStreamCandidate(c)}
        onSaveStream={(c) => {
          if (!selected) return
          void enqueueStreamCandidate(c, selected)
            .then(() => toast.success(`Queued episode ${selected.number}`))
            .catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
        }}
      />

      <DownloadPickerSheet
        open={downloadOpen}
        onOpenChange={setDownloadOpen}
        episodes={episodes}
        selectedNumbers={[...selectedEps]}
        preferredQuality={getDownloadSettings().preferredQuality}
        busy={downloadBusy}
        onConfirm={(eps) => void queueEpisodes(eps)}
      />

      <ListEditSheet
        open={listSheetOpen}
        onOpenChange={setListSheetOpen}
        mediaId={media.id}
        idMal={media.idMal}
        totalEpisodes={media.episodes}
        media={media}
        hint={listEntry}
        onSaved={(next) => {
          setListEntry(next)
          setListProgress(next?.progress ?? null)
          if (!next) {
            // Local continue rail is cleared in syncDeleteListEntry; mirror on-page CTA.
            void import('@/lib/watch/continue').then(({ removeContinueWatching }) => {
              removeContinueWatching(media.id)
            })
          }
        }}
      />
    </div>
  )
}

export default function AnimePage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
      }
    >
      <AnimeDetail />
    </Suspense>
  )
}
