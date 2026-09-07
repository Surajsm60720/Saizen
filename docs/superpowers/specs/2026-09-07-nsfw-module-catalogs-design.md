# Custom NSFW module catalogs (alongside Cufiy)

Date: 2026-09-07

## Goal
Keep `library.cufiy.net` as the default SFW watch-module catalog. Allow the user to add optional HTTPS `index.json` catalog URLs (Cufiy-shaped, with `nsfw: true`). A “Show NSFW” toggle reveals those rows; installed+enabled NSFW modules auto-join stream resolve for adult titles only.

## Non-goals
- Loading Aniyomi APK repos (e.g. yuzono `index.min.json`) at runtime — those are a curation checklist only.
- Changing QueFly / Cufiy catalogs.
- Shipping NSFW scripts inside the IPA (scripts remain HTTPS `scriptUrl`).

## Catalog entry shape (Saizen)
```json
{
  "id": "hstream",
  "sourceName": "Hstream",
  "scriptUrl": "https://…/hstream.js",
  "baseUrl": "https://hstream.moe",
  "streamType": "MP4",
  "status": "active",
  "type": "anime",
  "quality": "720p",
  "nsfw": true
}
```

## Behavior
1. Browse = Cufiy ∪ custom catalogs (custom optional).
2. Rows with `nsfw: true` hidden unless “Show NSFW modules” is on.
3. Install/enable unchanged.
4. Resolve: if media is adult and NSFW modules are enabled, include them; never for non-adult titles.

## Day-0
Personal catalog can start with `modules/index.json` + `hstream.js` hosted via GitHub raw / Pages.
