'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  EXTENSION_CATALOGS,
  getExtensionCatalogName,
  ensureExtensions,
  listExtensions,
  loadExtensionInstance,
  listUserExtensionCatalogs,
  reloadAllExtensions,
  setExtensionEnabled,
  removeUserExtensionCatalog,
  upsertUserExtensionCatalog,
  testExtension,
  type LoadedExtension
} from '@/lib/extensions'
import { ExtensionCard, PageHeader } from '@/components/saizen'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

export default function ExtensionsPage() {
  const [items, setItems] = useState<LoadedExtension[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showAdult, setShowAdult] = useState(false)
  const [ratingFilter, setRatingFilter] = useState<'all' | 'safe' | 'adult'>('all')
  const [languageQuery, setLanguageQuery] = useState('')
  const [qualityQuery, setQualityQuery] = useState('')
  const [catalogFilter, setCatalogFilter] = useState('all')

  const [catalogUrl, setCatalogUrl] = useState('')
  const [catalogName, setCatalogName] = useState('')

  const applyList = useCallback((list: LoadedExtension[]) => {
    setItems([...list])
    const failed = list.filter((e) => e.enabled && e.loadError)
    const ok = list.filter((e) => e.enabled && !e.loadError && e.instance.single)
    setStatus(
      `Loaded ${ok.length} enabled · ${failed.length} failed · ${list.length} total in catalogs`
    )
    if (failed.length) {
      setError(failed.map((f) => `${f.manifest.id}: ${f.loadError}`).join('\n'))
    } else {
      setError('')
    }
  }, [])

  // Mount: reuse in-memory registry (don't nuke + re-fetch — that raced toggles).
  useEffect(() => {
    void (async () => {
      setLoading(true)
      setError('')
      try {
        applyList(await ensureExtensions())
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [applyList])

  const isAdultExtension = useCallback((ext: LoadedExtension): boolean => {
    const m = ext.manifest
    return m.catalogId === 'hentai' || m.media === 'hentai'
  }, [])

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    const lang = languageQuery.trim().toLowerCase()
    const qual = qualityQuery.trim().toLowerCase()

    return items.filter((ext) => {
      const isAdult = isAdultExtension(ext)
      if (!showAdult && isAdult) return false
      if (ratingFilter === 'safe' && isAdult) return false
      if (ratingFilter === 'adult' && !isAdult) return false
      if (catalogFilter !== 'all' && (ext.manifest.catalogId ?? 'unknown') !== catalogFilter) return false

      if (q) {
        const hay = [
          ext.manifest.name,
          ext.manifest.id,
          ext.manifest.catalogName,
          ...(ext.manifest.languages ?? [])
        ]
          .filter(Boolean)
          .join(' · ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }

      if (lang) {
        const langs = ext.manifest.languages ?? []
        if (!langs.some((l) => (l ?? '').toLowerCase().includes(lang))) return false
      }

      if (qual) {
        const accuracy = ext.manifest.accuracy ?? ''
        if (!accuracy.toLowerCase().includes(qual)) return false
      }

      return true
    })
  }, [catalogFilter, items, isAdultExtension, languageQuery, qualityQuery, ratingFilter, search, showAdult])

  const byCatalog = useMemo(() => {
    const map = new Map<string, LoadedExtension[]>()
    for (const ext of filteredItems) {
      const key = ext.manifest.catalogId ?? 'unknown'
      const list = map.get(key)
      if (list) list.push(ext)
      else map.set(key, [ext])
    }
    return map
  }, [filteredItems])

  const catalogIds = useMemo(() => {
    const ids = [...byCatalog.keys()]
    const baseOrder = new Map<string, number>(
      EXTENSION_CATALOGS.map((c, i) => [c.id, i])
    )
    ids.sort((a, b) => {
      const ai = baseOrder.get(a) ?? 1_000_000
      const bi = baseOrder.get(b) ?? 1_000_000
      if (ai !== bi) return ai - bi
      return getExtensionCatalogName(a).localeCompare(getExtensionCatalogName(b))
    })
    return ids
  }, [byCatalog])

  const availableLanguages = useMemo(() => {
    const set = new Set<string>()
    for (const ext of items) {
      for (const lang of ext.manifest.languages ?? []) {
        if (lang?.trim()) set.add(lang.trim())
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b)).slice(0, 12)
  }, [items])

  const visibleCount = filteredItems.length
  const totalCount = items.length

  async function toggle(id: string, enabled: boolean) {
    setBusyId(id)
    setStatus('')
    try {
      await setExtensionEnabled(id, enabled)
      setItems([...listExtensions()])
      setStatus(`${id} ${enabled ? 'enabled' : 'disabled'}`)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  async function runTest(ext: LoadedExtension) {
    setBusyId(ext.manifest.id)
    setStatus(`Testing ${ext.manifest.name}…`)
    try {
      if (typeof ext.instance.test !== 'function') {
        const instance = await loadExtensionInstance(ext.manifest)
        if (typeof instance.test !== 'function') {
          setStatus(`${ext.manifest.name}: no test() method`)
          return
        }
        await instance.test.call(instance)
        setStatus(`${ext.manifest.name}: OK`)
        return
      }
      const result = await testExtension(ext.manifest.id)
      setStatus(`${ext.manifest.name}: ${result.message}`)
    } catch (e) {
      setStatus(`${ext.manifest.name}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusyId(null)
    }
  }

  async function reload() {
    setLoading(true)
    setStatus('Refreshing catalogs…')
    try {
      applyList(await reloadAllExtensions())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function quickEnableFromSearch() {
    if (filteredItems.length !== 1) return
    const ext = filteredItems[0]!
    if (ext.enabled) return
    await toggle(ext.manifest.id, true)
  }

  return (
    <>
      <PageHeader
        title="Extensions"
        description={
          <>
            Hayase-compatible torrent catalogs from{' '}
            <a href="https://exten.pages.dev" target="_blank" rel="noreferrer">
              exten.pages.dev
            </a>
            . NZB catalogs are skipped.
          </>
        }
        action={
          <Button variant="outline" className="min-h-10" onClick={() => void reload()} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error ? (
        <p className="mb-4 whitespace-pre-wrap text-sm text-destructive">{error}</p>
      ) : null}
      {status ? (
        <p className="mb-4 rounded-lg border border-border/50 bg-muted/40 px-3.5 py-2.5 text-sm">
          {status}
        </p>
      ) : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading catalogs…</p> : null}

      <section className="mt-5 space-y-4">
        <h2 className="text-base font-semibold">Add catalog</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label className="text-xs text-muted-foreground">Catalog index JSON (HTTPS only)</Label>
            <Input
              className="min-h-10 mt-1"
              placeholder="https://…/index.json"
              value={catalogUrl}
              onChange={(e) => setCatalogUrl(e.target.value)}
            />
          </div>
          <div className="w-full sm:max-w-[14rem]">
            <Label className="text-xs text-muted-foreground">Label (optional)</Label>
            <Input
              className="min-h-10 mt-1"
              placeholder="e.g. Mangayomi-compatible"
              value={catalogName}
              onChange={(e) => setCatalogName(e.target.value)}
            />
          </div>
          <Button
            className="min-h-10"
            disabled={loading || !catalogUrl.trim()}
            onClick={async () => {
              setError('')
              setStatus('')
              try {
                upsertUserExtensionCatalog({ url: catalogUrl, name: catalogName || undefined })
                setCatalogUrl('')
                setCatalogName('')
                await reload()
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e))
              }
            }}
          >
            Add catalog
          </Button>
        </div>

        {listUserExtensionCatalogs().length ? (
          <ul className="space-y-2">
            {listUserExtensionCatalogs().map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{c.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{c.url}</div>
                </div>
                <Button
                  variant="outline"
                  className="min-h-9 shrink-0"
                  disabled={loading}
                  onClick={async () => {
                    setError('')
                    setStatus('')
                    try {
                      removeUserExtensionCatalog(c.id)
                      await reload()
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e))
                    }
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No custom catalogs yet. Paste a HTTPS index URL above to add one.</p>
        )}
      </section>

      <section className="mt-7 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Filters</span>
          <Badge variant="outline">
            {visibleCount} / {totalCount} shown
          </Badge>
          {ratingFilter !== 'all' ? (
            <Badge variant="secondary">rating: {ratingFilter}</Badge>
          ) : null}
          {catalogFilter !== 'all' ? (
            <Badge variant="secondary">catalog: {getExtensionCatalogName(catalogFilter)}</Badge>
          ) : null}
          {languageQuery ? <Badge variant="secondary">language: {languageQuery}</Badge> : null}
          {qualityQuery ? <Badge variant="secondary">quality: {qualityQuery}</Badge> : null}
          {(search || ratingFilter !== 'all' || catalogFilter !== 'all' || languageQuery || qualityQuery || showAdult) ? (
            <Button
              variant="outline"
              size="sm"
              className="min-h-8"
              onClick={() => {
                setSearch('')
                setRatingFilter('all')
                setCatalogFilter('all')
                setLanguageQuery('')
                setQualityQuery('')
                setShowAdult(false)
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <Input
            className="min-h-10 sm:max-w-[16rem]"
            placeholder="Search extensions by name, id, language…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              void quickEnableFromSearch()
            }}
          />

          <div className="flex items-center gap-2">
            <Switch
              id="adult-ext"
              checked={showAdult}
              onCheckedChange={setShowAdult}
            />
            <Label htmlFor="adult-ext" className="text-xs text-muted-foreground">
              Show NSFW/Adult (hentai)
            </Label>
          </div>

          <Input
            className="min-h-10 sm:max-w-[12rem]"
            placeholder="Language contains…"
            value={languageQuery}
            onChange={(e) => setLanguageQuery(e.target.value)}
          />

          <Input
            className="min-h-10 sm:max-w-[12rem]"
            placeholder="Quality contains…"
            value={qualityQuery}
            onChange={(e) => setQualityQuery(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={ratingFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              className="min-h-9"
              onClick={() => setRatingFilter('all')}
            >
              All ratings
            </Button>
            <Button
              variant={ratingFilter === 'safe' ? 'default' : 'outline'}
              size="sm"
              className="min-h-9"
              onClick={() => setRatingFilter('safe')}
            >
              Safe only
            </Button>
            <Button
              variant={ratingFilter === 'adult' ? 'default' : 'outline'}
              size="sm"
              className="min-h-9"
              onClick={() => {
                setShowAdult(true)
                setRatingFilter('adult')
              }}
            >
              Adult / NSFW only
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant={catalogFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              className="min-h-9"
              onClick={() => setCatalogFilter('all')}
            >
              All catalogs
            </Button>
            {[...EXTENSION_CATALOGS.map((c) => c.id), ...listUserExtensionCatalogs().map((c) => c.id)]
              .filter((value, index, arr) => arr.indexOf(value) === index)
              .map((catalogId) => (
                <Button
                  key={catalogId}
                  variant={catalogFilter === catalogId ? 'default' : 'outline'}
                  size="sm"
                  className="min-h-9"
                  onClick={() => setCatalogFilter(catalogId)}
                >
                  {getExtensionCatalogName(catalogId)}
                </Button>
              ))}
          </div>

          {availableLanguages.length ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant={!languageQuery ? 'default' : 'outline'}
                size="sm"
                className="min-h-9"
                onClick={() => setLanguageQuery('')}
              >
                All languages
              </Button>
              {availableLanguages.map((lang) => (
                <Button
                  key={lang}
                  variant={languageQuery.toLowerCase() === lang.toLowerCase() ? 'default' : 'outline'}
                  size="sm"
                  className="min-h-9"
                  onClick={() => setLanguageQuery(lang)}
                >
                  {lang}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {catalogIds.map((catalogId) => {
        const list = byCatalog.get(catalogId) ?? []
        const label = getExtensionCatalogName(catalogId)
        return (
          <section key={catalogId} className="mt-7 space-y-3">
            <h2 className="text-base font-semibold">
              {label}{' '}
              <span className="font-normal text-muted-foreground">({list.length})</span>
            </h2>
            {list.length === 0 ? (
              <p className="text-sm text-muted-foreground">No matching extensions in this catalog.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {list.map((ext) => (
                  <ExtensionCard
                    key={ext.manifest.id}
                    ext={ext}
                    busy={busyId === ext.manifest.id}
                    onToggle={(enabled) => void toggle(ext.manifest.id, enabled)}
                    onTest={() => void runTest(ext)}
                  />
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </>
  )
}
