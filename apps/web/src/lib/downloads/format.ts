import type { DownloadJob } from '@saizen/shared'

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} B`
}

export function formatFolderLabel(path: string): string {
  const trimmed = path.trim()
  if (!trimmed || trimmed === '—') return 'On This iPhone · Saizen Downloads'
  if (/\/Documents\/Saizen\/Downloads\/?$/i.test(trimmed) || /\/Saizen\/Downloads\/?$/i.test(trimmed)) {
    return 'On This iPhone · Saizen Downloads'
  }
  const parts = trimmed.split('/').filter(Boolean)
  const meaningful = parts.filter(
    (part) =>
      part !== 'private' &&
      part !== 'var' &&
      part !== 'mobile' &&
      part !== 'Containers' &&
      part !== 'Data' &&
      part !== 'Application' &&
      !/^[0-9A-Fa-f-]{36}$/.test(part)
  )
  const shown = (meaningful.length ? meaningful : parts).slice(-2)
  return shown.join(' / ') || 'On This iPhone · Saizen Downloads'
}

export function jobKindLabel(job: DownloadJob): string {
  const kind = (job.kind || '').toLowerCase()
  if (kind === 'hls') return 'HLS'
  if (kind === 'http' || kind === 'mp4') return 'MP4'
  if (kind === 'torrent' || kind === 'magnet') return 'Legacy'
  return kind ? kind.toUpperCase() : 'CDN'
}

export function jobSourceLabel(job: DownloadJob): string {
  const label = job.sourceLabel?.trim()
  if (label) return label
  return jobKindLabel(job)
}

export function statusLabel(status: DownloadJob['status']): string {
  switch (status) {
    case 'downloading':
      return 'Downloading'
    case 'paused':
      return 'Paused'
    case 'queued':
      return 'Queued'
    case 'failed':
      return 'Failed'
    case 'completed':
      return 'Done'
    default:
      return status
  }
}

/** Human-readable progress line — avoids bogus byte totals for HLS. */
export function formatJobProgress(job: DownloadJob): string {
  const pct = Math.round(Math.max(0, Math.min(1, job.progress)) * 100)
  const speed =
    job.speed > 0 && job.status === 'downloading' ? ` · ${formatBytes(job.speed)}/s` : ''

  if (job.kind === 'hls') {
    return `${pct}%${speed}`
  }

  if (job.size > 0) {
    return `${pct}% · ${formatBytes(job.downloaded)} / ${formatBytes(job.size)}${speed}`
  }

  return `${pct}% · ${formatBytes(job.downloaded)}${speed}`
}
