# Reference notes (Hayase UX — behavior only)

Do **not** paste or vendor Hayase source. This file is for behavior notes while building Saizen.

## Screens to mirror (UX)

- Home: trending / seasonal / list sections
- Anime detail: episodes, relations, play
- Search: multi-language titles
- Schedule: airing calendar
- Settings: torrent + account toggles
- Extensions / providers
- Torrent client stats
- Player: native fullscreen

## Playback pattern (confirmed architecture)

Torrent engine → local HTTP range server → player URL. Saizen implements this greenfield in Swift.
