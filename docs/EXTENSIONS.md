# Extension / Provider format (draft)

Saizen providers live in `apps/web/src/lib/providers/`.

## TorrentProvider

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

- `magnet` — BitTorrent magnet (requires libtorrent)
- `httpUrl` — progressive HTTP media (works today via ProgressiveHTTPEngine)

## Built-in

| id | Purpose |
|----|---------|
| `test-sample` | Public-domain MP4 + sample magnet for pipeline tests |
| `subsplease` | SubsPlease JSON API → magnets (good when Nyaa is ISP-blocked) |
| `erai-raws` | Erai-raws via AnimeTosho RSS mirror → magnets |
| `nyaa` | Nyaa scrape (disabled by default; often ISP-blocked) |

Future: sandboxed JS extensions (Hayase-compatible shape documented from wiki — reimplemented, not copied).
