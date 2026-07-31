# libtorrent for Saizen (local vendor)

This directory is **gitignored**. Rebuild on each machine:

```bash
# from repo root
bash scripts/build-libtorrent-ios.sh
```

Expected outputs (ios-arm64, iOS 15+):

- `ios/vendor/libtorrent-ios/lib/libtorrent.a`
- `ios/vendor/libtorrent-ios/lib/libtry_signal.a`
- `ios/vendor/libtorrent-ios/include/` (libtorrent + Boost headers)

Then sync Swift into Cap (`pnpm sync:ios` or `scripts/sync-swift-into-cap.sh`) and build the App target with `SAIZEN_HAS_LIBTORRENT=1`.
