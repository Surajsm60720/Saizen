import type { ClientSettings, DownloadQuality } from '@saizen/shared'
import getNative from '@/lib/native'

const KEY = 'saizen:downloads-settings'

export interface DownloadUiSettings {
  maxParallelDownloads: number
  wifiOnly: boolean
  preferredQuality: DownloadQuality
}

const DEFAULTS: DownloadUiSettings = {
  maxParallelDownloads: 2,
  wifiOnly: true,
  preferredQuality: '1080p'
}

function clampParallel(n: number): number {
  if (!Number.isFinite(n)) return DEFAULTS.maxParallelDownloads
  return Math.min(3, Math.max(1, Math.round(n)))
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
          : DEFAULTS.preferredQuality
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
  if (typeof window !== 'undefined') {
    localStorage.setItem(KEY, JSON.stringify(next))
  }
  const native = getNative()
  const payload: Partial<ClientSettings> = {
    maxParallelDownloads: next.maxParallelDownloads,
    wifiOnly: next.wifiOnly,
    preferredQuality: next.preferredQuality
  }
  void native.updateSettings(payload).catch(() => {})
  return next
}
