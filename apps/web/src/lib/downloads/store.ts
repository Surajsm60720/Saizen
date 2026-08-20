'use client'

import { useCallback, useSyncExternalStore } from 'react'
import getNative from '@/lib/native'
import type { DownloadJob, LibraryEntry, StorageUsage } from '@saizen/shared'

const METADATA_REFRESH_MS = 10_000
const NATIVE_TIMEOUT_MS = 12_000

export interface DownloadStoreSnapshot {
  jobs: DownloadJob[]
  library: LibraryEntry[]
  usage: StorageUsage
  folder: string
  started: boolean
  refreshing: boolean
  lastError: string | null
}

type StoreListener = () => void

const EMPTY_USAGE: StorageUsage = { libraryBytes: 0, cacheBytes: 0, freeBytes: 0 }

function librarySignature(entries: LibraryEntry[]): string {
  return entries
    .map((e) => `${e.id}:${e.size}:${e.date}`)
    .sort()
    .join('|')
}

async function withTimeout<T>(promise: Promise<T>, label: string, ms = NATIVE_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

class DownloadStore {
  private listeners = new Set<StoreListener>()
  private nativeUnsub: (() => void) | null = null
  private startPromise: Promise<void> | null = null
  private metadataTimer: ReturnType<typeof setTimeout> | null = null
  private metadataInFlight = false
  private lastLibrarySig = ''
  private lastCompletedJobSig = ''
  private lastMetadataAt = 0

  private snapshot: DownloadStoreSnapshot = {
    jobs: [],
    library: [],
    usage: EMPTY_USAGE,
    folder: '—',
    started: false,
    refreshing: false,
    lastError: null
  }

  subscribe = (listener: StoreListener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): DownloadStoreSnapshot => this.snapshot

  private emit() {
    for (const listener of this.listeners) listener()
  }

  private patch(partial: Partial<DownloadStoreSnapshot>) {
    this.snapshot = { ...this.snapshot, ...partial }
    this.emit()
  }

  /** Call once after the native bridge is ready (AppShell). */
  start(): Promise<void> {
    if (this.startPromise) return this.startPromise
    this.startPromise = this.bootstrap()
    return this.startPromise
  }

  private async bootstrap() {
    const native = getNative()
    if (!native.isApp) {
      this.patch({ started: true })
      return
    }

    try {
      await this.refreshMetadata({ force: true })
    } catch (e) {
      this.patch({
        lastError: e instanceof Error ? e.message : String(e)
      })
    }

    if (!this.nativeUnsub && native.onDownloadProgress) {
      try {
        const ret = await native.onDownloadProgress((jobs, librarySnap) => {
          this.onNativeProgress(jobs, librarySnap)
        })
        this.nativeUnsub = typeof ret === 'function' ? ret : ret
      } catch (e) {
        this.patch({
          lastError: e instanceof Error ? e.message : String(e)
        })
      }
    }

    this.patch({ started: true })
  }

  private onNativeProgress(jobs: DownloadJob[], librarySnap?: LibraryEntry[]) {
    const next: Partial<DownloadStoreSnapshot> = { jobs, lastError: null }

    if (librarySnap) {
      next.library = librarySnap
      this.lastLibrarySig = librarySignature(librarySnap)
      this.lastCompletedJobSig = jobs
        .filter((j) => j.status === 'completed')
        .map((j) => j.id)
        .sort()
        .join('|')
      this.lastMetadataAt = Date.now()
    } else {
      const completedSig = jobs
        .filter((j) => j.status === 'completed')
        .map((j) => j.id)
        .sort()
        .join('|')
      if (completedSig !== this.lastCompletedJobSig) {
        this.lastCompletedJobSig = completedSig
        void this.refreshMetadata({ force: true })
      }
    }

    this.patch(next)
    this.scheduleMetadataRefresh()
  }

  private scheduleMetadataRefresh() {
    if (this.metadataTimer) return
    const elapsed = Date.now() - this.lastMetadataAt
    const delay = Math.max(500, METADATA_REFRESH_MS - elapsed)
    this.metadataTimer = setTimeout(() => {
      this.metadataTimer = null
      void this.refreshMetadata()
    }, delay)
  }

  async refreshMetadata(options?: { force?: boolean }): Promise<void> {
    const native = getNative()
    if (!native.isApp) return
    if (this.metadataInFlight) return

    const now = Date.now()
    if (!options?.force && now - this.lastMetadataAt < METADATA_REFRESH_MS) return

    this.metadataInFlight = true
    try {
      const [jobs, lib, usage, folder] = await Promise.all([
        withTimeout(native.downloadQueue?.() ?? Promise.resolve([]), 'downloadQueue'),
        withTimeout(native.library(), 'library'),
        withTimeout(
          native.storageUsage?.() ?? Promise.resolve(EMPTY_USAGE),
          'storageUsage'
        ),
        withTimeout(
          native.downloadFolder?.() ?? Promise.resolve({ path: '' }),
          'downloadFolder'
        )
      ])
      const sig = librarySignature(lib)
      this.lastLibrarySig = sig
      this.lastMetadataAt = Date.now()
      this.patch({
        jobs,
        library: lib,
        usage,
        folder: folder.path || 'On My iPhone / Saizen / Downloads',
        lastError: null
      })
    } catch {
      /* keep last good snapshot on background refresh failure */
    } finally {
      this.metadataInFlight = false
    }
  }

  async refreshAll(): Promise<void> {
    this.patch({ refreshing: true })
    try {
      await this.refreshMetadata({ force: true })
    } finally {
      this.patch({ refreshing: false })
    }
  }

  async pauseDownload(id: string): Promise<void> {
    const native = getNative()
    await withTimeout(native.pauseDownload?.(id) ?? Promise.resolve(), 'pauseDownload')
    await this.refreshMetadata({ force: true })
  }

  async resumeDownload(id: string): Promise<void> {
    const native = getNative()
    await withTimeout(native.resumeDownload?.(id) ?? Promise.resolve(), 'resumeDownload')
    await this.refreshMetadata({ force: true })
  }

  async cancelDownload(id: string): Promise<void> {
    const native = getNative()
    await withTimeout(native.cancelDownload?.(id) ?? Promise.resolve(), 'cancelDownload')
    await this.refreshMetadata({ force: true })
  }

  async deleteLibraryItems(ids: string[]): Promise<void> {
    const native = getNative()
    const trimmed = ids.map((id) => id.trim()).filter(Boolean)
    if (!trimmed.length) return
    await withTimeout(native.deleteTorrents(trimmed), 'deleteTorrents')
    await this.refreshMetadata({ force: true })
  }

  async clearCache(): Promise<void> {
    const native = getNative()
    await withTimeout(native.clearCache?.() ?? Promise.resolve(), 'clearCache')
    await this.refreshMetadata({ force: true })
  }

  async pickDownloadFolder(): Promise<string> {
    const native = getNative()
    const result = await withTimeout(
      native.pickDownloadFolder?.() ?? Promise.resolve({ path: '' }),
      'pickDownloadFolder',
      120_000
    )
    await this.refreshMetadata({ force: true })
    return result.path
  }

  async resetDownloadFolder(): Promise<string> {
    const native = getNative()
    const result = await withTimeout(
      native.resetDownloadFolder?.() ?? Promise.resolve({ path: '' }),
      'resetDownloadFolder'
    )
    await this.refreshMetadata({ force: true })
    return result.path
  }
}

export const downloadStore = new DownloadStore()

export function initDownloadStore(): void {
  void downloadStore.start()
}

export function useDownloadStore(): DownloadStoreSnapshot {
  return useSyncExternalStore(
    downloadStore.subscribe,
    downloadStore.getSnapshot,
    downloadStore.getSnapshot
  )
}

export function useDownloadActions() {
  const refreshAll = useCallback(() => downloadStore.refreshAll(), [])
  const pauseDownload = useCallback((id: string) => downloadStore.pauseDownload(id), [])
  const resumeDownload = useCallback((id: string) => downloadStore.resumeDownload(id), [])
  const cancelDownload = useCallback((id: string) => downloadStore.cancelDownload(id), [])
  const deleteLibraryItems = useCallback(
    (ids: string[]) => downloadStore.deleteLibraryItems(ids),
    []
  )
  const clearCache = useCallback(() => downloadStore.clearCache(), [])
  const pickDownloadFolder = useCallback(() => downloadStore.pickDownloadFolder(), [])
  const resetDownloadFolder = useCallback(() => downloadStore.resetDownloadFolder(), [])

  return {
    refreshAll,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    deleteLibraryItems,
    clearCache,
    pickDownloadFolder,
    resetDownloadFolder
  }
}

/** Subscribe to library changes for a specific media id (anime page badges). */
export function subscribeLibraryForMedia(
  mediaId: number,
  cb: (entries: LibraryEntry[]) => void
): () => void {
  const handler = () => {
    const { library } = downloadStore.getSnapshot()
    cb(library.filter((e) => e.mediaId === mediaId))
  }
  handler()
  return downloadStore.subscribe(handler)
}
