'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader, SettingsGroup, SettingsRow } from '@/components/saizen'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ChevronDown } from 'lucide-react'
import getNative from '@/lib/native'
import { cn } from '@/lib/utils'
import {
  formatBytes,
  formatFolderLabel,
  formatJobProgress,
  jobSourceLabel,
  statusLabel
} from '@/lib/downloads/format'
import {
  getDownloadSettings,
  setDownloadSettings,
  type DownloadUiSettings
} from '@/lib/downloads/settings'
import { useDownloadActions, useDownloadStore } from '@/lib/downloads/store'
import {
  isIncognitoMode,
  subscribeIncognitoMode
} from '@/lib/privacy/incognito'
import {
  isAdultModeOn,
  subscribeAdultMode
} from '@/lib/privacy/adult'
import type { DownloadQuality, LibraryEntry } from '@saizen/shared'

const QUALITIES: DownloadQuality[] = ['2160p', '1080p', '720p', '480p']

export default function DownloadsPage() {
  const native = getNative()
  const { jobs, library, usage, folder } = useDownloadStore()
  const actions = useDownloadActions()
  const [settings, setSettings] = useState<DownloadUiSettings>(() => getDownloadSettings())
  const [busy, setBusy] = useState<string | null>(null)
  const [incognito, setIncognito] = useState(false)
  const [adultMode, setAdultMode] = useState(false)

  useEffect(() => {
    setIncognito(isIncognitoMode())
    return subscribeIncognitoMode(setIncognito)
  }, [])

  useEffect(() => {
    setAdultMode(isAdultModeOn())
    return subscribeAdultMode(setAdultMode)
  }, [])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void actions.refreshAll()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
    }
  }, [actions])

  function patch(next: Partial<DownloadUiSettings>) {
    setSettings(setDownloadSettings(next))
  }

  async function runAction(key: string, fn: () => Promise<void>) {
    if (busy) return
    setBusy(key)
    try {
      await fn()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, LibraryEntry[]>()
    for (const item of library) {
      if (item.isIncognito && !incognito) continue
      if (item.isAdult && !adultMode) continue
      const key = item.seriesTitle || `Media ${item.mediaId}`
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    return [...map.entries()]
  }, [library, incognito, adultMode])

  const active = jobs.filter((j) => {
    if (j.status === 'completed') return false
    if (j.isIncognito && !incognito) return false
    if (j.isAdult && !adultMode) return false
    return true
  })

  const visibleLibraryBytes = useMemo(() => {
    const hidden = library
      .filter(
        (item) =>
          (item.isIncognito && !incognito) || (item.isAdult && !adultMode)
      )
      .reduce((sum, item) => sum + (item.size || 0), 0)
    if (incognito && adultMode) return usage.libraryBytes
    return Math.max(0, usage.libraryBytes - hidden)
  }, [usage.libraryBytes, library, incognito, adultMode])

  const visibleEpisodeCount = useMemo(
    () =>
      library.filter(
        (item) =>
          !(item.isIncognito && !incognito) && !(item.isAdult && !adultMode)
      ).length,
    [library, incognito, adultMode]
  )

  return (
    <>
      <PageHeader
        title="Downloads"
        description={
          !adultMode
            ? 'Adult offline saves stay on disk but stay hidden while Adult Mode is off.'
            : incognito
              ? 'Incognito saves show here while Incognito is on.'
              : 'Save CDN streams from modules — watch offline later.'
        }
      />

      {!native.isApp ? (
        <p className="mb-5 rounded-xl border border-border/60 bg-muted/40 px-3.5 py-3 text-sm text-muted-foreground">
          Downloads run in the iOS app. Open Saizen on your phone to save episodes offline.
        </p>
      ) : null}

      <div className="space-y-7">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Library', value: formatBytes(visibleLibraryBytes) },
            { label: 'Cache', value: formatBytes(usage.cacheBytes) },
            { label: 'Free', value: formatBytes(usage.freeBytes) }
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border/60 bg-card px-3.5 py-3.5">
              <div className="text-xs text-muted-foreground">{stat.label}</div>
              <div className="mt-1.5 text-lg font-semibold tabular-nums">{stat.value}</div>
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
                    void runAction('folder', async () => {
                      await actions.pickDownloadFolder()
                      toast.success('Folder updated')
                    })
                  }}
                >
                  Change
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!native.isApp || busy === 'folder'}
                  onClick={() => {
                    void runAction('folder', async () => {
                      await actions.resetDownloadFolder()
                      toast.success('Folder reset')
                    })
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
            hint="Temporary stream data and abandoned partial HLS saves. Saved episodes stay."
            showSeparator
          >
            <Button
              size="sm"
              variant="secondary"
              disabled={!native.isApp || busy === 'cache'}
              onClick={() => {
                void runAction('cache', async () => {
                  await actions.clearCache()
                  toast.success('Cache cleared')
                })
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
              const jobBusy = busy === job.id
              return (
                <SettingsRow
                  key={job.id}
                  label={`${job.seriesTitle} · Ep ${job.episode}`}
                  hint={`${statusLabel(job.status)} · ${jobSourceLabel(job)} · ${formatJobProgress(job)}${
                    job.error ? ` · ${job.error}` : ''
                  }`}
                  showSeparator={i > 0}
                >
                  <div className="flex gap-1.5">
                    {job.status === 'paused' || job.status === 'failed' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={jobBusy || !!busy}
                        onClick={() => {
                          void runAction(job.id, () => actions.resumeDownload(job.id))
                        }}
                      >
                        Resume
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={jobBusy || !!busy}
                        onClick={() => {
                          void runAction(job.id, () => actions.pauseDownload(job.id))
                        }}
                      >
                        Pause
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={jobBusy || !!busy}
                      onClick={() => {
                        void runAction(job.id, () => actions.cancelDownload(job.id))
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
                busy={busy}
                onPlay={(id) => {
                  void getNative()
                    .playLibraryItem?.(id)
                    .catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
                }}
                onDelete={(ids) => {
                  void runAction(`delete:${ids.join(',')}`, () => actions.deleteLibraryItems(ids))
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
  busy,
  onPlay,
  onDelete
}: {
  title: string
  items: LibraryEntry[]
  busy: string | null
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
              {season.eps.map((item) => {
                const deleteKey = `delete:${item.id}`
                const deleting = busy === deleteKey
                return (
                  <SettingsRow
                    key={item.id}
                    label={item.episodeTitle?.trim() || `Episode ${item.episode}`}
                    hint={`${formatBytes(item.size)}${
                      item.resolution ? ` · ${item.resolution}` : ''
                    }${item.sourceLabel ? ` · ${item.sourceLabel}` : ''}`}
                    showSeparator
                  >
                    <div className="flex gap-1.5">
                      <Button size="sm" disabled={!!busy} onClick={() => onPlay(item.id)}>
                        Play
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!!busy}
                        onClick={() => onDelete([item.id])}
                      >
                        {deleting ? '…' : 'Delete'}
                      </Button>
                    </div>
                  </SettingsRow>
                )
              })}
            </div>
          ))
        : null}
      {open && items.length > 1 ? (
        <div className="flex justify-end border-t border-border/40 px-3.5 py-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={!!busy}
            onClick={() => onDelete(items.map((item) => item.id))}
          >
            Delete show
          </Button>
        </div>
      ) : null}
    </div>
  )
}
