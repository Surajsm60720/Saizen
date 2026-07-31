#!/usr/bin/env bash
# Build static libtorrent.a for iOS device (arm64) — Day-0.
# Based on libtorrent CI: .github/workflows/macos.yml (ios_build)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/ios/vendor"
SRC="$VENDOR/src"
OUT="$VENDOR/libtorrent-ios"
IOS_MIN="${IOS_MIN:-15.0}"
JOBS="${JOBS:-$(sysctl -n hw.ncpu)}"

IOS_SDK="$(xcrun --sdk iphoneos --show-sdk-path)"
CLANGXX="$(xcrun --sdk iphoneos --find clang++)"

mkdir -p "$SRC" "$OUT"

need_cmd() { command -v "$1" >/dev/null || { echo "missing: $1"; exit 1; }; }
need_cmd git
need_cmd b2
need_cmd xcrun
need_cmd curl

if [[ ! -d "$SRC/libtorrent/.git" ]]; then
  echo "==> cloning libtorrent RC_2_0"
  git clone --depth 1 --branch RC_2_0 --recurse-submodules \
    https://github.com/arvidn/libtorrent.git "$SRC/libtorrent"
else
  echo "==> libtorrent already present"
fi

if [[ ! -f "$SRC/boost/bootstrap.sh" ]]; then
  echo "==> downloading boost 1.86.0 source"
  curl -L "https://archives.boost.io/release/1.86.0/source/boost_1_86_0.tar.gz" \
    | tar -xz -C "$SRC"
  rm -rf "$SRC/boost"
  mv "$SRC/boost_1_86_0" "$SRC/boost"
fi

export BOOST_ROOT="$SRC/boost"
if [[ -d "$(brew --prefix boost-build 2>/dev/null)/share/boost-build" ]]; then
  export BOOST_BUILD_PATH="$(brew --prefix boost-build)/share/boost-build"
fi

USER_CONFIG="$OUT/user-config.jam"
# Boost.Build expects feature properties (<cxxflags>/...), not bare argv.
cat > "$USER_CONFIG" <<EOF
using darwin : ios : "${CLANGXX}" :
  <architecture>arm
  <target-os>iphone
  <cxxflags>-std=c++17
  <cxxflags>-stdlib=libc++
  <cxxflags>-fvisibility=hidden
  <cxxflags>-fvisibility-inlines-hidden
  <cxxflags>-Wno-deprecated-declarations
  <cxxflags>"-isysroot ${IOS_SDK}"
  <cxxflags>-miphoneos-version-min=${IOS_MIN}
  <cxxflags>"-arch arm64"
  <linkflags>"-isysroot ${IOS_SDK}"
  <linkflags>-miphoneos-version-min=${IOS_MIN}
  <linkflags>"-arch arm64"
;
EOF

echo "==> building libtorrent (ios-arm64, static, crypto=built-in)"
echo "    BOOST_ROOT=$BOOST_ROOT"
echo "    SDK=$IOS_SDK"
echo "    jobs=$JOBS — this can take 10–40 minutes…"

cd "$SRC/libtorrent"
b2 -j"$JOBS" -l400 \
  --user-config="$USER_CONFIG" \
  toolset=darwin-ios \
  target-os=iphone \
  address-model=64 \
  architecture=arm \
  link=static \
  runtime-link=static \
  variant=release \
  crypto=built-in \
  deprecated-functions=off \
  cxxstd=17 \
  torrent

LIB="$(find "$SRC/libtorrent" -name 'libtorrent.a' | head -1 || true)"
if [[ -z "$LIB" ]]; then
  LIB="$(find "$SRC/libtorrent" -name 'libtorrent*.a' | head -1 || true)"
fi
if [[ -z "$LIB" ]]; then
  echo "ERROR: could not find libtorrent.a after build"
  find "$SRC/libtorrent" -name '*.a' | head -50
  exit 1
fi

mkdir -p "$OUT/lib" "$OUT/include"
cp -f "$LIB" "$OUT/lib/libtorrent.a"
# try_signal is a separate static dep (mmap disk I/O)
TRY_A="$(find "$SRC/libtorrent/deps/try_signal" -name 'libtry_signal.a' | head -1 || true)"
if [[ -z "$TRY_A" ]]; then
  echo "==> building try_signal"
  (cd "$SRC/libtorrent/deps/try_signal" && b2 -j"$JOBS" --user-config="$USER_CONFIG" \
    toolset=darwin-ios target-os=iphone address-model=64 architecture=arm \
    link=static runtime-link=static variant=release cxxstd=17 try_signal)
  TRY_A="$(find "$SRC/libtorrent/deps/try_signal" -name 'libtry_signal.a' | head -1 || true)"
fi
if [[ -n "$TRY_A" ]]; then
  cp -f "$TRY_A" "$OUT/lib/libtry_signal.a"
fi
rsync -a "$SRC/libtorrent/include/libtorrent" "$OUT/include/"
rsync -a "$BOOST_ROOT/boost" "$OUT/include/"

cat > "$OUT/README.md" <<EOF
# libtorrent iOS (arm64) vendor build

- lib/libtorrent.a — static library for device
- include/ — libtorrent + boost headers

Built: $(date -u +%Y-%m-%dT%H:%MZ)
iOS min: ${IOS_MIN}
crypto: built-in
EOF

echo "==> done"
ls -lh "$OUT/lib/libtorrent.a"
du -sh "$OUT"
