import { useEffect } from 'react'
import { apiUrl } from '../lib/apiClient'
import { useUiStore } from '../store/uiStore'

const POLL_MS = 15000
const TIMEOUT_MS = 4000

// Module-level guard so overlapping checks (interval + event + manual retry)
// never fire concurrently.
let checking = false

/**
 * Performs a lightweight, unauthenticated reachability check against the
 * API's /healthz endpoint. Returns true only when the server actually
 * responds OK — this catches "internet is down", DNS failures, captive
 * portals and an unreachable server, none of which `navigator.onLine` alone
 * can detect.
 */
export async function serverReachable(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS)
    const res = await fetch(apiUrl('healthz'), {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    })
    window.clearTimeout(timer)
    return res.ok
  } catch {
    return false
  }
}

/**
 * Runs a reachability check and syncs the result into the UI store's global
 * `offline` flag. Returns whether the server is reachable. Safe to call from
 * anywhere (the offline banner's Retry button, event handlers, polling).
 */
export async function runReachabilityCheck(): Promise<boolean> {
  const setOffline = useUiStore.getState().setOffline
  if (checking) return !useUiStore.getState().offline
  checking = true
  try {
    const browserOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
    const reachable = browserOnline ? await serverReachable() : false
    setOffline(!reachable)
    return reachable
  } finally {
    checking = false
  }
}

/**
 * Keeps the app's connectivity state in sync. Call once near the root:
 *  - reacts immediately to the browser's online/offline events,
 *  - re-checks on window focus,
 *  - and polls the health endpoint every ~15s to catch provider/network
 *    outages the browser doesn't report.
 */
export function useConnectivity(): void {
  const setOffline = useUiStore((s) => s.setOffline)

  useEffect(() => {
    let disposed = false

    const refresh = async (): Promise<void> => {
      if (disposed) return
      await runReachabilityCheck()
    }

    void refresh()

    const onEvent = (): void => {
      void refresh()
    }
    window.addEventListener('online', onEvent)
    window.addEventListener('offline', onEvent)
    window.addEventListener('focus', onEvent)
    const timer = window.setInterval(() => void refresh(), POLL_MS)

    return () => {
      disposed = true
      setOffline(false)
      window.removeEventListener('online', onEvent)
      window.removeEventListener('offline', onEvent)
      window.removeEventListener('focus', onEvent)
      window.clearInterval(timer)
    }
  }, [setOffline])
}
