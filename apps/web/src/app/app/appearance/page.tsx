'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { AccentPicker, PageHeader, SettingsGroup, SettingsRow } from '@/components/saizen'
import { Button } from '@/components/ui/button'
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
      <div className="mb-3">
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
        dense
        description="Deep black chrome with a custom accent."
      />

      <div className="space-y-5">
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

        <SettingsGroup title="Preview" description="How your accent reads across common UI.">
          <AppearancePreview />
        </SettingsGroup>
      </div>
    </>
  )
}

function AppearancePreview() {
  return (
    <div className="space-y-4 px-3.5 py-3.5">
      <div>
        <h3 className="text-section text-[1.2rem]">Accent preview</h3>
        <p className="text-meta mt-0.5">Primary actions pick up your accent live</p>
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
            Buttons and focus rings use your accent. Chrome stays deep black.
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
