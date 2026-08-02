import { cn } from '@/lib/utils'

export type PersonRailItem = {
  id: number
  name: string
  role?: string | null
  /** Secondary line — e.g. voice actor name */
  detail?: string | null
  image?: string | null
  /** Small avatar overlay (VA face on character card) */
  overlayImage?: string | null
}

export function PersonRail({
  title,
  subtitle,
  people,
  className
}: {
  title: string
  subtitle?: string
  people: PersonRailItem[]
  className?: string
}) {
  if (!people.length) return null

  return (
    <section className={cn('space-y-3.5', className)}>
      <div>
        <div className="mb-1 h-0.5 w-8 rounded-full bg-primary/80" />
        <h2 className="font-heading text-2xl tracking-tight sm:text-[1.7rem]">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5">
        <ul className="flex gap-3">
          {people.map((p) => (
            <li key={`${p.id}-${p.role ?? ''}-${p.detail ?? ''}`} className="w-[5.75rem] shrink-0">
              <div className="overflow-hidden rounded-2xl bg-card/40 ring-1 ring-white/10">
                <div className="relative aspect-[3/4] bg-zinc-900">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                      —
                    </div>
                  )}
                  {p.overlayImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.overlayImage}
                      alt=""
                      className="absolute right-1 bottom-1 size-8 rounded-full object-cover ring-2 ring-[#141416]"
                    />
                  ) : null}
                </div>
                <div className="space-y-0.5 p-2">
                  <p className="truncate text-[0.72rem] font-medium leading-tight">{p.name}</p>
                  {p.detail ? (
                    <p className="truncate text-[0.62rem] text-primary/85">{p.detail}</p>
                  ) : null}
                  {p.role ? (
                    <p className="truncate text-[0.58rem] text-muted-foreground capitalize">
                      {p.role.replaceAll('_', ' ').toLowerCase()}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
