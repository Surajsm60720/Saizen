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
        <div className="mb-1 h-0.5 w-8 rounded-full bg-primary/80" />
        <h3 className="text-section text-[1.2rem]">Opening & Ending</h3>
        <p className="text-meta mt-0.5">Tap a theme to copy — sample section</p>
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-r from-white/[0.04] to-transparent px-3 py-2.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 font-heading text-xs font-semibold tracking-wide text-primary ring-1 ring-primary/25">
          OP1
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-body truncate font-semibold leading-snug">Sample Theme Song</div>
          <div className="text-meta mt-0.5 truncate">Artist Name</div>
        </div>
        <span className="shrink-0 text-[0.7rem] font-medium text-muted-foreground">Copy</span>
      </div>

      <div className="flex gap-3">
        <div className="w-[5.5rem] shrink-0 overflow-hidden rounded-xl bg-card/40 ring-2 ring-primary/40">
          <div className="aspect-[2/3] bg-gradient-to-b from-white/10 to-white/[0.03]" />
          <div className="space-y-1 p-1.5">
            <div className="h-2 w-[85%] rounded bg-foreground/80" />
            <div className="h-1.5 w-1/2 rounded bg-muted-foreground/50" />
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-body text-muted-foreground">
            Primary actions, chips, and poster rings pick up your accent live.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary ring-1 ring-primary/25">
              Action
            </span>
            <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary ring-1 ring-primary/25">
              Fantasy
            </span>
            <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-muted-foreground ring-1 ring-white/10">
              Trending
            </span>
          </div>
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
