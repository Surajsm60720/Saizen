# AniList → Jikan/MAL catalog fallback

## Goal
When AniList GraphQL is unavailable (403 stability shutdown or network failure), Saizen keeps home, search, detail, character/staff, schedule, and list personalization working via Jikan (catalog) + MAL OAuth (lists).

## Policy
1. AniList remains primary.
2. On outage-class errors, enter fallback mode (TTL 20 min, or until a successful AniList probe).
- Catalog reads → Jikan-compatible MAL catalog (**Tenrai** primary, public Jikan secondary); list reads/writes personalization → MAL when connected, else stale AniList cache + connect CTA.
4. Canonical media `id` prefers AniList ID via ARM mapping; always set `idMal`.
5. UI shows a dismissible banner while fallback is active.

## Non-goals
- Perfect franchise/schedule parity with AniList.
- Dual live provider switching in Settings (outage-driven only for v1).
