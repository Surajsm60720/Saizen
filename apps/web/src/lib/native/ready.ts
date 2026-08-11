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
    // Unblock waiters if AppShell install is slow — do NOT mark ready early
    // (that made Watch call listModules/resolveStreams before Cap wired them).
    window.setTimeout(() => {
      const idx = waiters.indexOf(resolve)
      if (idx >= 0) waiters.splice(idx, 1)
      resolve()
    }, 5000)
  })
}
