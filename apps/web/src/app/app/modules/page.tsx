'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { InstalledModule, ModuleCatalogEntry } from '@saizen/shared'
import { PageHeader } from '@/components/saizen'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { getNative } from '@/lib/native'

export default function ModulesPage() {
  const [installed, setInstalled] = useState<InstalledModule[]>([])
  const [catalog, setCatalog] = useState<ModuleCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [customUrl, setCustomUrl] = useState('')
  const [customName, setCustomName] = useState('')

  const native = getNative()
  const isApp = native.isApp

  const refreshInstalled = useCallback(async () => {
    if (!native.listModules) {
      setInstalled([])
      return
    }
    const list = await native.listModules()
    setInstalled(list)
  }, [native])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      let installedCount = 0
      if (native.listModules) {
        const list = await native.listModules()
        setInstalled(list)
        installedCount = list.length
      } else {
        setInstalled([])
      }
      if (native.browseModuleCatalog) {
        try {
          const entries = await native.browseModuleCatalog()
          setCatalog(entries)
          setStatus(`Installed ${installedCount} · catalog ${entries.length}`)
        } catch (e) {
          setCatalog([])
          setStatus('Installed modules loaded · catalog unavailable')
          setError(e instanceof Error ? e.message : String(e))
        }
      } else {
        setStatus('Module bridge unavailable (web stub)')
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
    return catalog.filter(
      (e) =>
        (e.status ?? '').toLowerCase() === 'active' &&
        (e.type ?? '').toLowerCase() === 'anime' &&
        e.scriptUrl.toLowerCase().startsWith('https://')
    )
  }, [catalog])

  async function toggle(id: string, enabled: boolean) {
    if (!native.setModuleEnabled) return
    setBusyId(id)
    setStatus('')
    try {
      await native.setModuleEnabled(id, enabled)
      await refreshInstalled()
      setStatus(`${id} ${enabled ? 'enabled' : 'disabled'}`)
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
      const list = await native.removeModule(id)
      setInstalled(list)
      setStatus(`Removed ${id}`)
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
      const list = await native.reorderModules(ids)
      setInstalled(list)
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
      const list = await native.installModule({
        id: entry.id,
        scriptUrl: entry.scriptUrl,
        sourceName: entry.sourceName,
        baseUrl: entry.baseUrl ?? undefined,
        streamType: entry.streamType ?? undefined,
        status: entry.status ?? undefined,
        type: entry.type ?? undefined,
        quality: entry.quality ?? undefined
      })
      setInstalled(list)
      setStatus(`Installed ${entry.sourceName}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  async function installCustom() {
    if (!native.installModuleFromUrl) return
    const url = customUrl.trim()
    if (!url.toLowerCase().startsWith('https://')) {
      setError('scriptUrl must be https://')
      return
    }
    setBusyId('custom')
    setError('')
    setStatus('Installing custom module…')
    try {
      const list = await native.installModuleFromUrl({
        url,
        name: customName.trim() || undefined
      })
      setInstalled(list)
      setCustomUrl('')
      setCustomName('')
      setStatus('Installed custom module')
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
        dense
        description={
          <>
            CDN stream modules from{' '}
            <a href="https://library.cufiy.net" target="_blank" rel="noreferrer">
              library.cufiy.net
            </a>
            . Scripts are HTTPS-only and cached on device.
          </>
        }
        action={
          <Button
            variant="outline"
            className="min-h-10"
            onClick={() => void loadAll()}
            disabled={loading}
          >
            Refresh
          </Button>
        }
      />

      {!isApp ? (
        <p className="mb-3 text-sm text-muted-foreground">
          Module install runs in the iOS app. Open Saizen on device to manage modules.
        </p>
      ) : null}

      {error ? (
        <p className="mb-3 whitespace-pre-wrap text-sm text-destructive">{error}</p>
      ) : null}
      {status ? (
        <p className="mb-3 rounded-lg border border-border/50 bg-muted/40 px-3 py-2 text-sm">
          {status}
        </p>
      ) : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading modules…</p> : null}

      <section className="mt-6 space-y-2.5">
        <h2 className="text-base font-semibold">
          Installed{' '}
          <span className="font-normal text-muted-foreground">({installed.length})</span>
        </h2>
        {installed.length === 0 ? (
          <p className="text-sm text-muted-foreground">No modules installed yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {installed.map((mod, index) => (
              <li
                key={mod.id}
                className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{mod.name}</div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {mod.id}
                    {mod.baseUrl ? ` · ${mod.baseUrl}` : ''}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 self-end sm:self-center">
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-9"
                    disabled={busyId === mod.id || index === 0}
                    onClick={() => void move(mod.id, -1)}
                  >
                    Up
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-9"
                    disabled={busyId === mod.id || index === installed.length - 1}
                    onClick={() => void move(mod.id, 1)}
                  >
                    Down
                  </Button>
                  <div className="flex items-center gap-2">
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-9"
                    disabled={busyId === mod.id}
                    onClick={() => void remove(mod.id)}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 space-y-2.5">
        <h2 className="text-base font-semibold">Add from URL</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            className="min-h-10"
            placeholder="https://…/module.js"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
          />
          <Input
            className="min-h-10 sm:max-w-[12rem]"
            placeholder="Name"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
          />
          <Button
            className="min-h-10"
            disabled={!isApp || busyId === 'custom' || !customUrl.trim()}
            onClick={() => void installCustom()}
          >
            Install
          </Button>
        </div>
      </section>

      <section className="mt-8 space-y-2.5">
        <h2 className="text-base font-semibold">
          Catalog{' '}
          <span className="font-normal text-muted-foreground">({catalogVisible.length})</span>
        </h2>
        {catalogVisible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isApp ? 'No active anime modules in catalog.' : 'Catalog loads in the iOS app.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {catalogVisible.map((entry) => {
              const already = installedIds.has(entry.id)
              return (
                <li
                  key={entry.id}
                  className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{entry.sourceName}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {entry.id}
                      {entry.streamType ? ` · ${entry.streamType}` : ''}
                      {entry.quality ? ` · ${entry.quality}` : ''}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-9 self-end sm:self-center"
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
      </section>
    </>
  )
}
