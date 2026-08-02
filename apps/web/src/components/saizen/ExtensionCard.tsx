import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { LoadedExtension } from '@/lib/extensions'

export function ExtensionCard({
  ext,
  busy,
  onToggle,
  onTest,
  className
}: {
  ext: LoadedExtension
  busy?: boolean
  onToggle: (enabled: boolean) => void
  onTest: () => void
  className?: string
}) {
  const id = `ext-${ext.manifest.id}`

  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-border/60 bg-card px-3 py-3 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {ext.manifest.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ext.manifest.icon}
            alt=""
            className="size-10 shrink-0 rounded-lg border border-border/50 object-cover"
          />
        ) : (
          <div className="size-10 shrink-0 rounded-lg border border-border/50 bg-muted" />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            {ext.manifest.name}{' '}
            <span className="font-normal text-muted-foreground">v{ext.manifest.version}</span>
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {ext.manifest.id}
            {ext.manifest.accuracy ? ` · ${ext.manifest.accuracy}` : ''}
            {ext.manifest.media ? ` · ${ext.manifest.media}` : ''}
            {ext.manifest.languages?.length
              ? ` · ${ext.manifest.languages.join(',')}`
              : ''}
          </div>
          {ext.loadError ? (
            <div className="mt-1 text-xs text-destructive">{ext.loadError}</div>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 self-end sm:self-center">
        <div className="flex items-center gap-2">
          <Switch
            id={id}
            checked={ext.enabled}
            disabled={busy}
            onCheckedChange={onToggle}
          />
          <Label htmlFor={id} className="text-xs text-muted-foreground">
            On
          </Label>
        </div>
        <Button variant="outline" size="sm" className="min-h-9" disabled={busy} onClick={onTest}>
          Test
        </Button>
      </div>
    </li>
  )
}
