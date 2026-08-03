import type { NativePlayerAction } from '@saizen/shared'

export const PLAYER_ACTION_EVENT = 'saizen:playerAction'
export const PENDING_PLAYER_ACTION_KEY = 'saizen:pendingPlayerAction'

export function dispatchPlayerAction(action: NativePlayerAction): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(PENDING_PLAYER_ACTION_KEY, JSON.stringify(action))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(PLAYER_ACTION_EVENT, { detail: action }))
}

export function consumePendingPlayerAction(): NativePlayerAction | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(PENDING_PLAYER_ACTION_KEY)
    if (!raw) return null
    sessionStorage.removeItem(PENDING_PLAYER_ACTION_KEY)
    return JSON.parse(raw) as NativePlayerAction
  } catch {
    return null
  }
}

export function onPlayerAction(cb: (action: NativePlayerAction) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<NativePlayerAction>).detail
    if (detail?.action) cb(detail)
  }
  window.addEventListener(PLAYER_ACTION_EVENT, handler)
  return () => window.removeEventListener(PLAYER_ACTION_EVENT, handler)
}
