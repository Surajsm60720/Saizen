import Link from 'next/link'
import { PosterRail } from '@/components/saizen/PosterRail'
import { Button } from '@/components/ui/button'

export function HomePlaceholderRail({
  title,
  description,
  ctaHref = '/app/settings/',
  ctaLabel = 'Connect AniList',
  className
}: {
  title: string
  description: string
  ctaHref?: string
  ctaLabel?: string
  className?: string
}) {
  return (
    <PosterRail title={title} className={className}>
      <div className="flex min-h-[10.5rem] min-w-[min(100%,22rem)] flex-col justify-center rounded-xl border border-dashed border-border/70 bg-card/60 px-5 py-6">
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        <Button asChild variant="outline" size="sm" className="mt-4 w-fit min-h-9">
          <Link href={ctaHref}>{ctaLabel}</Link>
        </Button>
      </div>
    </PosterRail>
  )
}
