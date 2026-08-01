import type { CatalogId } from './catalogs'

export interface ExtensionOptionDef {
  type: 'boolean' | 'string' | 'select'
  description?: string
  default?: unknown
  values?: string[]
}

export interface ExtensionManifest {
  manifestVersion: number
  name: string
  id: string
  version: string
  type: string
  accuracy?: string
  ratio?: number
  media?: string
  updatePeers?: boolean
  languages?: string[]
  url?: string
  icon?: string
  update?: string
  code: string
  options?: Record<string, ExtensionOptionDef>
  /** Catalog this entry was loaded from */
  catalogId?: CatalogId
  catalogName?: string
}

/** Raw result shape returned by Hayase-compatible extensions. */
export interface ExtensionTorrentResult {
  title?: string
  link?: string
  hash?: string
  seeders?: number
  leechers?: number
  downloads?: number
  size?: number
  accuracy?: string
  type?: string
  date?: Date | string | number
}

export interface ExtensionInstance {
  single?: (query: Record<string, unknown>, options?: Record<string, unknown>) => Promise<ExtensionTorrentResult[]>
  batch?: (query: Record<string, unknown>, options?: Record<string, unknown>) => Promise<ExtensionTorrentResult[]>
  movie?: (query: Record<string, unknown>, options?: Record<string, unknown>) => Promise<ExtensionTorrentResult[]>
  test?: () => Promise<boolean>
}

export interface LoadedExtension {
  manifest: ExtensionManifest
  instance: ExtensionInstance
  enabled: boolean
  loadError?: string
}

export interface ExtensionEnableState {
  /** Explicit enable map; missing keys use defaults */
  enabled: Record<string, boolean>
  /** Option overrides keyed by extension id */
  options: Record<string, Record<string, unknown>>
}

export const STORAGE_KEY = 'saizen:extensions'
