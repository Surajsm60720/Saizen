import type { ClientSettings, DownloadQuality } from '@saizen/shared'
import getNative from '@/lib/native'

const KEY = 'saizen:downloads-settings'

export interface DownloadUiSettings {
  maxParallelDownloads: number
  wifiOnly: boolean
  preferredQuality: DownloadQuality
  /** Download cap in Mbps. 0 = unlimited. */
  torrentSpeed: number
  /** Peer / connection cap. */
  maxConns: number
}

const DEFAULTS: DownloadUiSettings = {
  maxParallelDownloads: 2,
  wifiOnly: true,
  preferredQuality: '1080p',
  torrentSpeed: 0,
  maxConns: 100
}

function clampParallel(n: number): number {
  if (!Number.isFinite(n)) return DEFAULTS.maxParallelDownloads
  return Math.min(3, Math.max(1, Math.round(n)))
}

function clampTorrentSpeed(n: number): number {
  if (!Number.isFinite(n)) return DEFAULTS.torrentSpeed
  return Math.min(100, Math.max(0, Math.round(n)))
}

function clampMaxConns(n: number): number {
  if (!Number.isFinite(n)) return DEFAULTS.maxConns
  return Math.min(300, Math.max(20, Math.round(n)))
}

export function getDownloadSettings(): DownloadUiSettings {
  if (typeof window === 'undefined') return { ...DEFAULTS }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<DownloadUiSettings>
    const q = parsed.preferredQuality
    return {
      maxParallelDownloads: clampParallel(
        parsed.maxParallelDownloads ?? DEFAULTS.maxParallelDownloads
      ),
      wifiOnly: parsed.wifiOnly ?? DEFAULTS.wifiOnly,
      preferredQuality:
        q === '2160p' || q === '1080p' || q === '720p' || q === '480p'
          ? q
          : DEFAULTS.preferredQuality,
      torrentSpeed: clampTorrentSpeed(parsed.torrentSpeed ?? DEFAULTS.torrentSpeed),
      maxConns: clampMaxConns(parsed.maxConns ?? DEFAULTS.maxConns)
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function setDownloadSettings(patch: Partial<DownloadUiSettings>): DownloadUiSettings {
  const next: DownloadUiSettings = {
    ...getDownloadSettings(),
    ...patch
  }
  next.maxParallelDownloads = clampParallel(next.maxParallelDownloads)
  next.torrentSpeed = clampTorrentSpeed(next.torrentSpeed)
  next.maxConns = clampMaxConns(next.maxConns)
  if (typeof window !== 'undefined') {
    localStorage.setItem(KEY, JSON.stringify(next))
  }
  const native = getNative()
  const payload: Partial<ClientSettings> = {
    maxParallelDownloads: next.maxParallelDownloads,
    wifiOnly: next.wifiOnly,
    preferredQuality: next.preferredQuality,
    torrentSpeed: next.torrentSpeed,
    maxConns: next.maxConns
  }
  void native.updateSettings(payload).catch(() => {})
  return next
}
