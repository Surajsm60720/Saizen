'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, SlidersHorizontal, X } from 'lucide-react'
import type { ExtraModuleCatalog, InstalledModule, ModuleCatalogEntry } from '@saizen/shared'
import { PageHeader } from '@/components/saizen'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getNative } from '@/lib/native'
import { setShowNsfwModules, SHOW_NSFW_MODULES_KEY } from '@/lib/privacy/adult'

const selectClass =
  'h-11 w-full appearance-none rounded-lg border border-white/10 bg-[#1c1c1e] bg-[length:1rem] bg-[right_0.65rem_center] bg-no-repeat px-3 pr-9 text-base text-foreground outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/25'

const selectChevron = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239a9a9a' stroke-width='2'%3E%3Cpath d='m7 15 5 5 5-5'/%3E%3Cpath d='m7 9 5-5 5 5'/%3E%3C/svg%3E\")"
} as const

const SHOW_NSFW_KEY = SHOW_NSFW_MODULES_KEY

function isNsfwEntry(entry: { nsfw?: boolean | null }): boolean {
  return entry.nsfw === true
}

/** Capacitor / bridge quirks must never leave us with a non-array (renders crash). */
function asModuleList(value: unknown): InstalledModule[] {
  return Array.isArray(value) ? (value as InstalledModule[]) : []
}

function asCatalogList(value: unknown): ModuleCatalogEntry[] {
  return Array.isArray(value) ? (value as ModuleCatalogEntry[]) : []
}

export default function ModulesPage() {
  const [installed, setInstalled] = useState<InstalledModule[]>([])
  const [catalog, setCatalog] = useState<ModuleCatalogEntry[]>([])
  const [extraCatalogs, setExtraCatalogs] = useState<ExtraModuleCatalog[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [testQuery, setTestQuery] = useState('Overflow')
  const [tab, setTab] = useState<'installed' | 'browse'>('installed')
  const [enabledOnly, setEnabledOnly] = useState(false)
  const [showNsfw, setShowNsfw] = useState(false)
  const [streamTypeFilter, setStreamTypeFilter] = useState('all')
  const [qualityFilter, setQualityFilter] = useState('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [catalogUrlOpen, setCatalogUrlOpen] = useState(true)
  const [customUrl, setCustomUrl] = useState('')
  const [customName, setCustomName] = useState('')
  const [extraCatalogUrl, setExtraCatalogUrl] = useState('')

  const native = getNative()
  const isApp = native.isApp

  useEffect(() => {
    try {
      setShowNsfw(localStorage.getItem(SHOW_NSFW_KEY) === '1')
    } catch {
      // ignore
    }
  }, [])

  function persistShowNsfw(next: boolean) {
    setShowNsfw(next)
    setShowNsfwModules(next)
    // Default Test title is SFW; switch to a known adult hit when enabling NSFW.
    if (next) {
      setTestQuery((q) => (q.trim().toLowerCase() === 'naruto' || !q.trim() ? 'Overflow' : q))
    }
  }

  const refreshInstalled = useCallback(async () => {
    if (!native.listModules) {
      setInstalled([])
      return
    }
    const list = await native.listModules()
    setInstalled(asModuleList(list))
  }, [native])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (native.listModules) {
        setInstalled(asModuleList(await native.listModules()))
      } else {
        setInstalled([])
      }
      if (native.listExtraModuleCatalogs) {
        try {
          const catalogs = await native.listExtraModuleCatalogs()
          setExtraCatalogs(Array.isArray(catalogs) ? catalogs : [])
        } catch {
          setExtraCatalogs([])
        }
      }
      if (native.browseModuleCatalog) {
        try {
          setCatalog(asCatalogList(await native.browseModuleCatalog()))
        } catch (e) {
          setCatalog([])
          setError(e instanceof Error ? e.message : String(e))
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [native])

  useEffect(() => {
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, [])

  const installedIds = useMemo(() => new Set(installed.map((m) => m.id)), [installed])

  const catalogVisible = useMemo(() => {
    return catalog.filter((e) => {
      if ((e.status ?? '').toLowerCase() !== 'active') return false
      if ((e.type ?? '').toLowerCase() !== 'anime') return false
      if (!e.scriptUrl.toLowerCase().startsWith('https://')) return false
      if (!showNsfw && isNsfwEntry(e)) return false
      return true
    })
  }, [catalog, showNsfw])

  const normalizedQuery = useMemo(() => search.trim().toLowerCase(), [search])

  const filteredInstalled = useMemo(() => {
    const base = installed.filter((m) => {
      if (enabledOnly && !m.enabled) return false
      if (!showNsfw && isNsfwEntry(m)) return false
      return true
    })
    if (!normalizedQuery) return base
    return base.filter((m) => {
      const hay = [m.name, m.id, m.baseUrl ?? ''].filter(Boolean).join(' · ').toLowerCase()
      return hay.includes(normalizedQuery)
    })
  }, [enabledOnly, installed, normalizedQuery, showNsfw])

  const filteredCatalog = useMemo(() => {
    const base = catalogVisible.filter((e) => {
      const streamOk =
        streamTypeFilter === 'all' ||
        (e.streamType ?? '').toLowerCase().includes(streamTypeFilter.toLowerCase())
      const qualityOk =
        qualityFilter === 'all' ||
        (e.quality ?? '').toLowerCase().includes(qualityFilter.toLowerCase())
      return streamOk && qualityOk
    })
    if (!normalizedQuery) return base
    return base.filter((e) => {
      let host = ''
      try {
        host = e.baseUrl ? new URL(e.baseUrl).host : ''
      } catch {
        host = e.baseUrl ?? ''
      }
      const hay = [e.sourceName, e.id, host].filter(Boolean).join(' · ').toLowerCase()
      return hay.includes(normalizedQuery)
    })
  }, [catalogVisible, normalizedQuery, qualityFilter, streamTypeFilter])

  const streamTypeOptions = useMemo(() => {
    const values = new Set<string>()
    for (const entry of catalogVisible) {
      const value = entry.streamType?.trim()
      if (value) values.add(value)
    }
    return [...values].sort((a, b) => a.localeCompare(b))
  }, [catalogVisible])

  const qualityOptions = useMemo(() => {
    const values = new Set<string>()
    for (const entry of catalogVisible) {
      const value = entry.quality?.trim()
      if (value) values.add(value)
    }
    return [...values].sort((a, b) => a.localeCompare(b))
  }, [catalogVisible])

  const filterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = []
    if (enabledOnly) {
      chips.push({
        key: 'enabled',
        label: 'Enabled only',
        clear: () => setEnabledOnly(false)
      })
    }
    if (showNsfw) {
      chips.push({
        key: 'nsfw',
        label: 'Show NSFW',
        clear: () => persistShowNsfw(false)
      })
    }
    if (streamTypeFilter !== 'all') {
      chips.push({
        key: 'stream',
        label: streamTypeFilter,
        clear: () => setStreamTypeFilter('all')
      })
    }
    if (qualityFilter !== 'all') {
      chips.push({
        key: 'quality',
        label: qualityFilter,
        clear: () => setQualityFilter('all')
      })
    }
    return chips
  }, [enabledOnly, qualityFilter, showNsfw, streamTypeFilter])

  function clearFilters() {
    setEnabledOnly(false)
    persistShowNsfw(false)
    setStreamTypeFilter('all')
    setQualityFilter('all')
  }

  async function quickAddFromCatalog() {
    if (!native.installModule) return
    if (filteredCatalog.length !== 1) return
    setTab('browse')
    await installEntry(filteredCatalog[0]!)
  }

  async function testModule(id: string, name: string) {
    if (!native.testModule) {
      setStatus('Module testing needs the iOS app')
      return
    }
    setBusyId(id)
    setError('')
    setStatus(`Testing ${name}…`)
    try {
      const result = await native.testModule({
        id,
        query: testQuery.trim() || undefined
      })
      setStatus(`${name}: ${result.message}`)
    } catch (e) {
      setStatus(`${name}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusyId(null)
    }
  }

  async function toggle(id: string, enabled: boolean) {
    if (!native.setModuleEnabled) return
    setBusyId(id)
    setStatus('')
    try {
      await native.setModuleEnabled(id, enabled)
      await refreshInstalled()
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  async function remove(id: string) {
    if (!native.removeModule) return
    setBusyId(id)
    setStatus('')
    try {
      setInstalled(asModuleList(await native.removeModule(id)))
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  async function move(id: string, dir: -1 | 1) {
    if (!native.reorderModules) return
    const ids = installed.map((m) => m.id)
    const idx = ids.indexOf(id)
    const swap = idx + dir
    if (idx < 0 || swap < 0 || swap >= ids.length) return
    ;[ids[idx], ids[swap]] = [ids[swap], ids[idx]]
    setBusyId(id)
    try {
      setInstalled(asModuleList(await native.reorderModules(ids)))
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  async function installEntry(entry: ModuleCatalogEntry) {
    if (!native.installModule) return
    setBusyId(entry.id)
    setStatus(`Installing ${entry.sourceName}…`)
    setError('')
    try {
      if (isNsfwEntry(entry) && !showNsfw) persistShowNsfw(true)
      const list = await native.installModule({
        id: entry.id,
        scriptUrl: entry.scriptUrl,
        sourceName: entry.sourceName,
        baseUrl: entry.baseUrl ?? undefined,
        streamType: entry.streamType ?? undefined,
        status: entry.status ?? undefined,
        type: entry.type ?? undefined,
        quality: entry.quality ?? undefined,
        nsfw: isNsfwEntry(entry) || undefined
      })
      setInstalled(asModuleList(list))
      setTab('installed')
      setStatus(`Installed ${entry.sourceName}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      // Keep prior list visible — a bad bridge payload used to blank the pane.
      try {
        await refreshInstalled()
      } catch {
        /* ignore */
      }
    } finally {
      setBusyId(null)
    }
  }

  const enabledNsfwCount = useMemo(
    () => installed.filter((m) => m.enabled && isNsfwEntry(m)).length,
    [installed]
  )

  const brokenCatalogInstalls = useMemo(
    () =>
      installed.filter((m) => {
        const url = (m.scriptUrl || '').toLowerCase()
        return url.endsWith('.json') || url.includes('/index.json') || /\/index\.json(\?|$)/.test(url)
      }),
    [installed]
  )

  function looksLikeCatalogUrl(url: string): boolean {
    const lower = url.toLowerCase()
    return lower.endsWith('.json') || lower.includes('/index.json')
  }

  async function installCatalogEntries(entries: ModuleCatalogEntry[]) {
    if (!native.installModule) return
    const targets = entries.filter(
      (e) =>
        (e.status ?? '').toLowerCase() === 'active' &&
        (e.type ?? '').toLowerCase() === 'anime' &&
        e.scriptUrl.toLowerCase().startsWith('https://')
    )
    if (!targets.length) {
      setStatus('Catalog added — open Browse to install modules')
      return
    }
    let lastList = installed
    const failed: string[] = []
    for (const entry of targets) {
      setStatus(`Installing ${entry.sourceName}…`)
      try {
        if (isNsfwEntry(entry) && !showNsfw) persistShowNsfw(true)
        lastList = asModuleList(
          await native.installModule({
            id: entry.id,
            scriptUrl: entry.scriptUrl,
            sourceName: entry.sourceName,
            baseUrl: entry.baseUrl ?? undefined,
            streamType: entry.streamType ?? undefined,
            status: entry.status ?? undefined,
            type: entry.type ?? undefined,
            quality: entry.quality ?? undefined,
            nsfw: isNsfwEntry(entry) || undefined
          })
        )
      } catch (e) {
        failed.push(
          `${entry.sourceName}: ${e instanceof Error ? e.message : String(e)}`
        )
      }
    }
    setInstalled(lastList)
    setTab('installed')
    if (failed.length) {
      setError(failed.join('\n'))
      setStatus(`Installed with ${failed.length} error(s)`)
    } else {
      setStatus(
        `Installed ${targets.map((t) => t.sourceName).join(', ')}. Enable them, then Watch an adult title.`
      )
    }
  }

  async function installCustom() {
    if (!native.installModuleFromUrl && !native.addExtraModuleCatalog) return
    const url = customUrl.trim()
    if (!url.toLowerCase().startsWith('https://')) {
      setError('URL must be https://')
      return
    }

    // Catalog index.json → Extra catalog (+ install entries), not a script module.
    if (looksLikeCatalogUrl(url)) {
      if (!native.addExtraModuleCatalog) {
        setError('Extra catalogs require the iOS app')
        return
      }
      setBusyId('custom')
      setError('')
      setStatus('Adding catalog…')
      try {
        if (!showNsfw) persistShowNsfw(true)
        setExtraCatalogs(await native.addExtraModuleCatalog(url))
        setCustomUrl('')
        setCustomName('')
        let entries: ModuleCatalogEntry[] = []
        if (native.browseModuleCatalog) {
          entries = asCatalogList(await native.browseModuleCatalog())
          setCatalog(entries)
        }
        const nsfwEntries = entries.filter(isNsfwEntry)
        await installCatalogEntries(nsfwEntries)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusyId(null)
      }
      return
    }

    if (!native.installModuleFromUrl) return
    setBusyId('custom')
    setError('')
    setStatus('Installing custom module…')
    try {
      setInstalled(
        asModuleList(
          await native.installModuleFromUrl({
            url,
            name: customName.trim() || undefined,
            nsfw: showNsfw || undefined
          })
        )
      )
      setCustomUrl('')
      setCustomName('')
      setAddOpen(false)
      setTab('installed')
      setStatus('Installed custom module')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      try {
        await refreshInstalled()
      } catch {
        /* ignore */
      }
    } finally {
      setBusyId(null)
    }
  }


  async function addExtraCatalog() {
    if (!native.addExtraModuleCatalog) return
    const url = extraCatalogUrl.trim()
    if (!url.toLowerCase().startsWith('https://')) {
      setError('Catalog URL must be https://')
      return
    }
    setBusyId('extra-catalog')
    setError('')
    setStatus('Adding catalog…')
    try {
      if (!showNsfw) persistShowNsfw(true)
      setExtraCatalogs(await native.addExtraModuleCatalog(url))
      setExtraCatalogUrl('')
      let entries: ModuleCatalogEntry[] = []
      if (native.browseModuleCatalog) {
        entries = asCatalogList(await native.browseModuleCatalog())
        setCatalog(entries)
      }
      const nsfwEntries = entries.filter(isNsfwEntry)
      await installCatalogEntries(nsfwEntries)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  async function removeExtraCatalog(url: string) {
    if (!native.removeExtraModuleCatalog) return
    setBusyId(url)
    setError('')
    try {
      setExtraCatalogs(await native.removeExtraModuleCatalog(url))
      if (native.browseModuleCatalog) {
        setCatalog(asCatalogList(await native.browseModuleCatalog()))
      }
      setStatus('Catalog removed')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Modules"
        description="Install and test stream sources. HTTPS scripts only."
        action={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="relative mt-0.5 shrink-0 gap-1.5"
              onClick={() => setFiltersOpen(true)}
              aria-label="Open filters"
            >
              <SlidersHorizontal className="size-3.5" />
              Filters
              {filterChips.length > 0 ? (
                <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                  {filterChips.length}
                </span>
              ) : null}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="mt-0.5 min-h-8"
              onClick={() => void loadAll()}
              disabled={loading}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {!isApp ? (
        <p className="mb-3 text-sm text-muted-foreground">
          Install and test run in the iOS app.
        </p>
      ) : null}

      {error ? (
        <p className="mb-3 whitespace-pre-wrap text-sm text-destructive">{error}</p>
      ) : null}
      {status ? (
        <p className="mb-3 text-sm text-muted-foreground">{status}</p>
      ) : null}

      <div className="flex gap-2">
        <Input
          className="min-h-11"
          placeholder="Search by name or provider"
          value={search}
          enterKeyHint="search"
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            void quickAddFromCatalog()
          }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5">
        <Label htmlFor="show-nsfw-bar" className="text-sm">
          Show NSFW modules
        </Label>
        <Switch
          id="show-nsfw-bar"
          checked={showNsfw}
          onCheckedChange={persistShowNsfw}
        />
      </div>

      {showNsfw || enabledNsfwCount > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {enabledNsfwCount > 0
            ? `NSFW sources enabled (${enabledNsfwCount}). They only join Watch on adult titles.`
            : 'NSFW catalog rows are visible. Install and enable a source (e.g. Hstream), then open an adult title to Watch.'}
        </p>
      ) : null}

      {brokenCatalogInstalls.length > 0 ? (
        <p className="mt-2 text-xs text-destructive">
          {brokenCatalogInstalls.map((m) => m.name || m.id).join(', ')} looks like a catalog
          index, not a stream module. Remove it, paste the index.json under Extra catalog URL
          (or Add from URL), and install Hstream from Browse.
        </p>
      ) : null}

      {filterChips.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {filterChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.clear}
              className="outline-none"
              aria-label={`Remove filter ${chip.label}`}
            >
              <Badge
                variant="outline"
                className="gap-1 rounded-full border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] text-foreground"
              >
                {chip.label}
                <X className="size-3 opacity-70" />
              </Badge>
            </button>
          ))}
          <button
            type="button"
            className="px-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            onClick={clearFilters}
          >
            Clear
          </button>
        </div>
      ) : null}

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value === 'browse' ? 'browse' : 'installed')}
        className="mt-4"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="installed">
            Installed ({filteredInstalled.length})
          </TabsTrigger>
          <TabsTrigger value="browse">Browse ({filteredCatalog.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="installed" className="mt-5 space-y-3.5">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading modules…</p>
          ) : filteredInstalled.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {normalizedQuery || enabledOnly || (!showNsfw && installed.some(isNsfwEntry))
                ? 'No matching installed modules.'
                : 'Nothing installed yet. Switch to Browse to add a source.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {filteredInstalled.map((mod) => {
                const fullIndex = installed.findIndex((m) => m.id === mod.id)
                return (
                  <li
                    key={mod.id}
                    className="rounded-xl border border-border/60 bg-card px-3.5 py-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <div className="truncate text-sm font-semibold">{mod.name}</div>
                          {isNsfwEntry(mod) ? (
                            <Badge variant="outline" className="shrink-0 text-[10px]">
                              NSFW
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {mod.baseUrl || mod.id}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Switch
                          id={`mod-${mod.id}`}
                          checked={mod.enabled}
                          disabled={busyId === mod.id}
                          onCheckedChange={(enabled) => void toggle(mod.id, enabled)}
                        />
                        <Label htmlFor={`mod-${mod.id}`} className="text-xs text-muted-foreground">
                          On
                        </Label>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-9"
                        disabled={!isApp || busyId === mod.id}
                        onClick={() => void testModule(mod.id, mod.name)}
                      >
                        Test
                      </Button>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-9 p-0"
                          disabled={busyId === mod.id || fullIndex === 0}
                          aria-label="Move up"
                          onClick={() => void move(mod.id, -1)}
                        >
                          <ChevronUp className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-9 p-0"
                          disabled={busyId === mod.id || fullIndex === installed.length - 1}
                          aria-label="Move down"
                          onClick={() => void move(mod.id, 1)}
                        >
                          <ChevronDown className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-h-9 text-destructive"
                          disabled={busyId === mod.id}
                          onClick={() => void remove(mod.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="browse" className="mt-5 space-y-5">
          <div className="rounded-xl border border-border/50 px-3 py-2">
            <button
              type="button"
              className="flex w-full items-center justify-between py-1 text-sm font-medium"
              onClick={() => setCatalogUrlOpen((open) => !open)}
            >
              Extra catalog URL
              <ChevronDown
                className={`size-4 transition-transform ${catalogUrlOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {catalogUrlOpen ? (
              <div className="mt-2 flex flex-col gap-2 pb-1">
                <p className="text-xs text-muted-foreground">
                  Paste an HTTPS index.json (e.g. saizen-modules). Turns on Show NSFW and installs
                  listed sources like Hstream.
                </p>
                <Input
                  className="min-h-10"
                  placeholder="https://…/index.json"
                  value={extraCatalogUrl}
                  onChange={(e) => setExtraCatalogUrl(e.target.value)}
                />
                <Button
                  className="min-h-10"
                  disabled={!isApp || busyId === 'extra-catalog' || !extraCatalogUrl.trim()}
                  onClick={() => void addExtraCatalog()}
                >
                  Add catalog & install
                </Button>
                {extraCatalogs.length > 0 ? (
                  <ul className="space-y-1.5 pt-1">
                    {extraCatalogs.map((c) => (
                      <li
                        key={c.url}
                        className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
                      >
                        <span className="min-w-0 truncate">{c.url}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 text-destructive"
                          disabled={busyId === c.url}
                          onClick={() => void removeExtraCatalog(c.url)}
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-border/50 px-3 py-2">
            <button
              type="button"
              className="flex w-full items-center justify-between py-1 text-sm font-medium"
              onClick={() => setAddOpen((open) => !open)}
            >
              Add from URL
              <ChevronDown className={`size-4 transition-transform ${addOpen ? 'rotate-180' : ''}`} />
            </button>
            {addOpen ? (
              <div className="mt-2 flex flex-col gap-2 pb-1">
                <Input
                  className="min-h-10"
                  placeholder="https://…/module.js or …/index.json"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                />
                <div className="flex gap-2">
                  <Input
                    className="min-h-10"
                    placeholder="Name (optional, scripts only)"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                  />
                  <Button
                    className="min-h-10 shrink-0"
                    disabled={!isApp || busyId === 'custom' || !customUrl.trim()}
                    onClick={() => void installCustom()}
                  >
                    Install
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  index.json is treated as a catalog (installs Hstream etc.). .js is a single
                  module script.
                </p>
              </div>
            ) : null}
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading catalog…</p>
          ) : filteredCatalog.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {normalizedQuery || streamTypeFilter !== 'all' || qualityFilter !== 'all'
                ? 'No matching catalog modules.'
                : isApp
                  ? 'No active anime modules in catalog.'
                  : 'Catalog loads in the iOS app.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {filteredCatalog.map((entry) => {
                const already = installedIds.has(entry.id)
                return (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{entry.sourceName}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {entry.streamType ? (
                          <Badge variant="outline">{entry.streamType}</Badge>
                        ) : null}
                        {entry.quality ? <Badge variant="outline">{entry.quality}</Badge> : null}
                        {isNsfwEntry(entry) ? (
                          <Badge variant="outline">NSFW</Badge>
                        ) : null}
                        {already ? <Badge variant="secondary">Installed</Badge> : null}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-9 shrink-0"
                      disabled={!isApp || busyId === entry.id}
                      onClick={() => void installEntry(entry)}
                    >
                      {already ? 'Reinstall' : 'Install'}
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="max-h-[80dvh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>
              Narrow installed sources and the catalog. Test uses the sample title below.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-[calc(1rem+var(--safe-bottom))]">
            <div className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5">
              <Label htmlFor="enabled-only" className="text-sm">
                Enabled only
              </Label>
              <Switch
                id="enabled-only"
                checked={enabledOnly}
                onCheckedChange={setEnabledOnly}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5">
              <Label htmlFor="show-nsfw" className="text-sm">
                Show NSFW modules
              </Label>
              <Switch
                id="show-nsfw"
                checked={showNsfw}
                onCheckedChange={persistShowNsfw}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stream-type" className="text-xs text-muted-foreground">
                Stream type
              </Label>
              <select
                id="stream-type"
                className={selectClass}
                style={selectChevron}
                value={streamTypeFilter}
                onChange={(e) => setStreamTypeFilter(e.target.value)}
              >
                <option value="all">Any</option>
                {streamTypeOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quality" className="text-xs text-muted-foreground">
                Quality
              </Label>
              <select
                id="quality"
                className={selectClass}
                style={selectChevron}
                value={qualityFilter}
                onChange={(e) => setQualityFilter(e.target.value)}
              >
                <option value="all">Any</option>
                {qualityOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="test-query" className="text-xs text-muted-foreground">
                Test title (Overflow for Hstream)
              </Label>
              <Input
                id="test-query"
                className="min-h-11"
                placeholder="Overflow"
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="min-h-11 flex-1" onClick={clearFilters}>
                Reset
              </Button>
              <Button className="min-h-11 flex-1" onClick={() => setFiltersOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
