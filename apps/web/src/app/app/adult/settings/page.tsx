'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { InstalledModule } from '@saizen/shared'
import { PageHeader, SettingsGroup, SettingsRow } from '@/components/saizen'
import { Switch } from '@/components/ui/switch'
import { ChevronRight } from 'lucide-react'
import { getNative } from '@/lib/native'
import { whenBridgeReady } from '@/lib/native/ready'
import {
  getAdultPrimaryModuleId,
  isAdultModeOn,
  setAdultMode,
  setAdultPrimaryModuleId,
  subscribeAdultMode
} from '@/lib/privacy/adult'
import { rememberCurrentScroll } from '@/lib/nav/scrollMemory'

function asModuleList(value: unknown): InstalledModule[] {
  return Array.isArray(value) ? (value as InstalledModule[]) : []
}

const selectClass =
  'h-11 w-full appearance-none rounded-lg border border-white/10 bg-[#1c1c1e] bg-[length:1rem] bg-[right_0.65rem_center] bg-no-repeat px-3 pr-9 text-base text-foreground outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/25'

const selectChevron = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239a9a9a' stroke-width='2'%3E%3Cpath d='m7 15 5 5 5-5'/%3E%3Cpath d='m7 9 5-5 5 5'/%3E%3C/svg%3E\")"
} as const

export default function AdultSettingsPage() {
  const [adultMode, setAdultModeState] = useState(false)
  const [primaryId, setPrimaryId] = useState<string | null>(null)
  const [modules, setModules] = useState<InstalledModule[]>([])
  const [loading, setLoading] = useState(true)

  const nsfwModules = useMemo(
    () => modules.filter((m) => m.nsfw === true),
    [modules]
  )
  const enabledNsfw = useMemo(
    () => nsfwModules.filter((m) => m.enabled),
    [nsfwModules]
  )

  const refreshModules = useCallback(async () => {
    const native = getNative()
    if (!native.listModules) {
      setModules([])
      return
    }
    const list = await native.listModules()
    setModules(asModuleList(list))
  }, [])

  useEffect(() => {
    setAdultModeState(isAdultModeOn())
    setPrimaryId(getAdultPrimaryModuleId())
    const unsub = subscribeAdultMode((on) => {
      setAdultModeState(on)
      setPrimaryId(getAdultPrimaryModuleId())
    })
    void whenBridgeReady()
      .then(() => refreshModules())
      .finally(() => setLoading(false))
    return unsub
  }, [refreshModules])

  function onPickPrimary(id: string) {
    const next = id.trim() || null
    setAdultPrimaryModuleId(next)
    setPrimaryId(next)
  }

  return (
    <>
      <PageHeader
        title="Adult content"
        description="One switch unlocks NSFW sources and the Adult tab. Off keeps everything on disk but hidden."
      />

      <div className="space-y-7">
        <SettingsGroup
          title="Master switch"
          description={
            adultMode
              ? 'Adult Mode is on. The Adult tab appears in the tab bar. NSFW modules and adult downloads are visible. Incognito was turned on the first time you enabled this (you can turn Incognito off anytime).'
              : 'Adult Mode is off. NSFW modules stay installed but do not appear. Adult downloads stay on disk but are hidden. The Adult tab and adult search are unavailable. Main Home and Search stay SFW.'
          }
        >
          <SettingsRow
            label="Adult Mode"
            hint={adultMode ? 'Unlocked' : 'Ghosted'}
          >
            <Switch
              checked={adultMode}
              onCheckedChange={(v) => {
                setAdultModeState(setAdultMode(v))
              }}
              aria-label="Adult Mode"
            />
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup
          title="Primary source"
          description="Adult home and search pull from one enabled NSFW module at a time."
        >
          {!adultMode ? (
            <div className="px-3.5 py-3 text-sm text-muted-foreground">
              Turn on Adult Mode to choose a primary source.
            </div>
          ) : loading ? (
            <div className="px-3.5 py-3 text-sm text-muted-foreground">Loading modules…</div>
          ) : enabledNsfw.length === 0 ? (
            <div className="space-y-2 px-3.5 py-3 text-sm text-muted-foreground">
              <p>No enabled NSFW modules yet.</p>
              <Link
                href="/app/adult/modules/"
                scroll={false}
                onClick={() => rememberCurrentScroll()}
                className="inline-flex items-center gap-1 text-primary"
              >
                Open Adult modules <ChevronRight className="size-4" />
              </Link>
            </div>
          ) : (
            <div className="px-3.5 py-3">
              <label htmlFor="adult-primary" className="sr-only">
                Primary NSFW module
              </label>
              <select
                id="adult-primary"
                className={selectClass}
                style={selectChevron}
                value={primaryId && enabledNsfw.some((m) => m.id === primaryId) ? primaryId : ''}
                onChange={(e) => onPickPrimary(e.target.value)}
              >
                <option value="" disabled>
                  Choose a source…
                </option>
                {enabledNsfw.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </SettingsGroup>

        <SettingsGroup title="Manage sources">
          <Link
            href="/app/adult/modules/"
            scroll={false}
            onClick={() => rememberCurrentScroll()}
            className="flex min-h-12 items-center justify-between gap-3 px-3.5 py-2.5 text-foreground transition-colors hover:bg-muted/40"
          >
            <div>
              <div className="text-sm font-medium">Adult modules</div>
              <div className="text-xs text-muted-foreground">
                Install and enable NSFW stream sources
              </div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        </SettingsGroup>

        {adultMode && nsfwModules.length > 0 && enabledNsfw.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">
            You have {nsfwModules.length} NSFW module(s) installed but none enabled. Enable one in
            Adult modules, then pick it as primary here.
          </p>
        ) : null}
      </div>
    </>
  )
}
