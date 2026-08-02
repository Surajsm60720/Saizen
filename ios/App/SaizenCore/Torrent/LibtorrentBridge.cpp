//
//  LibtorrentBridge.cpp
//  Minimal libtorrent session for Saizen streaming.
//  Compile only when SAIZEN_HAS_LIBTORRENT=1 and linked with libtorrent.a
//
#if defined(SAIZEN_HAS_LIBTORRENT) && SAIZEN_HAS_LIBTORRENT

#include "LibtorrentBridge.h"

#include <libtorrent/alert_types.hpp>
#include <libtorrent/magnet_uri.hpp>
#include <libtorrent/session.hpp>
#include <libtorrent/torrent_info.hpp>
#include <libtorrent/torrent_status.hpp>

#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

namespace lt = libtorrent;

struct SaizenLTSession {
  lt::session ses;
  lt::torrent_handle handle;
  SaizenLTCallbacks cb{};
  std::string save_path;
  std::mutex mu;
  int file_index = 0;
  int64_t file_size = 0;
  int64_t file_offset = 0; // offset of selected file within torrent
  int piece_length = 0;
  int tick_count = 0;
  bool has_meta = false;
  std::atomic<bool> alive{true};

  explicit SaizenLTSession(lt::settings_pack pack)
    : ses(std::move(pack)) {}
};

static void log(SaizenLTSession *s, const std::string &msg) {
  if (s && s->cb.on_log) s->cb.on_log(msg.c_str(), s->cb.ctx);
}

static void handle_metadata(SaizenLTSession *s);

static int pick_video_file(lt::torrent_info const &ti) {
  int const nfiles = ti.files().num_files();
  if (nfiles <= 0) return -1;
  int best = -1;
  int64_t best_size = -1;
  auto const n = lt::file_index_t(nfiles);
  for (lt::file_index_t i(0); i < n; ++i) {
    auto const sz = ti.files().file_size(i);
    auto const name = ti.files().file_path(i);
    std::string lower = name;
    for (auto &c : lower) c = char(std::tolower(c));
    bool video = lower.find(".mkv") != std::string::npos
      || lower.find(".mp4") != std::string::npos
      || lower.find(".avi") != std::string::npos
      || lower.find(".webm") != std::string::npos
      || lower.find(".m4v") != std::string::npos;
    if (video && sz > best_size) {
      best_size = sz;
      best = int(i);
    }
  }
  if (best < 0) {
    // fallback: largest file
    for (lt::file_index_t i(0); i < n; ++i) {
      auto const sz = ti.files().file_size(i);
      if (sz > best_size) {
        best_size = sz;
        best = int(i);
      }
    }
  }
  return best;
}

extern "C" SaizenLTSession *saizen_lt_create(const char *save_path, SaizenLTCallbacks callbacks) {
  lt::settings_pack pack;
  pack.set_int(lt::settings_pack::alert_mask,
    lt::alert_category::error
      | lt::alert_category::status
      | lt::alert_category::piece_progress
      | lt::alert_category::storage
      | lt::alert_category::peer
      | lt::alert_category::tracker
      | lt::alert_category::connect
      | lt::alert_category::dht);
  // Ephemeral listen port — fixed 6881 often fails on iOS without special entitlements.
  pack.set_str(lt::settings_pack::listen_interfaces, "0.0.0.0:0");
  pack.set_str(lt::settings_pack::dht_bootstrap_nodes,
    "dht.libtorrent.org:25401"
    ",router.bittorrent.com:6881"
    ",router.utorrent.com:6881"
    ",dht.transmissionbt.com:6881"
    ",router.bitcomet.com:6881");
  pack.set_bool(lt::settings_pack::enable_dht, true);
  pack.set_bool(lt::settings_pack::enable_lsd, true);
  pack.set_bool(lt::settings_pack::enable_upnp, false);   // noisy / rarely helpful on cellular
  pack.set_bool(lt::settings_pack::enable_natpmp, false);
  pack.set_bool(lt::settings_pack::enable_outgoing_utp, true);
  pack.set_bool(lt::settings_pack::enable_incoming_utp, true);
  pack.set_bool(lt::settings_pack::enable_outgoing_tcp, true);
  pack.set_bool(lt::settings_pack::enable_incoming_tcp, true);
  pack.set_bool(lt::settings_pack::anonymous_mode, false);
  // Prefer encryption when offered — many peers require it; still allow plaintext.
  pack.set_int(lt::settings_pack::out_enc_policy, lt::settings_pack::pe_enabled);
  pack.set_int(lt::settings_pack::in_enc_policy, lt::settings_pack::pe_enabled);
  pack.set_int(lt::settings_pack::allowed_enc_level, lt::settings_pack::pe_both);
  pack.set_bool(lt::settings_pack::prefer_rc4, false);
  pack.set_int(lt::settings_pack::handshake_timeout, 20);
  pack.set_int(lt::settings_pack::peer_timeout, 90);
  pack.set_int(lt::settings_pack::peer_connect_timeout, 12);
  pack.set_int(lt::settings_pack::connections_limit, 300);
  pack.set_int(lt::settings_pack::connection_speed, 80);
  pack.set_int(lt::settings_pack::active_downloads, 6);
  pack.set_int(lt::settings_pack::active_limit, 12);
  pack.set_int(lt::settings_pack::max_peerlist_size, 8000);
  pack.set_int(lt::settings_pack::max_paused_peerlist_size, 4000);
  pack.set_int(lt::settings_pack::request_timeout, 12);
  pack.set_int(lt::settings_pack::whole_pieces_threshold, 4);
  pack.set_str(lt::settings_pack::user_agent, "Saizen/0.1 libtorrent/2.0");
  pack.set_str(lt::settings_pack::peer_fingerprint, "-SZ0001-");

  auto *s = new SaizenLTSession(std::move(pack));
  s->cb = callbacks;
  s->save_path = save_path ? save_path : ".";

  log(s, "libtorrent session created (dht+utp+tcp)");
  return s;
}

extern "C" void saizen_lt_destroy(SaizenLTSession *session) {
  if (!session) return;
  {
    std::lock_guard<std::mutex> lock(session->mu);
    session->alive = false;
    if (session->handle.is_valid()) {
      session->ses.remove_torrent(session->handle, lt::session::delete_files);
    }
  }
  // Re-acquire so any in-flight tick (which holds mu for the whole pump) has finished.
  {
    std::lock_guard<std::mutex> lock(session->mu);
  }
  delete session;
}

// Keep in sync with apps/web/src/lib/extensions/trackers.ts PUBLIC_TRACKERS
static void append_extra_trackers(lt::add_torrent_params &params) {
  static char const *extra_trackers[] = {
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.stealth.si:80/announce",
    "udp://exodus.desync.com:6969/announce",
    "udp://tracker.torrent.eu.org:451/announce",
    "udp://tracker.moeking.me:6969/announce",
    "udp://tracker1.bt.moack.co.kr:80/announce",
    "udp://tracker.tiny-vps.com:6969/announce",
    "udp://open.demonii.com:1337/announce",
    "udp://explodie.org:6969/announce",
    "udp://tracker.theoks.net:6969/announce",
    "http://tracker.opentrackr.org:1337/announce",
    "http://open.stealth.si:80/announce",
    "http://tracker.openbittorrent.com:80/announce",
    "http://tracker.bt4g.com:2095/announce",
    "https://tracker.tamersunion.org:443/announce",
  };
  for (auto *tr : extra_trackers) {
    params.trackers.emplace_back(tr);
  }
}

extern "C" int saizen_lt_add_magnet(SaizenLTSession *session, const char *magnet_uri) {
  if (!session || !magnet_uri) return -1;
  std::lock_guard<std::mutex> lock(session->mu);

  lt::add_torrent_params params;
  lt::error_code ec;
  lt::parse_magnet_uri(magnet_uri, params, ec);
  if (ec) {
    log(session, std::string("parse_magnet_uri failed: ") + ec.message());
    return -2;
  }
  params.save_path = session->save_path;
  params.flags |= lt::torrent_flags::sequential_download;
  params.flags |= lt::torrent_flags::auto_managed;

  // Extra public trackers — many magnet URIs ship dead UDP trackers / wss-only.
  append_extra_trackers(params);

  session->handle = session->ses.add_torrent(std::move(params), ec);
  if (ec) {
    log(session, std::string("add_torrent failed: ") + ec.message());
    return -3;
  }
  log(session, "magnet added (waiting for metadata)");
  return 0;
}

extern "C" int saizen_lt_add_torrent_file(SaizenLTSession *session, const char *torrent_path) {
  if (!session || !torrent_path) return -1;
  std::lock_guard<std::mutex> lock(session->mu);

  lt::error_code ec;
  auto ti = std::make_shared<lt::torrent_info>(std::string(torrent_path), ec);
  if (ec || !ti || !ti->is_valid()) {
    log(session, std::string("torrent_info failed: ") + (ec ? ec.message() : "invalid"));
    return -2;
  }

  lt::add_torrent_params params;
  params.ti = ti;
  params.save_path = session->save_path;
  params.flags |= lt::torrent_flags::sequential_download;
  params.flags |= lt::torrent_flags::auto_managed;

  append_extra_trackers(params);

  session->handle = session->ses.add_torrent(std::move(params), ec);
  if (ec) {
    log(session, std::string("add_torrent(file) failed: ") + ec.message());
    return -3;
  }
  log(session, "torrent file added (metadata present)");
  // Metadata is already known — fire PieceStore setup immediately.
  handle_metadata(session);
  return 0;
}

static void prioritize_bytes_locked(SaizenLTSession *session, int64_t start, int64_t end) {
  if (!session->handle.is_valid() || !session->has_meta || session->piece_length <= 0) return;

  int64_t abs_start = session->file_offset + start;
  int64_t abs_end = session->file_offset + end;
  int first = int(abs_start / session->piece_length);
  int last = int((abs_end - 1) / session->piece_length);
  auto ti = session->handle.torrent_file();
  if (!ti) return;
  int n = ti->num_pieces();
  first = std::max(0, std::min(first, n - 1));
  last = std::max(0, std::min(last, n - 1));

  for (int p = first; p <= last; ++p) {
    session->handle.piece_priority(lt::piece_index_t(p), lt::download_priority_t(7));
    // Tighter deadlines = sooner piece requests for the warm / playhead window.
    session->handle.set_piece_deadline(lt::piece_index_t(p), (p - first) * 25);
  }
}

/// Streaming mode: zero every piece, then only raise [0, head_bytes) of the active file.
/// Without this, prioritize_files(7) marks the whole episode high-priority and we
/// download tens/hundreds of MB before the first contiguous head bytes arrive.
static void focus_head_locked(SaizenLTSession *session, int64_t head_bytes) {
  if (!session->handle.is_valid() || !session->has_meta || session->piece_length <= 0) return;
  auto ti = session->handle.torrent_file();
  if (!ti) return;
  int n = ti->num_pieces();
  if (n <= 0) return;

  std::vector<lt::download_priority_t> prios(std::size_t(n), lt::download_priority_t(0));
  int64_t want = std::min(head_bytes, session->file_size);
  if (want <= 0) {
    session->handle.prioritize_pieces(prios);
    return;
  }
  int64_t abs_start = session->file_offset;
  int64_t abs_end = session->file_offset + want;
  int first = int(abs_start / session->piece_length);
  int last = int((abs_end - 1) / session->piece_length);
  first = std::max(0, std::min(first, n - 1));
  last = std::max(0, std::min(last, n - 1));

  // Small lookahead so playback does not stall right after open.
  int extend = std::min(n - 1, last + 24);
  for (int p = first; p <= extend; ++p) {
    prios[std::size_t(p)] = lt::download_priority_t(p <= last ? 7 : 4);
  }
  session->handle.prioritize_pieces(prios);
  for (int p = first; p <= last; ++p) {
    session->handle.set_piece_deadline(lt::piece_index_t(p), (p - first) * 20);
  }
  log(session, std::string("focus_head pieces=") + std::to_string(first) + ".." + std::to_string(last)
    + " extend=" + std::to_string(extend) + " bytes=" + std::to_string(want));
}

extern "C" void saizen_lt_prioritize_bytes(SaizenLTSession *session, int64_t start, int64_t end) {
  if (!session) return;
  std::lock_guard<std::mutex> lock(session->mu);
  prioritize_bytes_locked(session, start, end);
}

extern "C" void saizen_lt_focus_head(SaizenLTSession *session, int64_t head_bytes) {
  if (!session) return;
  std::lock_guard<std::mutex> lock(session->mu);
  focus_head_locked(session, head_bytes);
}

static void handle_metadata(SaizenLTSession *s) {
  if (s->has_meta) return;
  auto ti = s->handle.torrent_file();
  if (!ti) return;
  int const nfiles = ti->files().num_files();
  s->file_index = pick_video_file(*ti);
  if (s->file_index < 0 || s->file_index >= nfiles) {
    log(s, "metadata: torrent has no usable files — ignoring");
    return;
  }
  auto const idx = lt::file_index_t(s->file_index);
  s->file_size = ti->files().file_size(idx);
  s->file_offset = ti->files().file_offset(idx);
  s->piece_length = ti->piece_length();
  s->has_meta = true;

  // Select video file at low default priority — piece-level focus_head raises the window.
  std::vector<lt::download_priority_t> prios(std::size_t(nfiles), lt::download_priority_t(0));
  prios[std::size_t(s->file_index)] = lt::download_priority_t(1);
  s->handle.prioritize_files(prios);
  s->handle.set_flags(lt::torrent_flags::sequential_download);

  std::string name = ti->files().file_path(idx);
  log(s, std::string("metadata: ") + name + " size=" + std::to_string(s->file_size));
  if (s->cb.on_metadata) {
    s->cb.on_metadata(name.c_str(), s->file_size, s->piece_length, ti->num_pieces(), s->cb.ctx);
  }

  // Head only at metadata time — do NOT prioritize tail yet (it stole bandwidth from head).
  focus_head_locked(s, std::min<int64_t>(s->file_size, 4 * 1024 * 1024));
}

extern "C" void saizen_lt_tick(SaizenLTSession *session) {
  if (!session) return;
  // Hold mu for the entire alert pump so destroy cannot free the session mid-tick.
  std::lock_guard<std::mutex> lock(session->mu);
  if (!session->alive) return;

  std::vector<lt::alert *> alerts;
  session->ses.pop_alerts(&alerts);
  for (lt::alert *a : alerts) {
    if (auto *m = lt::alert_cast<lt::metadata_received_alert>(a)) {
      if (m->handle == session->handle) handle_metadata(session);
    } else if (auto *rp = lt::alert_cast<lt::read_piece_alert>(a)) {
      if (rp->error) {
        log(session, std::string("read_piece error: ") + rp->error.message());
        continue;
      }
      if (!session->has_meta || !rp->buffer) continue;
      int piece = int(rp->piece);
      int64_t piece_off = int64_t(piece) * session->piece_length;
      int64_t abs_begin = piece_off;
      int64_t abs_end = piece_off + rp->size;
      // Intersect with selected file
      int64_t file_begin = session->file_offset;
      int64_t file_end = session->file_offset + session->file_size;
      int64_t from = std::max(abs_begin, file_begin);
      int64_t to = std::min(abs_end, file_end);
      if (from >= to) continue;
      int buf_off = int(from - abs_begin);
      int len = int(to - from);
      int64_t file_rel = from - file_begin;
      if (session->cb.on_bytes) {
        session->cb.on_bytes(
          file_rel,
          reinterpret_cast<const uint8_t *>(rp->buffer.get()) + buf_off,
          len,
          session->cb.ctx
        );
      }
    } else if (auto *pf = lt::alert_cast<lt::piece_finished_alert>(a)) {
      if (pf->handle != session->handle || !session->has_meta) continue;
      // Ask libtorrent to give us the piece bytes
      session->handle.read_piece(pf->piece_index);
      static int finished_log = 0;
      if ((finished_log++ % 20) == 0) {
        log(session, std::string("piece finished #") + std::to_string(int(pf->piece_index))
          + " (store via read_piece)");
      }
    } else if (auto *err = lt::alert_cast<lt::torrent_error_alert>(a)) {
      log(session, std::string("torrent error: ") + err->message());
    } else if (auto *st = lt::alert_cast<lt::state_changed_alert>(a)) {
      log(session, std::string("state: ") + st->message());
    } else if (auto *pc = lt::alert_cast<lt::peer_connect_alert>(a)) {
      log(session, std::string("peer connect: ") + pc->message());
    } else if (auto *pd = lt::alert_cast<lt::peer_disconnected_alert>(a)) {
      // Only log interesting disconnects (handshake / metadata failures)
      auto const &ec = pd->error;
      if (ec) {
        log(session, std::string("peer drop: ") + pd->message());
      }
    } else if (auto *pe = lt::alert_cast<lt::peer_error_alert>(a)) {
      log(session, std::string("peer error: ") + pe->message());
    } else if (auto *tr = lt::alert_cast<lt::tracker_reply_alert>(a)) {
      log(session, std::string("tracker ok: ") + tr->tracker_url()
        + " peers=" + std::to_string(tr->num_peers));
    } else if (auto *te = lt::alert_cast<lt::tracker_error_alert>(a)) {
      // Downgrade chatter — "unreachable/skipping" is common on flaky UDP
      std::string msg = te->error.message();
      if (msg.find("unreachable") == std::string::npos
        && msg.find("skipping") == std::string::npos) {
        log(session, std::string("tracker err: ") + te->tracker_url()
          + " — " + msg);
      }
    } else if (auto *db = lt::alert_cast<lt::dht_bootstrap_alert>(a)) {
      log(session, std::string("dht bootstrap: ") + db->message());
    }
  }

  // Heartbeat every ~5s (ticker is 200ms)
  session->tick_count += 1;
  if (session->tick_count % 25 == 0) {
    int peers = 0;
    int seeds = 0;
    std::string state = "n/a";
    if (session->handle.is_valid()) {
      auto ts = session->handle.status();
      peers = ts.num_peers;
      seeds = ts.num_seeds;
      switch (ts.state) {
        case lt::torrent_status::checking_files: state = "checking"; break;
        case lt::torrent_status::downloading_metadata: state = "dl_metadata"; break;
        case lt::torrent_status::downloading: state = "downloading"; break;
        case lt::torrent_status::finished: state = "finished"; break;
        case lt::torrent_status::seeding: state = "seeding"; break;
        default: state = "other"; break;
      }
    }
    log(session,
      std::string("status peers=") + std::to_string(peers)
        + " seeds=" + std::to_string(seeds)
        + " state=" + state
        + " meta=" + (session->has_meta ? "yes" : "no")
        + " down=" + std::to_string(session->handle.is_valid()
            ? session->handle.status().total_wanted_done : 0)
        + "/" + std::to_string(session->file_size));
  }
}

extern "C" double saizen_lt_progress(SaizenLTSession *session) {
  if (!session) return 0;
  std::lock_guard<std::mutex> lock(session->mu);
  if (!session->handle.is_valid()) return 0;
  return session->handle.status().progress;
}

extern "C" int64_t saizen_lt_downloaded(SaizenLTSession *session) {
  if (!session) return 0;
  std::lock_guard<std::mutex> lock(session->mu);
  if (!session->handle.is_valid()) return 0;
  return session->handle.status().total_wanted_done;
}

extern "C" int saizen_lt_num_peers(SaizenLTSession *session) {
  if (!session) return 0;
  std::lock_guard<std::mutex> lock(session->mu);
  if (!session->handle.is_valid()) return 0;
  return session->handle.status().num_peers;
}

extern "C" int64_t saizen_lt_download_rate(SaizenLTSession *session) {
  if (!session) return 0;
  std::lock_guard<std::mutex> lock(session->mu);
  if (!session->handle.is_valid()) return 0;
  return session->handle.status().download_payload_rate;
}

#else

// Stubs when libtorrent is not linked — keep linker happy if file is compiled without flag.
#include "LibtorrentBridge.h"
#include <stdio.h>

extern "C" SaizenLTSession *saizen_lt_create(const char *, SaizenLTCallbacks) { return nullptr; }
extern "C" void saizen_lt_destroy(SaizenLTSession *) {}
extern "C" int saizen_lt_add_magnet(SaizenLTSession *, const char *) { return -100; }
extern "C" int saizen_lt_add_torrent_file(SaizenLTSession *, const char *) { return -100; }
extern "C" void saizen_lt_prioritize_bytes(SaizenLTSession *, int64_t, int64_t) {}
extern "C" void saizen_lt_focus_head(SaizenLTSession *, int64_t) {}
extern "C" void saizen_lt_tick(SaizenLTSession *) {}
extern "C" double saizen_lt_progress(SaizenLTSession *) { return 0; }
extern "C" int64_t saizen_lt_downloaded(SaizenLTSession *) { return 0; }
extern "C" int saizen_lt_num_peers(SaizenLTSession *) { return 0; }
extern "C" int64_t saizen_lt_download_rate(SaizenLTSession *) { return 0; }

#endif
