import { cn } from '@/lib/utils'

export function PosterRail({
  title,
  children,
  className,
  dense = false
}: {
  title: string
  children: React.ReactNode
  className?: string
  dense?: boolean
}) {
  return (
    <section className={cn(dense ? 'mt-6' : 'mt-8 sm:mt-10', className)}>
      <h2
        className={cn(
          'mb-3.5',
          dense ? 'text-section text-[1.25rem]' : 'text-section'
        )}
      >
        {title}
      </h2>
      <div
        className={cn(
          'flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none]',
          '[&::-webkit-scrollbar]:hidden',
          dense ? 'gap-2.5' : 'gap-3.5 sm:gap-4'
        )}
      >
        {children}
      </div>
    </section>
  )
}

export function PosterGrid({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5',
        className
      )}
    >
      {children}
    </div>
  )
}
