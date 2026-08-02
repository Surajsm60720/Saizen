'use client'

import { PageHeader, SettingsGroup, SettingsRow } from '@/components/saizen'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { HardDrive, Activity, Users } from 'lucide-react'

export default function ClientPage() {
  return (
    <>
      <PageHeader
        title="Torrent client"
        dense
        description="Live torrentInfo / peer stats will appear here while streaming."
        action={
          <Button variant="outline" size="sm" className="min-h-9" disabled>
            Refresh
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-3 gap-2">
        {[
          { label: 'Peers', value: '—', icon: Users },
          { label: 'Speed', value: '—', icon: Activity },
          { label: 'Buffered', value: '—', icon: HardDrive }
        ].map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.label}
              className="rounded-xl border border-border/60 bg-card px-3 py-3"
            >
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="size-3.5" />
                {stat.label}
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{stat.value}</div>
            </div>
          )
        })}
      </div>

      <SettingsGroup title="Active transfers" description="No session yet — play a source to populate.">
        <SettingsRow label="Session" hint="Idle">
          <Badge variant="secondary">None</Badge>
        </SettingsRow>
        <SettingsRow label="Piece store" hint="Disk-backed cache" showSeparator>
          <Badge variant="outline">Ready</Badge>
        </SettingsRow>
      </SettingsGroup>
    </>
  )
}
