'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { AccentPicker, PageHeader, SettingsGroup, SettingsRow } from '@/components/saizen'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  getAppearance,
  resetAppearance,
  setAppearance,
  type AppearanceState
} from '@/lib/theme/appearance'

export default function AppearancePage() {
  const [appearance, setAppearanceState] = useState<AppearanceState>(() => getAppearance())

  return (
    <>
      <div className="mb-4">
        <Link
          href="/app/settings/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Settings
        </Link>
      </div>
      <PageHeader
        title="Appearance"
        description="Deep black chrome, accent color, and liquid-glass intensity."
      />

      <div className="space-y-7">
        <SettingsGroup title="Color customization">
          <AccentPicker
            value={appearance}
            onChange={(patch) => setAppearanceState(setAppearance(patch))}
          />
          <SettingsRow label="Reset accent" hint="Gold on deep black" showSeparator>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAppearanceState(resetAppearance())}
            >
              Reset
            </Button>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup
          title="Liquid glass"
          description="Transparency for the tab bar and top chrome. Turn on Frosted for the iOS blur look."
        >
          <div className="space-y-3 px-3.5 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">Transparency</span>
              <span className="tabular-nums text-xs text-muted-foreground">
                {appearance.glass}%
              </span>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[appearance.glass]}
              onValueChange={(v) => {
                const next = Array.isArray(v) ? v[0] : v
                if (typeof next !== 'number') return
                setAppearanceState(setAppearance({ glass: next }))
              }}
              aria-label="Chrome transparency"
              className="w-full"
            />
            <div className="flex justify-between text-[0.65rem] text-muted-foreground">
              <span>Solid</span>
              <span>Clear</span>
            </div>
          </div>
          <SettingsRow
            label="Frosted"
            hint={
              appearance.frosted
                ? 'Blur on — more transparent also looks more frosted'
                : 'Off — clear tint only, no blur'
            }
            showSeparator
          >
            <Switch
              checked={appearance.frosted}
              onCheckedChange={(v) => setAppearanceState(setAppearance({ frosted: v }))}
              aria-label="Frosted glass"
            />
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup title="Preview" description="How your accent reads across common UI.">
          <AppearancePreview />
        </SettingsGroup>
      </div>
    </>
  )
}

function AppearancePreview() {
  return (
    <div className="space-y-4 px-3.5 py-4">
      <div>
        <h3 className="text-section text-[1.2rem]">Accent preview</h3>
        <p className="text-meta mt-1">Primary actions pick up your accent live</p>
      </div>

      <div className="flex gap-3">
        <div className="w-[5.5rem] shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-white/8">
          <div className="aspect-[2/3] bg-muted-foreground/15" />
          <div className="space-y-1 p-1.5">
            <div className="h-2 w-[85%] rounded bg-foreground/70" />
            <div className="h-1.5 w-1/2 rounded bg-muted-foreground/40" />
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-body text-muted-foreground">
            Buttons and focus rings use your accent. Drag glass while watching the tab bar.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm">Watch now</Button>
            <Button size="sm" variant="outline">
              Browse
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
