'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { isAdultModeOn, subscribeAdultMode } from '@/lib/privacy/adult'

/**
 * Redirects to Home when Adult Mode is off.
 * Use on Adult browse/search/title — not on Adult settings (reachable to explain/toggle).
 */
export function AdultModeGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    const enforce = (on: boolean) => {
      if (!on) router.replace('/', { scroll: false })
    }
    enforce(isAdultModeOn())
    return subscribeAdultMode(enforce)
  }, [router])

  if (!isAdultModeOn()) {
    return (
      <div className="px-4 py-10 text-center text-sm text-muted-foreground">
        Adult Mode is off…
      </div>
    )
  }

  return <>{children}</>
}
