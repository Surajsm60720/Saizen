# Module Contract

Saizen modules run inside a native `JSContext` resolve session. The contract is clean-room and intentionally small:

```js
searchResults(query) -> SearchResult[]
extractEpisodes(showUrl) -> Episode[]
extractStreamUrl(episodeUrl) -> {
  streams: [{ url, headers?, quality?, title? }],
  subtitle?
}
```

## Functions

`searchResults(query)` receives the user's search text and returns an array of search result objects (or a JSON string of that array — Sora/Luna compatible). Each result must include a show URL as `url` or `href`.

`extractEpisodes(showUrl)` receives a show URL from a previous search result and returns an array of episode objects (or a JSON string). Each episode must include an episode URL as `url` or `href`, and ideally `number` / `episode`.

`extractStreamUrl(episodeUrl)` returns `{ streams, subtitle? }` (or a JSON string). Each stream must include `url` or Sora-style `streamUrl`; `headers`, `quality`/`resolution`, and `title` are optional.

## Host helpers (Sora-compatible)

The runtime exposes:

- `fetch(input, options?)` — sandboxed HTTPS fetch
- `fetchv2(url, headers?, method?, body?)` — Sora-style helper used by many community modules
- `console.log/warn/error` — forwarded to native logs

During a resolve session, HTTPS hosts requested by the module via bridged fetch are allowlisted for that session (deny list still wins).

## Resolve Session Lifetime

One resolve session is one module's work for a user action, not one JS method call.

- One `JSContext` for the full `searchResults` -> `extractEpisodes` -> `extractStreamUrl` chain on that module.
- Tear down only when that chain completes / fails / cancels.
- Parallel fan-out = one session per module; no shared context across modules.
- No long-lived global context across unrelated user actions.

The session-scoped context lets module helper state and challenge cookies survive across the chain without leaking to another module or another user action.

## Network Isolation

Module scripts and bridged `fetch` are HTTPS-only. The only module networking path is native bridged `fetch` with host allow/deny enforcement.

Each resolve session owns a dedicated `URLSession` and private `HTTPCookieStorage`. Module network traffic must never use `URLSession.shared` or `HTTPCookieStorage.shared`; concurrent module sessions must not bleed cookies across modules.

The runtime seeds allowed hosts from the module `baseUrl` host. Deny rules win over allow rules. Redirects and final response hosts are gated by `ModuleFetchSession`, and the resolve session invalidates its network session at teardown.
