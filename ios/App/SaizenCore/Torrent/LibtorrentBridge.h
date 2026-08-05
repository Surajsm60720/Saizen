//
//  LibtorrentBridge.h
//  C API so Swift can call into libtorrent without exposing C++.
//
#pragma once

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct SaizenLTSession SaizenLTSession;

typedef void (*SaizenLTLogFn)(const char *message, void *ctx);
typedef void (*SaizenLTBytesFn)(
  int64_t offset,
  const uint8_t *data,
  int32_t length,
  void *ctx
);
typedef void (*SaizenLTMetaFn)(
  const char *name,
  int64_t file_size,
  int32_t piece_length,
  int32_t num_pieces,
  void *ctx
);

typedef struct SaizenLTCallbacks {
  SaizenLTLogFn on_log;
  SaizenLTMetaFn on_metadata;
  SaizenLTBytesFn on_bytes;
  void *ctx;
} SaizenLTCallbacks;

/// Create session. save_path must be a writable Documents subdirectory.
SaizenLTSession *saizen_lt_create(const char *save_path, SaizenLTCallbacks callbacks);

void saizen_lt_destroy(SaizenLTSession *session);

/// Add magnet. Returns 0 on success.
int saizen_lt_add_magnet(SaizenLTSession *session, const char *magnet_uri);

/// Add a local .torrent file (skips magnet metadata exchange). Returns 0 on success.
int saizen_lt_add_torrent_file(SaizenLTSession *session, const char *torrent_path);

/// Prefer sequential download + raise priority for [start, end) byte range of the active file.
void saizen_lt_prioritize_bytes(SaizenLTSession *session, int64_t start, int64_t end);

/// Streaming kickoff: clear piece priorities, then only download the file head.
void saizen_lt_focus_head(SaizenLTSession *session, int64_t head_bytes);

/// Offline download: skip head-focus on metadata and fetch the whole video file.
void saizen_lt_set_full_file_mode(SaizenLTSession *session, bool enabled);

/// Prioritize every piece of the selected video file (undoes focus_head).
void saizen_lt_download_all(SaizenLTSession *session);

/// Pump alerts (call often from a timer / background loop).
void saizen_lt_tick(SaizenLTSession *session);

/// Snapshot stats into out buffers (UTF-8 JSON-ish simple key lines optional later).
double saizen_lt_progress(SaizenLTSession *session);
int64_t saizen_lt_downloaded(SaizenLTSession *session);
int saizen_lt_num_peers(SaizenLTSession *session);
/// Download payload rate in bytes/sec.
int64_t saizen_lt_download_rate(SaizenLTSession *session);

void saizen_lt_pause(SaizenLTSession *session);
void saizen_lt_resume(SaizenLTSession *session);

#ifdef __cplusplus
}
#endif
