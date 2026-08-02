'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { PageHeader, SettingsGroup, SettingsRow } from '@/components/saizen'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ChevronRight } from 'lucide-react'
import {
  getWatchSettings,
  setWatchSettings,
  type WatchSettings
} from '@/lib/watch/settings'
import {
  connectAnilist,
  connectMal,
  disconnectAnilist,
  disconnectMal,
  getOAuthCredentials,
  isAnilistConnected,
  isMalConnected
} from '@/lib/auth'
import getNative from '@/lib/native'
import { APP_VERSION_LABEL } from '@/lib/version'

export default function SettingsPage() {
  const [settings, setSettings] = useState<WatchSettings>(() => ({
    markWatchedAtPercent: 90,
    continueWatchingEnabled: true
  }))
  const [anilistOn, setAnilistOn] = useState(false)
  const [malOn, setMalOn] = useState(false)
  const [busy, setBusy] = useState<'anilist' | 'mal' | null>(null)
  const isApp = typeof window !== 'undefined' ? getNative().isApp : false
  const creds = getOAuthCredentials()
  const canAnilist = Boolean(creds.anilistClientId)
  const canMal = Boolean(creds.malClientId)

  useEffect(() => {
    setSettings(getWatchSettings())
    void Promise.all([isAnilistConnected(), isMalConnected()]).then(([a, m]) => {
      setAnilistOn(a)
      setMalOn(m)
    })
  }, [])

  function patch(next: Partial<WatchSettings>) {
    setSettings(setWatchSettings(next))
  }

  async function onConnectAnilist() {
    setBusy('anilist')
    try {
      await connectAnilist()
      setAnilistOn(true)
      toast.success('Signed in with AniList')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function onDisconnectAnilist() {
    await disconnectAnilist()
    setAnilistOn(false)
    toast.message('AniList signed out')
  }

  async function onConnectMal() {
    setBusy('mal')
    try {
      await connectMal()
      setMalOn(true)
      toast.success('Signed in with MyAnimeList')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function onDisconnectMal() {
    await disconnectMal()
    setMalOn(false)
    toast.message('MyAnimeList signed out')
  }

  return (
    <>
      <PageHeader
        title="Settings"
        dense
        description="Sign in with your AniList or MAL account — Saizen handles the rest."
      />

      <div className="space-y-5">
        <SettingsGroup title="Playback" description="Defaults for the native and web players.">
          <SettingsRow label="Prefer VLC for MKV / HEVC" hint="Recommended on iOS">
            <Switch defaultChecked aria-label="Prefer VLC" />
          </SettingsRow>
          <SettingsRow label="Early open" hint="Launch player as soon as a stream URL exists" showSeparator>
            <Switch defaultChecked aria-label="Early open" />
          </SettingsRow>
          <SettingsRow label="Default quality" hint="When multiple sources match" showSeparator>
            <Badge variant="secondary">1080p</Badge>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup
          title="Watch progress"
          description="Local tracking. Connected lists update when you hit the mark-watched threshold."
        >
          <SettingsRow label="Continue watching" hint="Show resume rail on Home">
            <Switch
              checked={settings.continueWatchingEnabled}
              onCheckedChange={(v) => patch({ continueWatchingEnabled: v })}
              aria-label="Continue watching"
            />
          </SettingsRow>
          <SettingsRow
            label="Mark watched at"
            hint={`${settings.markWatchedAtPercent}% of the episode`}
            showSeparator
          >
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={70}
                max={100}
                step={5}
                value={settings.markWatchedAtPercent}
                onChange={(e) =>
                  patch({ markWatchedAtPercent: Number(e.target.value) })
                }
                className="w-28 accent-[var(--primary)]"
                aria-label="Mark watched percentage"
              />
              <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">
                {settings.markWatchedAtPercent}%
              </span>
            </div>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup
          title="Accounts"
          description={
            isApp
              ? 'Sign in with your own AniList / MAL account to sync watch progress.'
              : 'Sign-in requires the iOS app.'
          }
        >
          <SettingsRow
            label="AniList"
            hint={anilistOn ? 'Signed in' : 'Sign in with your AniList account'}
          >
            {anilistOn ? (
              <Button size="sm" variant="outline" onClick={() => void onDisconnectAnilist()}>
                Sign out
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={busy === 'anilist' || !canAnilist || !isApp}
                onClick={() => void onConnectAnilist()}
              >
                {busy === 'anilist' ? '…' : 'Sign in'}
              </Button>
            )}
          </SettingsRow>
          <SettingsRow
            label="MyAnimeList"
            hint={malOn ? 'Signed in' : 'Sign in with your MAL account'}
            showSeparator
          >
            {malOn ? (
              <Button size="sm" variant="outline" onClick={() => void onDisconnectMal()}>
                Sign out
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={busy === 'mal' || !canMal || !isApp}
                onClick={() => void onConnectMal()}
              >
                {busy === 'mal' ? '…' : 'Sign in'}
              </Button>
            )}
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup title="About">
          <SettingsRow label="Version" hint="Saizen for iOS">
            <Badge variant="secondary">{APP_VERSION_LABEL}</Badge>
          </SettingsRow>
          <Link
            href="/app/changelog/"
            className="flex min-h-12 items-center justify-between gap-3 border-t border-border/60 px-3.5 py-2.5 text-foreground transition-colors hover:bg-muted/40"
          >
            <div>
              <div className="text-sm font-medium">Changelog</div>
              <div className="text-xs text-muted-foreground">
                What’s new in {APP_VERSION_LABEL}
              </div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        </SettingsGroup>

        <SettingsGroup title="More">
          <Link
            href="/app/schedule/"
            className="flex min-h-12 items-center justify-between gap-3 px-3.5 py-2.5 text-foreground transition-colors hover:bg-muted/40"
          >
            <div>
              <div className="text-sm font-medium">Schedule</div>
              <div className="text-xs text-muted-foreground">Airing calendar</div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
          <Link
            href="/app/extensions/"
            className="flex min-h-12 items-center justify-between gap-3 border-t border-border/60 px-3.5 py-2.5 text-foreground transition-colors hover:bg-muted/40"
          >
            <div>
              <div className="text-sm font-medium">Extensions</div>
              <div className="text-xs text-muted-foreground">Torrent catalogs</div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
          <Link
            href="/app/client/"
            className="flex min-h-12 items-center justify-between gap-3 border-t border-border/60 px-3.5 py-2.5 text-foreground transition-colors hover:bg-muted/40"
          >
            <div>
              <div className="text-sm font-medium">Torrent client</div>
              <div className="text-xs text-muted-foreground">Peers, speed, buffer</div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        </SettingsGroup>
      </div>
    </>
  )
}
