# Reference notes (Hayase / Shirox UX — behavior only)

Do **not** paste or vendor Hayase or Shirox source. Behavior notes only while building Saizen.

**Architecture source of truth (active):** [`superpowers/specs/2026-08-11-cdn-watch-keep-ui-design.md`](./superpowers/specs/2026-08-11-cdn-watch-keep-ui-design.md)  
**Implementation plan:** [`superpowers/plans/2026-08-11-cdn-watch-keep-ui.md`](./superpowers/plans/2026-08-11-cdn-watch-keep-ui.md)  
**v1 feature freeze:** [`reference/FEATURES_SNAPSHOT_v1.3.3.md`](./reference/FEATURES_SNAPSHOT_v1.3.3.md)  
**Deferred (not current):** [`saizen-native-rewrite-plan.md`](./saizen-native-rewrite-plan.md) — SwiftUI rewrite on hold; Cap UI kept

## Screens to mirror (UX)

- Home: trending / seasonal / list sections
- Anime detail: episodes, relations, play
- Search: multi-language titles
- Schedule: airing calendar
- Settings: accounts + playback + modules
- Module management (CDN Watch); torrent extensions optional for Download
- Player: native fullscreen (AVPlayer primary)

## Playback pattern (CDN Watch — locked)

Community modules (`searchResults` → `extractEpisodes` → `extractStreamUrl`) → ranked `StreamCandidate` → AVPlayer (HLS preferred); MobileVLCKit only as per-candidate probe fallback. Live torrent Watch dropped; torrent/magnet remains optional Download via `DownloadCoordinator`.

## Playback pattern (v1 — historical)

Torrent engine → local HTTP range server → VLC/AVPlayer (no longer the primary Watch path).
