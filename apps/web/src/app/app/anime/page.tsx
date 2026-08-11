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
import { ensureExtensions, searchExtensions, rankScore } from '@/lib/extensions'
import { searchAllProviders, type ProviderResult } from '@/lib/providers'
import getNative from '@/lib/native'
import type {
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
import {
  pickSourceForQuality,
  searchEpisodeSources,
  sourceUrl
} from '@/lib/downloads/resolve'
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
  const [selected, setSelected] = useState<EpisodeItem | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [streamsSearching, setStreamsSearching] = useState(false)
  const [torrentsSearching, setTorrentsSearching] = useState(false)
  const [results, setResults] = useState<ProviderResult[]>([])
  const [streamCandidates, setStreamCandidates] = useState<StreamCandidate[]>([])
  const [moduleNames, setModuleNames] = useState<Record<string, string>>({})
  const [playing, setPlaying] = useState(false)
  const [streamStatus, setStreamStatus] = useState('')
  const [torrentStatus, setTorrentStatus] = useState('')
  const status = useMemo(
    () => [streamStatus, torrentStatus].filter(Boolean).join(' · '),
    [streamStatus, torrentStatus]
  )
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
      setResults([])
      setStreamCandidates([])
      setModuleNames({})
      setStreamStatus('')
      setTorrentStatus('')
      setStreamsSearching(false)
      setTorrentsSearching(false)
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
        // Don't block detail on extension catalog warm-up
        void ensureExtensions()
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
  }, [id])

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
    let cancelled = false
    const native = getNative()
    const apply = (entries: Awaited<ReturnType<typeof native.library>>) => {
      if (cancelled) return
      const eps = new Set<number>()
      const byEp = new Map<number, string>()
      const showIncognito = isIncognitoMode()
      for (const e of entries) {
        if (e.isIncognito && !showIncognito) continue
        if (e.mediaId === id && (e.status === 'completed' || e.progress >= 1)) {
          eps.add(e.episode)
          byEp.set(e.episode, e.id)
        }
      }
      setDownloadedEps(eps)
      setDownloadedByEp(byEp)
    }
    void native.library().then(apply).catch(() => {})
    let unsub: (() => void) | undefined
    void (async () => {
      const ret = await native.onDownloadProgress?.(async () => {
        try {
          apply(await native.library())
        } catch {
          /* ignore */
        }
      })
      unsub = typeof ret === 'function' ? ret : await ret
    })()
    return () => {
      cancelled = true
      unsub?.()
    }
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
      setResults([])
      setStreamCandidates([])
      setStreamsSearching(true)
      setTorrentsSearching(true)
      setStreamStatus(`Searching streams for episode ${ep.number}…`)
      setTorrentStatus('Searching torrent sources…')

      const titles = [
        media.title.romaji,
        media.title.english,
        media.title.native,
        media.title.userPreferred
      ].filter(Boolean) as string[]

      const adult =
        Boolean(media.isAdult) ||
        (media.genres ?? []).some((g) => /hentai/i.test(g || ''))

      const native = getNative()
      const query =
        media.title.romaji || media.title.english || displayTitle(media)

      // Streams resolve independently — sheet updates as soon as modules respond.
      void (async () => {
        try {
          if (!native.isApp || !native.resolveStreams || !native.listModules) {
            setStreamCandidates([])
            setStreamStatus('')
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
              : 'No streams from modules'
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

      // Torrents / extensions — parallel, does not block Streams UI.
      void (async () => {
        try {
          const [extOut, builtInOut] = await Promise.all([
            searchExtensions({ media, episode: ep.number }),
            // Built-ins (SubsPlease/Erai/Nyaa) don't index adult — skip for speed.
            adult
              ? Promise.resolve({ results: [] as ProviderResult[], errors: [] })
              : searchAllProviders({
                  anilistId: media.id,
                  title: displayTitle(media),
                  titles,
                  episode: ep.number,
                  episodeCount: media.episodes
                })
          ])

          const merged = [...extOut.results, ...builtInOut.results]
          const sorted = [...merged].sort((a, b) => rankScore(b) - rankScore(a))
          setResults(sorted)
          const magnets = sorted.filter((r) => r.magnet).length
          const torrents = sorted.filter((r) => r.torrentUrl).length
          const http = sorted.filter((r) => r.httpUrl).length

          if (sorted.length) {
            setTorrentStatus(
              `${sorted.length} torrent source(s) · ${http} HTTP · ${torrents} torrent · ${magnets} magnet`
            )
          } else {
            const errs = [...extOut.errors, ...builtInOut.errors]
            const tls = errs.some((e) =>
              /TLS|SSL|-1200|secure connection/i.test(e.message)
            )
            if (adult && tls) {
              setTorrentStatus(
                'Adult index blocked on this network (TLS). Enable Nyaa Sukebei and retry, or use another network/VPN.'
              )
            } else if (adult && errs.length) {
              setTorrentStatus(
                `No adult torrent sources. ${errs[0]!.providerId}: ${errs[0]!.message}`
              )
            } else if (errs.length) {
              setTorrentStatus(
                `No torrent sources. ${errs[0]!.providerId}: ${errs[0]!.message}`
              )
            } else if (adult) {
              setTorrentStatus(
                'No torrent sources. Enable Nyaa Sukebei under Extensions → Hentai.'
              )
            } else {
              setTorrentStatus('')
            }
          }
        } catch (e) {
          setResults([])
          setTorrentStatus(e instanceof Error ? e.message : String(e))
        } finally {
          setTorrentsSearching(false)
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

  async function enqueueResult(result: ProviderResult, episode: EpisodeItem) {
    if (!media) return
    const native = getNative()
    if (!native.isApp || !native.enqueueDownload) {
      toast.error('Downloads require the iOS app')
      return
    }
    const source = sourceUrl(result)
    if (!source) throw new Error('Result has no torrentUrl, magnet, or httpUrl')
    await native.enqueueDownload({
      source,
      mediaId: media.id,
      episode: episode.number,
      seriesTitle: displayTitle(media),
      episodeTitle: episode.title,
      poster: media.coverImage?.large ?? media.coverImage?.medium ?? undefined,
      resolution: result.resolution,
      sourceLabel: result.title,
      seasonLabel: seasonFolderLabel(media),
      isIncognito: isIncognitoMode()
    })
  }

  async function queueEpisodes(targets: EpisodeItem[]) {
    if (!media || !targets.length) return
    const native = getNative()
    if (!native.isApp || !native.enqueueDownload) {
      toast.error('Downloads require the iOS app')
      return
    }
    setDownloadBusy(true)
    const quality = getDownloadSettings().preferredQuality
    let ok = 0
    let failed = 0
    try {
      for (const ep of targets) {
        if (downloadedEps.has(ep.number)) continue
        try {
          const results = await searchEpisodeSources(media, ep.number)
          const pick = pickSourceForQuality(results, quality)
          if (!pick) {
            failed += 1
            continue
          }
          await enqueueResult(pick, ep)
          ok += 1
        } catch {
          failed += 1
        }
      }
      if (ok) toast.success(`Queued ${ok} episode${ok === 1 ? '' : 's'}`)
      if (failed) toast.error(`${failed} episode${failed === 1 ? '' : 's'} had no source`)
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
      const probed = getProbedDurationSec(media.id, selected.number)
      const approxSec =
        probed ?? (media.duration != null && media.duration > 0 ? media.duration * 60 : 0)
      skipTimes =
        (await fetchSkipTimes(media.idMal, selected.number, approxSec)) ?? undefined
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
  ) {
    if (!media || !selected) return
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStreamStatus(msg)
      toast.error(msg)
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
    await playWithOptions(label, {
      url: candidate.url,
      headers: candidate.headers,
      resolution: candidate.quality,
      sourceLabel:
        moduleNames[candidate.moduleId] || candidate.title || candidate.moduleId
    })
  }

  async function playResult(result: ProviderResult) {
    // Watch is CDN-only — magnets/torrents cannot start progressive playback.
    if (!result.httpUrl) {
      toast.error('Watch is CDN-only. Use Save for torrent downloads.')
      return
    }
    await playWithOptions(result.title, {
      url: result.httpUrl,
      resolution: result.resolution,
      sourceLabel: result.title
    })
  }

  if (loading) {
    return (
      <div className="-mx-4 space-y-5 sm:-mx-5">
        <Skeleton className="h-[240px] w-full rounded-none bg-white/5 sm:h-[280px]" />
        <div className="flex gap-4 px-4 sm:px-5">
          <Skeleton className="h-44 w-[7.25rem] shrink-0 rounded-xl bg-white/8" />
          <div className="flex-1 space-y-2.5 pt-8">
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
        <Link href="/" className="text-sm">
          ← Home
        </Link>
      </div>
    )
  }
  if (!media) return null

  const trailerUrl = trailerWatchUrl(media.trailer)

  return (
    <div className="space-y-7">
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
        className="gap-5"
      >
        <TabsList variant="line" className="w-full max-w-md">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="franchise">Relations</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-7">
          <section className="space-y-3.5">
            <div className="flex items-end justify-between gap-2">
              <div>
                <h2 className="text-section">
                  Episodes
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
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
                const href =
                  kind === 'MANGA'
                    ? `https://anilist.co/manga/${m.id}`
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

        <TabsContent value="franchise" className="space-y-5">
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
        torrentsSearching={torrentsSearching}
        status={status}
        streamCandidates={streamCandidates}
        moduleNames={moduleNames}
        results={results}
        playing={playing}
        onPlayStream={(c) => void playStreamCandidate(c)}
        onPlay={(r) => void playResult(r)}
        onDownload={(r) => {
          if (!selected) return
          void enqueueResult(r, selected)
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
