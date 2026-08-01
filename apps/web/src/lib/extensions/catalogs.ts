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

/** Enabled on first launch (hentai stays off until user opts in). */
export const DEFAULT_ENABLED_IDS = [
  'seadex',
  'animetosho-new',
  'nekobt',
  'seadex-dub',
  'animetosho-multi-new'
] as const
