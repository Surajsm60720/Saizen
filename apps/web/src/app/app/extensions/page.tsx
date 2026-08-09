'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  EXTENSION_CATALOGS,
  ensureExtensions,
  listExtensions,
  loadExtensionInstance,
  reloadAllExtensions,
  setExtensionEnabled,
  testExtension,
  type LoadedExtension
} from '@/lib/extensions'
import { ExtensionCard, PageHeader } from '@/components/saizen'
import { Button } from '@/components/ui/button'

export default function ExtensionsPage() {
  const [items, setItems] = useState<LoadedExtension[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

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

  const byCatalog = useMemo(() => {
    const map = new Map<string, LoadedExtension[]>()
    for (const cat of EXTENSION_CATALOGS) {
      map.set(
        cat.id,
        items.filter((i) => i.manifest.catalogId === cat.id)
      )
    }
    return map
  }, [items])

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

  return (
    <>
      <PageHeader
        title="Extensions"
        dense
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
        <p className="mb-3 whitespace-pre-wrap text-sm text-destructive">{error}</p>
      ) : null}
      {status ? (
        <p className="mb-3 rounded-lg border border-border/50 bg-muted/40 px-3 py-2 text-sm">
          {status}
        </p>
      ) : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading catalogs…</p> : null}

      {EXTENSION_CATALOGS.map((cat) => {
        const list = byCatalog.get(cat.id) ?? []
        return (
          <section key={cat.id} className="mt-6 space-y-2.5">
            <h2 className="text-base font-semibold">
              {cat.name}{' '}
              <span className="font-normal text-muted-foreground">({list.length})</span>
            </h2>
            {list.length === 0 ? (
              <p className="text-sm text-muted-foreground">No torrent extensions in this catalog.</p>
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
