'use client'

import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

export type HapticKind = 'light' | 'medium' | 'selection' | 'success' | 'warning'

function reducedMotion(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Native Taptic Engine only — web/iOS Safari Vibration API is a no-op on iPhone. */
export async function haptic(kind: HapticKind = 'light'): Promise<void> {
  if (typeof window === 'undefined') return
  if (!Capacitor.isNativePlatform()) return
  if (reducedMotion()) return
  try {
    switch (kind) {
      case 'medium':
        await Haptics.impact({ style: ImpactStyle.Medium })
        break
      case 'selection':
        await Haptics.selectionChanged()
        break
      case 'success':
        await Haptics.notification({ type: NotificationType.Success })
        break
      case 'warning':
        await Haptics.notification({ type: NotificationType.Warning })
        break
      case 'light':
      default:
        await Haptics.impact({ style: ImpactStyle.Light })
        break
    }
  } catch {
    /* Simulator / unsupported — silent */
  }
}

export function hapticPress(kind: HapticKind = 'light'): void {
  void haptic(kind)
}
