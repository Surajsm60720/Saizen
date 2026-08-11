# Extension / Provider format

## Watch vs Download roles

| Role | Source | Runtime | Purpose |
|------|--------|---------|---------|
| **Watch** | CDN modules (`library.cufiy.net` / custom HTTPS) | Native `JSContext` + `ModuleFetchSession` | Resolve HLS/MP4 `StreamCandidate` → `playStream` → AVPlayer |
| **Download** | Optional Hayase-compatible **torrent** extensions + built-in providers | Web extension loader (`apps/web/src/lib/extensions/`) | Magnet / `.torrent` / HTTP → `DownloadCoordinator` (offline library) |

Live Watch does **not** use `playTorrent`. Torrent extensions stay available for Save / queue / offline play only. Stream Save (HLS/MP4 with headers) is a separate download kind on the same coordinator.

---

Saizen loads **Hayase-compatible** remote torrent extensions from public catalogs (reimplemented host — does **not** vendor Hayase source). These feed the **Download** path, not primary Watch.

## Catalogs

| Catalog | URL |
|---------|-----|
| Subtitles | https://exten.pages.dev/index.json |
| Dubs | https://exten.pages.dev/dub/index.json |
| MultiSub | https://exten.pages.dev/multi/index.json |
| Hentai | https://exten.pages.dev/hentai/index.json |

NZB catalogs are ignored (`type !== "torrent"`).

Runtime lives in `apps/web/src/lib/extensions/`:

- Fetch manifests → enable/disable in `localStorage` (`saizen:extensions`)
- Fetch extension JS → blob URL → dynamic `import()`
- Call `single` / `batch` / `movie` / `test` with a rich query + Capacitor-aware `fetch`
- Normalize `{ hash, link, seeders, … }` → `ProviderResult` (magnet / torrentUrl)

Default on: Seadex, AnimeTosho (New), NekoBT, Seadex Dubs, AnimeTosho MultiSub (New). Hentai extensions stay off until enabled in **Extensions**.

## Built-in providers (`apps/web/src/lib/providers/`)

| id | Purpose |
|----|---------|
| `test-sample` | Public-domain MP4 + sample magnet for pipeline tests (always on) |
| `subsplease` / `erai-raws` / `nyaa` | Legacy fallbacks — **off by default** |

## TorrentProvider (legacy interface)

```ts
interface TorrentProvider {
  id: string
  name: string
  description: string
  enabled: boolean
  search(query: ProviderQuery): Promise<ProviderResult[]>
}
```

## ProviderResult

- `magnet` — BitTorrent magnet (libtorrent; trackers appended natively + in JS magnet builder)
- `torrentUrl` — direct `.torrent` / download URL (preferred — skips magnet metadata wait)
- `httpUrl` — progressive HTTP media (test path)

## Mirrors / speed

- JS magnets embed the shared `PUBLIC_TRACKERS` list (`extensions/trackers.ts`)
- Native `LibtorrentBridge.cpp` appends the same tracker set and uses higher connection limits
- AnimeTosho `useTorrent` defaults to **true** when the option exists
