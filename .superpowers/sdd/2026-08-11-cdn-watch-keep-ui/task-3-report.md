# Task 3 Report: Day 0 Spike — Catalog to AVPlayer

Status: DONE_WITH_CONCERNS

## Implemented

- Added `ModuleLibraryClient.fetchCatalog()` and `pickDay0Candidates(_:)` for active anime HLS modules with HTTPS scripts.
- Added DEBUG-only `ModuleDay0Spike` that fetches the catalog, tries up to three candidates, downloads each script with an ephemeral one-off `URLSession`, creates one `ModuleResolveSession` per candidate, resolves `Naruto` → first result → first episode → first HLS stream, and presents AVPlayer via `PlayerRouter`.
- Added DEBUG-only `SaizenPlayer.runModuleDay0Spike` native method.
- Added a hidden Settings → About version-badge long press to trigger the spike from a DEBUG iOS build.
- Added the two new Swift files to `App.xcodeproj` and synced Swift into Capacitor.

## Verification

- `pnpm sync:ios`: web build passed, Capacitor assets copied, local plugins registered, Swift copied into `apps/mobile/ios/App/App/Saizen`. CocoaPods update reported `https://cdn.cocoapods.org/` HTTP 403 in this environment.
- Catalog fetch attempt with full network against `https://library.cufiy.net/api/modules.json`: HTTP 403 Forbidden from the endpoint in this environment.
- `xcodebuild -workspace App.xcworkspace -scheme App -configuration Debug -destination 'generic/platform=iOS' -derivedDataPath /Users/surajmenon/codes/Saizen/.derivedData/task3-xcodebuild CODE_SIGNING_ALLOWED=NO build`: passed.

## Device Verification Required

Physical device playback could not be run from this environment. Human verification steps:

1. From repo root, run `pnpm sync:ios` on a network that can reach CocoaPods, or run `pod install` in `apps/mobile/ios/App` if needed.
2. Open `apps/mobile/ios/App/App.xcworkspace` in Xcode.
3. Select the `App` scheme, a physical iPhone, and a Debug configuration.
4. Build and run on device.
5. Open Saizen → Settings → About, then long-press the Version badge for about one second.
6. Pass criteria: AVPlayer opens, video starts, seeking works, and Xcode logs include `[Saizen] Day0 spike succeeded moduleId=...`.

Stop gate remains active: do not start Watch UI rewiring until this passes on device.
