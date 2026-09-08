# Adult Mode Master Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Adult Mode as a Settings master switch with ghost-when-off enforcement, a 5th tab, and a module-backed Adult home/search/detail stack isolated from SFW search.

**Architecture:** `saizen:adult-mode` is the single preference. Web gates UI/routes; native `allowNsfw` gates resolve/browse. Adult routes live under `/app/adult/*` and talk only to the active NSFW stream module via optional `getHomeSections` / existing `searchResults` + `extractEpisodes` / `extractStreamUrl`.

**Tech Stack:** Next.js web (`apps/web`), Capacitor iOS, SaizenModules JSContext runtime, localStorage preferences.

**Spec:** `docs/superpowers/specs/2026-09-08-adult-mode-master-switch-design.md`

## Global Constraints

- Main Search / Home / Schedule never set AniList `includeAdult` from Adult Mode or NSFW modules.
- When Adult Mode is OFF: hide NSFW UI, refuse `allowNsfw`, keep disk data.
- Incognito auto-on only once (`saizen:adult-incognito-primed`).
- Active source only for Adult browse (no multi-module aggregate in v1).
- Prefer `pnpm`; run `pnpm sync:ios` after web changes.
- Do not commit unless the user asks.

## File map

| File | Responsibility |
|------|----------------|
| `apps/web/src/lib/privacy/adult.ts` | adultMode, primary module, migration, subscribe |
| `apps/web/src/app/app/settings/page.tsx` | Master switch + link |
| `apps/web/src/app/app/adult/settings/page.tsx` | Explanation, primary picker, NSFW module mgmt entry |
| `apps/web/src/app/app/adult/page.tsx` | Adult home |
| `apps/web/src/app/app/adult/search/page.tsx` | Adult search |
| `apps/web/src/app/app/adult/title/page.tsx` | Adult detail + play |
| `apps/web/src/components/saizen/AdultModeGate.tsx` | Redirect if mode off |
| `apps/web/src/components/saizen/GlassTabBar.tsx` | Dynamic 4↔5 tabs |
| `apps/web/src/app/app/modules/page.tsx` | Drop local NSFW master toggle; follow adultMode |
| `apps/web/src/app/app/search/page.tsx` | Stop includeAdult from NSFW flags |
| `apps/web/src/app/app/extensions/page.tsx` | Gate hentai catalog on adultMode |
| `apps/web/src/app/app/downloads/page.tsx` | Hide adult-tagged when mode off |
| `apps/web/src/lib/native/bridge.ts` + Swift plugin/runtime | `browseAdultHome` / `searchAdult` + optional module fns |

---

### Task 1: Adult Mode preference layer

**Files:**
- Modify: `apps/web/src/lib/privacy/adult.ts`
- Test: manual in browser console / small vitest if present

**Interfaces:**
- Produces: `isAdultModeOn()`, `setAdultMode(on: boolean): boolean`, `subscribeAdultMode`, `getAdultPrimaryModuleId()`, `setAdultPrimaryModuleId(id: string | null)`, migration from `SHOW_NSFW_MODULES_KEY`, `ADULT_MODE_CHANGED` (keep alias `ADULT_CONTENT_CHANGED`)

- [ ] Replace showNsfw-centric API with adultMode; migrate legacy key on first read
- [ ] On `setAdultMode(true)`, if `saizen:adult-incognito-primed` unset → `setIncognitoMode(true)` and set primed
- [ ] Keep `hasAdultContentEnabled()` → `isAdultModeOn()` only (no extension OR) so SFW search cannot bleed

**Verify:** Toggle in console flips storage; enabling primes Incognito once.

---

### Task 2: Settings switch + Adult settings shell

**Files:**
- Modify: `apps/web/src/app/app/settings/page.tsx`
- Create: `apps/web/src/app/app/adult/settings/page.tsx`
- Create: `apps/web/src/components/saizen/AdultModeGate.tsx`

- [ ] Settings group “Adult content”: switch + chevron to `/app/adult/settings/`
- [ ] Adult settings page: copy for ON/OFF, primary module picker (list NSFW installed), link to Modules
- [ ] Wrap adult settings with gate that allows the page itself when linking from Settings even if… **No:** gate redirects when OFF — but user must open settings to turn ON from main Settings. Adult settings when OFF still reachable from main Settings chevron to explain and show switch (duplicate switch on detail page). Gate only browse/search/title, not settings.

**Verify:** Switch on Settings enables mode; Adult settings explains state; primary picker persists id.

---

### Task 3: Stop SFW bleed + Modules follow adultMode

**Files:**
- Modify: `apps/web/src/app/app/search/page.tsx`
- Modify: `apps/web/src/app/app/modules/page.tsx`
- Modify: `apps/web/src/app/app/extensions/page.tsx`

- [ ] Search: force `includeAdult = false`; remove adult sync from extensions/showNsfw
- [ ] Modules: remove master Show NSFW switch; `showNsfw = isAdultModeOn()`; subscribe to adult mode
- [ ] Extensions: when adultMode off, hide/disable hentai catalog filter and adult extension enable

**Verify:** Main Search never returns adult AniList; Modules NSFW rows only when Adult Mode on.

---

### Task 4: Tab bar 5th item + Adult route gate

**Files:**
- Modify: `apps/web/src/components/saizen/GlassTabBar.tsx`
- Modify: `apps/web/src/app/AppShell.tsx` if tab list exported statically
- Create: `apps/web/src/app/app/adult/page.tsx` (placeholder home OK)
- Create: `apps/web/src/app/app/adult/search/page.tsx` (placeholder)
- Create: `apps/web/src/app/app/adult/title/page.tsx` (placeholder)

- [ ] Derive tab items from `isAdultModeOn()`; grid-cols-4 vs grid-cols-5
- [ ] Adult tab → `/app/adult/`; More still matches settings/modules/extensions/adult/settings
- [ ] AdultModeGate on home/search/title → `/` when off

**Verify:** OFF = 4 tabs; ON = 5; deep link adult home redirects when off.

---

### Task 5: Native adult browse bridge

**Files:**
- Modify: `ios/App/SaizenCore/Modules/ModuleRuntime.swift` (+ mobile mirror if required)
- Modify: `ios/App/Plugins/SaizenModules/SaizenModulesPlugin.swift`
- Modify: `apps/web/src/lib/native/bridge.ts`, `apps/web/src/lib/native/index.ts`

- [ ] Optional `getHomeSections` / `getGenres` in ModuleRuntime (return empty arrays if missing)
- [ ] Plugin methods `browseAdultHome` / `searchAdult` requiring `allowNsfw == true` and module.nsfw
- [ ] Web stubs for browser/dev without native

**Verify:** With adultMode off, bridge refuses; with on + NSFW module, searchAdult returns results.

---

### Task 6: Adult home / search / title wired to active source

**Files:**
- Modify: adult pages from Task 4
- Module scripts (local harness): add `getHomeSections` where available; else home uses tagged rails from `searchResults` fallback queries

- [ ] Home: load sections from active module; empty CTA if no primary
- [ ] Search: query + genre chips; navigate to title with moduleId + showUrl
- [ ] Title: episodes + play via existing player/resolve scoped to module
- [ ] Mark downloads/progress adult where applicable

**Verify:** End-to-end browse → detail → play on device with one NSFW module.

---

### Task 7: Downloads ghost + polish + sync

**Files:**
- Modify: `apps/web/src/app/app/downloads/page.tsx`
- Modify: `apps/web/src/lib/version.ts` changelog entry
- Run: `pnpm sync:ios`

- [ ] Hide adult/NSFW-tagged library items when adultMode off
- [ ] Changelog blurb for Adult Mode
- [ ] `pnpm sync:ios`

**Verify:** Offline adult file remains on disk; disappears from UI when mode off; reappears when on.

---

## Spec coverage

- Ghost mode + disk retain → Tasks 1, 3, 4, 5, 7
- Settings switch + Adult settings page → Task 2
- Incognito once → Task 1
- 5th tab + routes → Task 4
- Active source browse → Tasks 5–6
- No SFW search bleed → Task 3
- Hentai extensions gated → Task 3
- Full vertical → Tasks 1–7
