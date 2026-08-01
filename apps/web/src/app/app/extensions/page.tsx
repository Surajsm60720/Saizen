'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  EXTENSION_CATALOGS,
  listExtensions,
  loadExtensionInstance,
  reloadAllExtensions,
  setExtensionEnabled,
  testExtension,
  type LoadedExtension
} from '@/lib/extensions'
import styles from './page.module.css'

export default function ExtensionsPage() {
  const [items, setItems] = useState<LoadedExtension[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    // Always full reload so a prior failed eval doesn't stick forever
    const list = await reloadAllExtensions()
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

  useEffect(() => {
    void (async () => {
      setLoading(true)
      setError('')
      try {
        await refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [refresh])

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
      // Load code even if currently disabled so Test works from the list.
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
      const list = await reloadAllExtensions()
      setItems([...list])
      setStatus(`Loaded ${list.length} torrent extension(s)`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className={styles.header}>
        <div>
          <h1 className={styles.h1}>Extensions</h1>
          <p className="muted">
            Hayase-compatible torrent catalogs from{' '}
            <a href="https://exten.pages.dev" target="_blank" rel="noreferrer">
              exten.pages.dev
            </a>
            . NZB catalogs are skipped.
          </p>
        </div>
        <button className="btn" type="button" onClick={() => void reload()} disabled={loading}>
          Refresh
        </button>
      </div>

      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
      {status ? <p className={styles.status}>{status}</p> : null}
      {loading ? <p className="muted">Loading catalogs…</p> : null}

      {EXTENSION_CATALOGS.map((cat) => {
        const list = byCatalog.get(cat.id) ?? []
        return (
          <section key={cat.id} className={styles.section}>
            <h2 className={styles.h2}>
              {cat.name}{' '}
              <span className="muted">({list.length})</span>
            </h2>
            {list.length === 0 ? (
              <p className="muted">No torrent extensions in this catalog.</p>
            ) : (
              <ul className={styles.list}>
                {list.map((ext) => (
                  <li key={ext.manifest.id} className={`card ${styles.row}`}>
                    <div className={styles.meta}>
                      {ext.manifest.icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className={styles.icon} src={ext.manifest.icon} alt="" />
                      ) : (
                        <div className={styles.iconPlaceholder} />
                      )}
                      <div>
                        <div className={styles.name}>
                          {ext.manifest.name}{' '}
                          <span className="muted">v{ext.manifest.version}</span>
                        </div>
                        <div className={`muted ${styles.tiny}`}>
                          {ext.manifest.id}
                          {ext.manifest.accuracy ? ` · ${ext.manifest.accuracy}` : ''}
                          {ext.manifest.media ? ` · ${ext.manifest.media}` : ''}
                          {ext.manifest.languages?.length
                            ? ` · ${ext.manifest.languages.join(',')}`
                            : ''}
                        </div>
                        {ext.loadError ? (
                          <div className={styles.err}>{ext.loadError}</div>
                        ) : null}
                      </div>
                    </div>
                    <div className={styles.actions}>
                      <label className={styles.toggle}>
                        <input
                          type="checkbox"
                          checked={ext.enabled}
                          disabled={busyId === ext.manifest.id}
                          onChange={(e) => void toggle(ext.manifest.id, e.target.checked)}
                        />
                        On
                      </label>
                      <button
                        type="button"
                        className="btn"
                        disabled={busyId === ext.manifest.id}
                        onClick={() => void runTest(ext)}
                      >
                        Test
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </>
  )
}
