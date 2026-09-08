# Adult Mode master switch — design

Date: 2026-09-08

## Goal

Replace the Modules-page “Show NSFW” toggle with a **Settings master switch (Adult Mode)** that:

1. When **OFF**: the app fully **ghosts** adult content — modules, hentai torrent extensions, Adult UI, and adult downloads stay on disk but are invisible and unusable.
2. When **ON**: unlock Adult settings, NSFW module/catalog management, Incognito default-once, a **5th tab bar item**, and a separate Adult home/search/detail stack fed only by the **active NSFW stream module** (no AniList).

## Non-goals

- Aggregating multiple NSFW modules on home/search in v1 (active source only).
- AniList `isAdult` discovery in the Adult tab.
- Confirm / age-gate dialog on enable.
- Shipping NSFW scripts inside the IPA.
- Changing SFW Home / Search / Schedule behavior when Adult Mode is on (they stay SFW-only).

## Decisions (locked)

| Topic | Choice |
|--------|--------|
| Ghost when OFF | Soft-hide UI + hard-refuse resolve/browse (`allowNsfw: false`); data remains on disk |
| Tab bar when ON | 5th tab: Home / Search / Schedule / **Adult** / More |
| Incognito | Auto-on **once** when enabling Adult Mode; user may turn off; do not re-force |
| Scope | Gates NSFW stream modules **and** hentai torrent extensions |
| Adult catalog | Active NSFW stream module only |
| Enable UX | No confirm; dedicated `/app/adult/settings` explains on/off |
| Switch placement | Main Settings row + switch, chevron to Adult settings |
| Detail | New `/app/adult/title` (module-backed), not `/app/anime` |
| Ship shape | Full vertical in one pass |

## Architecture

**Single source of truth:** `saizen:adult-mode` (`'1'` / `'0'`) + `ADULT_MODE_CHANGED` event.

Migrate legacy `saizen:modules:showNsfw` → adult mode on first read; Modules page loses the master NSFW toggle (visibility follows adult mode).

```
Settings adultMode ──► GlassTabBar (4↔5)
                    ├──► /app/adult/* route gate
                    ├──► Modules / Extensions UI filter
                    ├──► Downloads filter (isAdult / NSFW-tagged)
                    ├──► native allowNsfw on resolve + browse
                    └──► once: setIncognito(true) + saizen:adult-incognito-primed
```

Adult stack is isolated under `/app/adult/*`. Main Search never sets `includeAdult` from modules/extensions.

## Control plane

### Preferences

- `saizen:adult-mode` — master switch
- `saizen:adult-primary-module` — installed NSFW module id used for home/search/detail
- `saizen:adult-incognito-primed` — `'1'` after first auto-Incognito so we do not re-enable Incognito on later toggles

### Helpers (`apps/web/src/lib/privacy/adult.ts`)

- `isAdultModeOn()`, `setAdultMode(on)`, `subscribeAdultMode(cb)`
- `getAdultPrimaryModuleId()`, `setAdultPrimaryModuleId(id)`
- Migration: if adult-mode unset and old showNsfw was `'1'`, set adult-mode on
- Deprecate `isShowNsfwModulesOn` / `setShowNsfwModules` as thin aliases → adult mode (or remove call sites)

### When OFF (ghost)

- NSFW module rows hidden in Modules; catalog NSFW entries hidden; cannot install/enable via UI paths that require visibility (disk state unchanged)
- Hentai torrent catalog / extensions grayed or hidden; not queried
- `allowNsfw: false` on all native module browse/resolve
- Adult downloads hidden in Downloads UI
- `/app/adult/*` → redirect Home; no 5th tab
- Main Home / Search / Schedule: `isAdult: false`; no NSFW modules in SFW resolve

### When ON

- Incognito set true once if not yet primed
- 5th tab + Adult routes live
- NSFW modules / hentai extensions manageable
- Adult downloads visible
- Browse/resolve for adult flows pass `allowNsfw: true`

## Settings UX

**Main Settings** (near Incognito):

- Row: “Adult Mode” switch + hint
- Chevron / secondary row → `/app/adult/settings/`

**`/app/adult/settings/`** (like Downloads / Modules):

- Short copy: what ON vs OFF does (ghost vs unlock)
- Primary source picker (enabled NSFW modules)
- NSFW module catalog URL add/remove + install/enable (or deep-link into Modules with adult context)
- Hentai torrent extension note / link into Extensions when gated on

No confirm dialog on toggle.

## Tab bar & routes

Dynamic `GLASS_TAB_ITEMS`: 4 or 5 columns from `isAdultModeOn()`.

| Route | Role |
|--------|------|
| `/app/adult/` | Home: hero + rails from active module `getHomeSections` |
| `/app/adult/search/` | Search + genres/filters from active module |
| `/app/adult/title/` | Detail by `{ moduleId, showUrl }` |
| `/app/adult/settings/` | Adult control plane |

Match: Adult tab highlights for `/app/adult` except settings may also appear under More via Settings — tab root is `/app/adult/`. Settings page can match More **or** Adult; prefer **More** match for `/app/adult/settings` so Settings hierarchy stays clear, Adult tab for browse/search/title.

## Module API (v1)

Existing: `searchResults`, `extractEpisodes`, `extractStreamUrl`.

**Optional** (empty if missing):

- `getHomeSections()` → `[{ id, title, items: [{ title, url, image, … }] }]`
- `getGenres()` / `getFilters()` → chips for Adult search

Native Cap bridge (names illustrative):

- `browseAdultHome({ moduleId, allowNsfw })`
- `searchAdult({ moduleId, query, filters?, allowNsfw })`

Web derives `allowNsfw` only from `isAdultModeOn()`. Adult play uses `extractEpisodes` + resolve **scoped to that module** (or NSFW set), never via `/app/anime`.

## Enforcement matrix

| Surface | OFF | ON |
|---------|-----|-----|
| Main Search `includeAdult` | always false | always false |
| SFW stream resolve NSFW modules | never | never (SFW titles) |
| Adult browse/search/resolve | refuse | active NSFW module |
| Hentai torrent extensions | hidden / not queried | usable in adult flows |
| Downloads NSFW-tagged | hidden | visible |
| Tab / Adult routes | absent / redirect | live |

## Edge cases

- Turn OFF while on Adult route → replace to `/`
- Primary module removed/disabled → Adult home empty state + CTA to settings
- Enabling Adult Mode with zero NSFW modules → tab + settings still show; home empty until install + pick primary
- Incognito primed flag persists across Adult Mode off/on so Incognito is not forced again

## Testing

- Unit/helpers: migration, primed Incognito, `allowNsfw` derivation
- Manual (device/sim): OFF ghosts modules/downloads/tab; ON shows 5th tab, home rails from one module, search isolated, main Search stays SFW
- `pnpm sync:ios` after web changes

## Success criteria

1. One Settings switch owns the adult world.
2. OFF = disk may retain data; UI and APIs pretend adult does not exist.
3. ON = 5th tab + module-backed Adult stack; SFW search unchanged.
4. Incognito defaults on once; user can disable.
