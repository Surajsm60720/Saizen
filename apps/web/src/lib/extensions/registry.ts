import {
  DEFAULT_ENABLED_IDS,
  EXTENSION_CATALOGS,
  getAllExtensionCatalogs
} from './catalogs'
import { saizenFetchJson } from './fetch'
import { clearExtensionCache, loadExtensionInstance, unloadExtension } from './loader'
import type {
  ExtensionEnableState,
  ExtensionManifest,
  LoadedExtension
} from './types'
import { STORAGE_KEY } from './types'

let manifests: ExtensionManifest[] = []
let loaded: Map<string, LoadedExtension> = new Map()
let state: ExtensionEnableState = { enabled: {}, options: {} }
let initialized = false
const listeners = new Set<() => void>()

/** Subscribe to enable/load changes (Search keep-alive, etc.). */
export function subscribeExtensions(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emitExtensionsChanged(): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch (e) {
      console.warn('[saizen] extension listener failed', e)
    }
  }
}

function readState(): ExtensionEnableState {
  if (typeof localStorage === 'undefined') return { enabled: {}, options: {} }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const enabled: Record<string, boolean> = {}
      for (const id of DEFAULT_ENABLED_IDS) enabled[id] = true
      const initial = { enabled, options: {} }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial))
      return initial
    }
    const parsed = JSON.parse(raw) as ExtensionEnableState
    return {
      enabled: parsed.enabled ?? {},
      options: parsed.options ?? {}
    }
  } catch {
    return { enabled: {}, options: {} }
  }
}

function writeState(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* quota / private mode */
  }
}

function isEnabled(id: string, catalogId?: string, media?: string): boolean {
  if (id in state.enabled) return state.enabled[id]!
  if ((DEFAULT_ENABLED_IDS as readonly string[]).includes(id)) return true
  // Adult catalogs / media stay off until the user opts in
  if (catalogId === 'hentai' || media === 'hentai') return false
  return false
}

function optionDefaults(manifest: ExtensionManifest): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!manifest.options) return out
  for (const [key, def] of Object.entries(manifest.options)) {
    if (def.default !== undefined) out[key] = def.default
  }
  // Prefer .torrent files for AnimeTosho when option exists (faster metadata).
  if ('useTorrent' in out) out.useTorrent = true
  return out
}

export function getExtensionOptions(id: string): Record<string, unknown> {
  const m = manifests.find((x) => x.id === id)
  const defaults = m ? optionDefaults(m) : {}
  return { ...defaults, ...(state.options[id] ?? {}) }
}

export async function refreshCatalogs(): Promise<ExtensionManifest[]> {
  const results = await Promise.all(
    getAllExtensionCatalogs().map(async (cat) => {
      try {
        const list = await saizenFetchJson<ExtensionManifest[]>(cat.url)
        return list
          .filter((m) => m && m.type === 'torrent' && m.code && m.id)
          .map((m) => ({
            ...m,
            catalogId: cat.id,
            catalogName: cat.name,
            // Remote hentai catalog often tags media as "sub" — normalize for gating/UI.
            media: cat.id === 'hentai' ? 'hentai' : m.media
          }))
      } catch (e) {
        console.warn(`[saizen] catalog ${cat.id} failed`, e)
        return [] as ExtensionManifest[]
      }
    })
  )

  const byId = new Map<string, ExtensionManifest>()
  for (const list of results) {
    for (const m of list) {
      byId.set(m.id, m)
    }
  }
  manifests = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
  return manifests
}

export async function initExtensions(): Promise<LoadedExtension[]> {
  state = readState()
  // Drop evaluated sources so host-side transforms (onLine / genres) always apply.
  clearExtensionCache()
  await refreshCatalogs()
  loaded = new Map()

  // Ensure newly added default IDs become enabled for existing installs that
  // only had a partial enable map saved before catalogs expanded.
  let dirty = false
  for (const id of DEFAULT_ENABLED_IDS) {
    if (!(id in state.enabled)) {
      state.enabled[id] = true
      dirty = true
    }
  }
  if (dirty) writeState()

  await Promise.all(
    manifests.map(async (manifest) => {
      const enabled = isEnabled(manifest.id, manifest.catalogId, manifest.media)
      if (!enabled) {
        loaded.set(manifest.id, { manifest, instance: {}, enabled: false })
        return
      }
      try {
        const instance = await loadExtensionInstance(manifest)
        loaded.set(manifest.id, { manifest, instance, enabled: true })
      } catch (e) {
        console.error(`[saizen] extension load failed: ${manifest.id}`, e)
        loaded.set(manifest.id, {
          manifest,
          instance: {},
          enabled: true,
          loadError: e instanceof Error ? e.message : String(e)
        })
      }
    })
  )

  initialized = true
  emitExtensionsChanged()
  return listExtensions()
}

export async function ensureExtensions(): Promise<LoadedExtension[]> {
  if (!initialized) return initExtensions()
  return listExtensions()
}

export function listExtensions(): LoadedExtension[] {
  return manifests.map((manifest) => {
    const entry = loaded.get(manifest.id)
    if (entry) return entry
    return {
      manifest,
      instance: {},
      enabled: isEnabled(manifest.id, manifest.catalogId, manifest.media)
    }
  })
}

export function listEnabledExtensions(): LoadedExtension[] {
  return listExtensions().filter((e) => e.enabled && !e.loadError && e.instance.single)
}

export async function setExtensionEnabled(id: string, enabled: boolean): Promise<void> {
  state.enabled[id] = enabled
  writeState()
  const manifest = manifests.find((m) => m.id === id)
  if (!manifest) {
    emitExtensionsChanged()
    return
  }

  if (!enabled) {
    unloadExtension(manifest)
    loaded.set(id, { manifest, instance: {}, enabled: false })
    emitExtensionsChanged()
    return
  }

  try {
    const instance = await loadExtensionInstance(manifest)
    // User may have toggled off again while the script was downloading.
    if (!state.enabled[id]) {
      unloadExtension(manifest)
      loaded.set(id, { manifest, instance: {}, enabled: false })
      emitExtensionsChanged()
      return
    }
    loaded.set(id, { manifest, instance, enabled: true })
  } catch (e) {
    loaded.set(id, {
      manifest,
      instance: {},
      enabled: true,
      loadError: e instanceof Error ? e.message : String(e)
    })
  }
  emitExtensionsChanged()
}

export function setExtensionOption(id: string, key: string, value: unknown): void {
  if (!state.options[id]) state.options[id] = {}
  state.options[id]![key] = value
  writeState()
}

export function hasAdultExtensionsEnabled(): boolean {
  return listExtensions().some(
    (e) => e.enabled && (e.manifest.catalogId === 'hentai' || e.manifest.media === 'hentai')
  )
}

export async function reloadAllExtensions(): Promise<LoadedExtension[]> {
  clearExtensionCache()
  initialized = false
  return initExtensions()
}
