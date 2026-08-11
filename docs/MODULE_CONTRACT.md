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

`searchResults(query)` receives the user's search text and returns an array of search result objects. Each result must include enough module-owned data for a later `extractEpisodes(showUrl)` call, usually a title and a show URL.

`extractEpisodes(showUrl)` receives a show URL from a previous search result and returns an array of episode objects. Each episode must include enough module-owned data for a later `extractStreamUrl(episodeUrl)` call, usually an episode title/number and an episode URL.

`extractStreamUrl(episodeUrl)` receives an episode URL from a previous episode object and returns an object with a `streams` array. Each stream must include `url`; `headers`, `quality`, and `title` are optional. Saizen maps each stream to a native `StreamCandidate` with `moduleId` and inferred `kind` (`hls`, `mp4`, or `other`).

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
