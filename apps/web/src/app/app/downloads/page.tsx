'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader, SettingsGroup, SettingsRow } from '@/components/saizen'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ChevronDown } from 'lucide-react'
import getNative from '@/lib/native'
import { cn } from '@/lib/utils'
import {
  getDownloadSettings,
  setDownloadSettings,
  type DownloadUiSettings
} from '@/lib/downloads/settings'
import {
  isIncognitoMode,
  subscribeIncognitoMode
} from '@/lib/privacy/incognito'
import type { DownloadJob, DownloadQuality, LibraryEntry, StorageUsage } from '@saizen/shared'

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} B`
}

function formatFolderLabel(path: string): string {
  const trimmed = path.trim()
  if (!trimmed || trimmed === '—') return 'On This iPhone · Saizen Downloads'
  if (/\/Documents\/Saizen\/Downloads\/?$/i.test(trimmed) || /\/Saizen\/Downloads\/?$/i.test(trimmed)) {
    return 'On This iPhone · Saizen Downloads'
  }
  const parts = trimmed.split('/').filter(Boolean)
  const meaningful = parts.filter(
    (part) =>
      part !== 'private' &&
      part !== 'var' &&
      part !== 'mobile' &&
      part !== 'Containers' &&
      part !== 'Data' &&
      part !== 'Application' &&
      !/^[0-9A-Fa-f-]{36}$/.test(part)
  )
  const shown = (meaningful.length ? meaningful : parts).slice(-2)
  return shown.join(' / ') || 'On This iPhone · Saizen Downloads'
}

function jobKindLabel(job: DownloadJob): string {
  const kind = (job.kind || '').toLowerCase()
  if (kind === 'hls') return 'HLS'
  if (kind === 'http' || kind === 'mp4') return 'MP4'
  if (kind === 'torrent' || kind === 'magnet') return 'Legacy'
  return kind ? kind.toUpperCase() : 'CDN'
}

function statusLabel(status: DownloadJob['status']): string {
  switch (status) {
    case 'downloading':
      return 'Downloading'
    case 'paused':
      return 'Paused'
    case 'queued':
      return 'Queued'
    case 'failed':
      return 'Failed'
    case 'completed':
      return 'Done'
    default:
      return status
  }
}

const QUALITIES: DownloadQuality[] = ['2160p', '1080p', '720p', '480p']

export default function DownloadsPage() {
  const native = getNative()
  const [settings, setSettings] = useState<DownloadUiSettings>(() => getDownloadSettings())
  const [folder, setFolder] = useState('—')
  const [usage, setUsage] = useState<StorageUsage>({ libraryBytes: 0, cacheBytes: 0, freeBytes: 0 })
  const [jobs, setJobs] = useState<DownloadJob[]>([])
  const [library, setLibrary] = useState<LibraryEntry[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [incognito, setIncognito] = useState(false)
  const librarySig = useRef('')

  useEffect(() => {
    setIncognito(isIncognitoMode())
    return subscribeIncognitoMode(setIncognito)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [q, f, u, lib] = await Promise.all([
        native.downloadQueue?.() ?? Promise.resolve([]),
        native.downloadFolder?.() ?? Promise.resolve({ path: '' }),
        native.storageUsage?.() ?? Promise.resolve({ libraryBytes: 0, cacheBytes: 0, freeBytes: 0 }),
        native.library()
      ])
      setJobs(q)
      setFolder(f.path || 'On My iPhone / Saizen / Downloads')
      setUsage(u)
      setLibrary(lib)
      librarySig.current = lib.map((item) => item.id).sort().join('|')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }, [native])

  useEffect(() => {
    setSettings(getDownloadSettings())
    void refresh()
    let unsub: (() => void) | undefined
    let lastExtraRefresh = 0
    void (async () => {
      const ret = await native.onDownloadProgress?.(async (next, librarySnap) => {
        setJobs(next)
        const sig = next
          .filter((job) => job.status === 'completed')
          .map((job) => job.id)
          .sort()
          .join('|')
        const completedChanged = sig !== librarySig.current
        if (librarySnap) {
          setLibrary(librarySnap)
          librarySig.current = sig
        }
        const now = Date.now()
        if (!completedChanged && now - lastExtraRefresh < 8000) return
        if (completedChanged) librarySig.current = sig
        lastExtraRefresh = now
        try {
          const [lib, u] = await Promise.all([
            librarySnap ? Promise.resolve(librarySnap) : native.library(),
            native.storageUsage?.() ?? Promise.resolve(null)
          ])
          setLibrary(lib)
          if (u) setUsage(u)
        } catch {
          /* keep last snapshot */
        }
      })
      unsub = typeof ret === 'function' ? ret : await ret
    })()
    const onVis = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => {
      unsub?.()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
    }
  }, [native, refresh])

  function patch(next: Partial<DownloadUiSettings>) {
    setSettings(setDownloadSettings(next))
  }

  const grouped = useMemo(() => {
    const map = new Map<string, LibraryEntry[]>()
    for (const item of library) {
      if (item.isIncognito && !incognito) continue
      const key = item.seriesTitle || `Media ${item.mediaId}`
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    return [...map.entries()]
  }, [library, incognito])

  const active = jobs.filter((j) => {
    if (j.status === 'completed') return false
    if (j.isIncognito && !incognito) return false
    return true
  })

  const visibleLibraryBytes = useMemo(() => {
    if (incognito) return usage.libraryBytes
    const hidden = library
      .filter((item) => item.isIncognito)
      .reduce((sum, item) => sum + (item.size || 0), 0)
    return Math.max(0, usage.libraryBytes - hidden)
  }, [usage.libraryBytes, library, incognito])

  const visibleEpisodeCount = useMemo(
    () => library.filter((item) => !(item.isIncognito && !incognito)).length,
    [library, incognito]
  )

  return (
    <>
      <PageHeader
        title="Downloads"
        dense
        description={
          incognito
            ? 'Incognito saves show here while Incognito is on.'
            : 'Save CDN streams from modules — watch offline later.'
        }
      />

      {!native.isApp ? (
        <p className="mb-4 rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Downloads run in the iOS app. Open Saizen on your phone to save episodes offline.
        </p>
      ) : null}

      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Library', value: formatBytes(visibleLibraryBytes) },
            { label: 'Cache', value: formatBytes(usage.cacheBytes) },
            { label: 'Free', value: formatBytes(usage.freeBytes) }
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border/60 bg-card px-3 py-3">
              <div className="text-xs text-muted-foreground">{stat.label}</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{stat.value}</div>
            </div>
          ))}
        </div>

        <SettingsGroup
          title="Storage"
          description="HLS and MP4 saves continue while the phone is locked. Keep Saizen open or in the background."
        >
          <div className="px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">Download folder</div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!native.isApp || busy === 'folder'}
                  onClick={() => {
                    setBusy('folder')
                    void native
                      .pickDownloadFolder?.()
                      .then((r) => {
                        setFolder(r.path)
                        toast.success('Folder updated')
                      })
                      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
                      .finally(() => setBusy(null))
                  }}
                >
                  Change
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!native.isApp}
                  onClick={() => {
                    void native.resetDownloadFolder?.().then((r) => setFolder(r.path || folder))
                  }}
                >
                  Reset
                </Button>
              </div>
            </div>
            <p className="mt-1 text-xs leading-snug text-muted-foreground" title={folder}>
              {formatFolderLabel(folder)}
            </p>
          </div>
          <SettingsRow
            label="Clear cache"
            hint="Temporary stream data. Saved episodes stay."
            showSeparator
          >
            <Button
              size="sm"
              variant="secondary"
              disabled={!native.isApp || busy === 'cache'}
              onClick={() => {
                setBusy('cache')
                void native
                  .clearCache?.()
                  .then(() => {
                    toast.success('Cache cleared')
                    return refresh()
                  })
                  .finally(() => setBusy(null))
              }}
            >
              Clear
            </Button>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup
          title="Preferences"
          description="Used when you batch-download from a show."
        >
          <SettingsRow label="Wi‑Fi only" hint="Pause on cellular">
            <Switch
              checked={settings.wifiOnly}
              onCheckedChange={(v) => patch({ wifiOnly: v })}
              aria-label="Wi-Fi only downloads"
            />
          </SettingsRow>
          <SettingsRow label="Parallel downloads" hint="1–3 at once" showSeparator>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={1}
                max={3}
                step={1}
                value={settings.maxParallelDownloads}
                onChange={(e) => patch({ maxParallelDownloads: Number(e.target.value) })}
                className="w-24 accent-[var(--primary)]"
                aria-label="Max parallel downloads"
              />
              <span className="w-4 text-sm tabular-nums">{settings.maxParallelDownloads}</span>
            </div>
          </SettingsRow>
          <SettingsRow label="Preferred quality" hint="Closest CDN stream wins" showSeparator>
            <select
              value={settings.preferredQuality}
              onChange={(e) => patch({ preferredQuality: e.target.value as DownloadQuality })}
              className="h-11 rounded-lg border border-border/60 bg-background px-2.5 py-1 text-base"
              aria-label="Preferred download quality"
            >
              {QUALITIES.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup
          title="Queue"
          description={active.length ? `${active.length} in progress` : undefined}
        >
          {active.length === 0 ? (
            <div className="px-3.5 py-3 text-sm text-muted-foreground">
              Nothing downloading. Open a show → episode → Save, or use Download for a batch.
            </div>
          ) : (
            active.map((job, i) => {
              const pct = Math.round(Math.max(0, Math.min(1, job.progress)) * 100)
              const speed =
                job.speed > 0 && job.status === 'downloading'
                  ? ` · ${formatBytes(job.speed)}/s`
                  : ''
              return (
                <SettingsRow
                  key={job.id}
                  label={`${job.seriesTitle} · Ep ${job.episode}`}
                  hint={`${statusLabel(job.status)} · ${jobKindLabel(job)} · ${pct}% · ${formatBytes(job.downloaded)}${speed}`}
                  showSeparator={i > 0}
                >
                  <div className="flex gap-1.5">
                    {job.status === 'paused' || job.status === 'failed' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === job.id}
                        onClick={() => {
                          setBusy(job.id)
                          setJobs((prev) =>
                            prev.map((j) =>
                              j.id === job.id ? { ...j, status: 'downloading' } : j
                            )
                          )
                          void native
                            .resumeDownload?.(job.id)
                            .then(() => refresh())
                            .catch((e) =>
                              toast.error(e instanceof Error ? e.message : String(e))
                            )
                            .finally(() => setBusy(null))
                        }}
                      >
                        Resume
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === job.id}
                        onClick={() => {
                          setBusy(job.id)
                          setJobs((prev) =>
                            prev.map((j) =>
                              j.id === job.id ? { ...j, status: 'paused', speed: 0 } : j
                            )
                          )
                          void native
                            .pauseDownload?.(job.id)
                            .then(() => refresh())
                            .catch((e) =>
                              toast.error(e instanceof Error ? e.message : String(e))
                            )
                            .finally(() => setBusy(null))
                        }}
                      >
                        Pause
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === job.id}
                      onClick={() => {
                        setBusy(job.id)
                        setJobs((prev) => prev.filter((j) => j.id !== job.id))
                        void native
                          .cancelDownload?.(job.id)
                          .then(() => refresh())
                          .catch((e) =>
                            toast.error(e instanceof Error ? e.message : String(e))
                          )
                          .finally(() => setBusy(null))
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </SettingsRow>
              )
            })
          )}
        </SettingsGroup>

        <SettingsGroup
          title="Library"
          description={
            grouped.length
              ? `${visibleEpisodeCount} episode${visibleEpisodeCount === 1 ? '' : 's'} · ${formatBytes(visibleLibraryBytes)}`
              : 'Episodes saved on this device.'
          }
        >
          {grouped.length === 0 ? (
            <div className="px-3.5 py-3 text-sm text-muted-foreground">
              No downloads yet. Open a show, pick a stream, tap Save.
            </div>
          ) : (
            grouped.map(([title, items]) => (
              <LibraryShow
                key={title}
                title={title}
                items={items}
                onPlay={(id) => {
                  void native.playLibraryItem?.(id).catch((e) =>
                    toast.error(e instanceof Error ? e.message : String(e))
                  )
                }}
                onDelete={(ids) => {
                  const idSet = new Set(ids)
                  setLibrary((prev) =>
                    prev.filter((e) => !idSet.has(e.id) && !idSet.has(e.hash))
                  )
                  void native
                    .deleteTorrents(ids)
                    .then(() => refresh())
                    .catch((e) => {
                      toast.error(e instanceof Error ? e.message : String(e))
                      void refresh()
                    })
                }}
              />
            ))
          )}
        </SettingsGroup>
      </div>
    </>
  )
}

function LibraryShow({
  title,
  items,
  onPlay,
  onDelete
}: {
  title: string
  items: LibraryEntry[]
  onPlay: (id: string) => void
  onDelete: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(items.length <= 4)
  const poster = items.find((item) => item.poster)?.poster
  const total = items.reduce((sum, item) => sum + (item.size || 0), 0)
  const seasons = useMemo(() => {
    const map = new Map<string, LibraryEntry[]>()
    for (const item of items) {
      const key = item.seasonLabel?.trim() || 'Season 1'
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    return [...map.entries()].map(([label, eps]) => ({
      label,
      eps: eps.slice().sort((a, b) => a.episode - b.episode)
    }))
  }, [items])

  return (
    <div className="border-t border-border/50 first:border-t-0">
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          {poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={poster} alt="" className="size-10 shrink-0 rounded-md object-cover" />
          ) : (
            <div className="size-10 shrink-0 rounded-md bg-muted" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{title}</div>
            <div className="text-xs text-muted-foreground">
              {items.length} episode{items.length === 1 ? '' : 's'} · {formatBytes(total)}
            </div>
          </div>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180'
            )}
          />
        </button>
      </div>
      {open
        ? seasons.map((season) => (
            <div key={season.label}>
              {seasons.length > 1 ? (
                <div className="px-3.5 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {season.label}
                </div>
              ) : null}
              {season.eps.map((item) => (
                <SettingsRow
                  key={item.id}
                  label={item.episodeTitle?.trim() || `Episode ${item.episode}`}
                  hint={`${formatBytes(item.size)}${
                    item.resolution ? ` · ${item.resolution}` : ''
                  }`}
                  showSeparator
                >
                  <div className="flex gap-1.5">
                    <Button size="sm" onClick={() => onPlay(item.id)}>
                      Play
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDelete([item.id])}>
                      Delete
                    </Button>
                  </div>
                </SettingsRow>
              ))}
            </div>
          ))
        : null}
      {open && items.length > 1 ? (
        <div className="flex justify-end border-t border-border/40 px-3.5 py-2">
          <Button size="sm" variant="ghost" onClick={() => onDelete(items.map((item) => item.id))}>
            Delete show
          </Button>
        </div>
      ) : null}
    </div>
  )
}
