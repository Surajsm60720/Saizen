import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'

export function SettingsGroup({
  title,
  description,
  children,
  className
}: {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-3', className)}>
      <div>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        {children}
      </div>
    </section>
  )
}

export function SettingsRow({
  label,
  hint,
  children,
  className,
  showSeparator = false
}: {
  label: string
  hint?: string
  children?: React.ReactNode
  className?: string
  showSeparator?: boolean
}) {
  return (
    <>
      {showSeparator ? <Separator /> : null}
      <div
        className={cn(
          'flex min-h-12 items-center justify-between gap-3 px-3.5 py-2.5',
          className
        )}
      >
        <div className="min-w-0">
          <div className="text-sm font-medium">{label}</div>
          {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
        </div>
        {children}
      </div>
    </>
  )
}

export function PageHeader({
  title,
  description,
  action,
  dense = false,
  className
}: {
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  dense?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3',
        dense ? 'mb-4' : 'mb-6',
        className
      )}
    >
      <div className="min-w-0">
        <h1
          className={cn(
            dense ? 'text-page-title' : 'text-hero-title'
          )}
        >
          {title}
        </h1>
        {description ? (
          <div className="text-subhead mt-1.5">{description}</div>
        ) : null}
      </div>
      {action}
    </div>
  )
}
