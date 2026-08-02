/** Fired on window after Capacitor bridge is installed (or web fallback ready). */
export const BRIDGE_READY_EVENT = 'saizen:bridge-ready'

let bridgeReady = false
const waiters: Array<() => void> = []

export function markBridgeReady() {
  bridgeReady = true
  window.dispatchEvent(new Event(BRIDGE_READY_EVENT))
  while (waiters.length) waiters.shift()?.()
}

export function isBridgeReady() {
  return bridgeReady
}

/** Resolves once native bridge install has finished (or immediately on web). */
export function whenBridgeReady(): Promise<void> {
  if (bridgeReady || typeof window === 'undefined') return Promise.resolve()
  return new Promise((resolve) => {
    if (bridgeReady) {
      resolve()
      return
    }
    waiters.push(resolve)
    // Safety timeout so Home never hangs forever
    window.setTimeout(() => {
      if (!bridgeReady) markBridgeReady()
    }, 800)
  })
}
