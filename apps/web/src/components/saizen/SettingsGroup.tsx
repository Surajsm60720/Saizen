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
        <h2 className="text-subhead !text-muted-foreground uppercase tracking-[0.08em]">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/8 bg-card">
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
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{label}</div>
          {hint ? (
            <div className="mt-0.5 break-words text-xs leading-snug text-muted-foreground [overflow-wrap:anywhere]">
              {hint}
            </div>
          ) : null}
        </div>
        {children ? <div className="shrink-0">{children}</div> : null}
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
