import Link from 'next/link'
import { PosterRail } from '@/components/saizen/PosterRail'
import { Button } from '@/components/ui/button'

export function HomePlaceholderRail({
  title,
  description,
  ctaHref = '/app/settings/',
  ctaLabel = 'Connect AniList'
}: {
  title: string
  description: string
  ctaHref?: string
  ctaLabel?: string
}) {
  return (
    <PosterRail title={title}>
      <div className="flex min-h-[9.5rem] min-w-[min(100%,22rem)] flex-col justify-center rounded-xl border border-dashed border-border/70 bg-card/60 px-4 py-5">
        <p className="text-sm text-muted-foreground">{description}</p>
        <Button asChild variant="outline" size="sm" className="mt-3 w-fit min-h-9">
          <Link href={ctaHref}>{ctaLabel}</Link>
        </Button>
      </div>
    </PosterRail>
  )
}
