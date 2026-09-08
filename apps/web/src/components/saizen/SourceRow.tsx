'use client'

import { cn } from '@/lib/utils'

/** Generic list wrapper for episode source / stream rows. */
export function SourceList({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) {
  return <ul className={cn('space-y-2', className)}>{children}</ul>
}
