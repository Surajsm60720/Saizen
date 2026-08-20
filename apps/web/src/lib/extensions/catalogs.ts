export const EXTENSION_CATALOGS = [
  {
    id: 'sub',
    name: 'Subtitles',
    url: 'https://exten.pages.dev/index.json'
  },
  {
    id: 'dub',
    name: 'Dubs',
    url: 'https://exten.pages.dev/dub/index.json'
  },
  {
    id: 'multi',
    name: 'MultiSub',
    url: 'https://exten.pages.dev/multi/index.json'
  },
  {
    id: 'hentai',
    name: 'Hentai',
    url: 'https://exten.pages.dev/hentai/index.json'
  }
] as const

export type CatalogId = (typeof EXTENSION_CATALOGS)[number]['id']

export type UserExtensionCatalog = {
  id: string
  name: string
  url: string
}

/** Enabled on first launch (hentai stays off until user opts in). */
export const DEFAULT_ENABLED_IDS = [
  'seadex',
  'animetosho-new',
  'nekobt',
  'seadex-dub',
  'animetosho-multi-new'
] as const

const USER_CATALOGS_STORAGE_KEY = 'saizen:extensionCatalogs'

function stableCatalogId(url: string): string {
  // Simple djb2-style hash for stable user catalog ids.
  let hash = 5381
  for (const ch of url) {
    hash = ((hash << 5) + hash + ch.charCodeAt(0)) >>> 0
  }
  return `user-${hash.toString(16)}`
}

function isHttpsUrl(url: string): boolean {
  return /^https:\/\//i.test(url.trim())
}

function safeParseUserCatalogs(raw: string | null): UserExtensionCatalog[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const out: UserExtensionCatalog[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const o = item as { id?: unknown; name?: unknown; url?: unknown }
      if (typeof o.url !== 'string' || !isHttpsUrl(o.url)) continue
      const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : 'Custom catalog'
      const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : stableCatalogId(o.url)
      out.push({ id, name, url: o.url.trim() })
    }
    // De-dupe by id.
    const byId = new Map<string, UserExtensionCatalog>()
    for (const c of out) byId.set(c.id, c)
    return [...byId.values()]
  } catch {
    return []
  }
}

export function listUserExtensionCatalogs(): UserExtensionCatalog[] {
  if (typeof localStorage === 'undefined') return []
  try {
    return safeParseUserCatalogs(localStorage.getItem(USER_CATALOGS_STORAGE_KEY))
  } catch {
    return []
  }
}

export function saveUserExtensionCatalogs(catalogs: UserExtensionCatalog[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(USER_CATALOGS_STORAGE_KEY, JSON.stringify(catalogs))
  } catch {
    /* quota / private mode */
  }
}

export function getExtensionCatalogName(catalogId?: string | null): string {
  if (!catalogId) return 'Unknown catalog'
  const base = EXTENSION_CATALOGS.find((c) => c.id === catalogId)
  if (base) return base.name
  const user = listUserExtensionCatalogs().find((c) => c.id === catalogId)
  return user?.name ?? 'Custom catalog'
}

export function getAllExtensionCatalogs(): Array<
  { id: string; name: string; url: string } & Partial<{ catalogId: CatalogId }>
> {
  const user = listUserExtensionCatalogs()
  return [
    ...EXTENSION_CATALOGS.map((c) => ({ id: c.id, name: c.name, url: c.url })),
    ...user.map((c) => ({ id: c.id, name: c.name, url: c.url }))
  ]
}

export function upsertUserExtensionCatalog(input: { url: string; name?: string }): UserExtensionCatalog {
  const url = input.url.trim()
  if (!isHttpsUrl(url)) {
    throw new Error('Catalog index URL must be https://')
  }
  const name = input.name?.trim() || stableCatalogId(url)
  const id = stableCatalogId(url)
  const next = listUserExtensionCatalogs()
  const existingIdx = next.findIndex((c) => c.id === id)
  const entry: UserExtensionCatalog = { id, name, url }
  if (existingIdx >= 0) next[existingIdx] = entry
  else next.push(entry)
  saveUserExtensionCatalogs(next)
  return entry
}

export function removeUserExtensionCatalog(id: string): void {
  const next = listUserExtensionCatalogs().filter((c) => c.id !== id)
  saveUserExtensionCatalogs(next)
}
