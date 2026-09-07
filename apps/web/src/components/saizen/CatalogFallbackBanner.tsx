'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  getCatalogStatus,
  subscribeCatalogStatus,
  type CatalogProvider
} from '@/lib/catalog'
import { isMalConnected } from '@/lib/auth/tokens'
import { cn } from '@/lib/utils'

const DISMISS_KEY = 'saizen:catalog-fallback-dismissed-at'

export function CatalogFallbackBanner({ className }: { className?: string }) {
  const [provider, setProvider] = useState<CatalogProvider>('anilist')
  const [reason, setReason] = useState<string | null>(null)
  const [malOn, setMalOn] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const s = getCatalogStatus()
    setProvider(s.provider)
    setReason(s.reason)
    try {
      const raw = sessionStorage.getItem(DISMISS_KEY)
      if (raw && s.since && Number(raw) >= s.since) setDismissed(true)
    } catch {
      /* ignore */
    }
    return subscribeCatalogStatus((next) => {
      setProvider(next.provider)
      setReason(next.reason)
      if (next.provider === 'anilist') setDismissed(false)
    })
  }, [])

  useEffect(() => {
    if (provider !== 'jikan') return
    void isMalConnected().then(setMalOn)
  }, [provider])

  if (provider !== 'jikan' || dismissed) return null

  return (
    <div
      role="status"
      className={cn(
        'mx-auto flex w-full max-w-5xl items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100',
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-amber-50">AniList is unavailable</p>
        <p className="mt-0.5 text-amber-100/80">
          Showing MyAnimeList catalog (Tenrai)
          {malOn ? '. Your MAL list is used for personalization.' : '.'}
          {!malOn ? (
            <>
              {' '}
              <Link href="/app/settings" className="underline underline-offset-2">
                Connect MAL
              </Link>{' '}
              for list sync while AniList is down.
            </>
          ) : null}
          {reason ? (
            <span className="mt-1 block truncate text-xs text-amber-100/60">{reason}</span>
          ) : null}
        </p>
      </div>
      <button
        type="button"
        className="shrink-0 rounded-md px-2 py-1 text-xs text-amber-100/80 hover:bg-amber-500/20"
        onClick={() => {
          setDismissed(true)
          try {
            sessionStorage.setItem(DISMISS_KEY, String(Date.now()))
          } catch {
            /* ignore */
          }
        }}
      >
        Dismiss
      </button>
    </div>
  )
}
