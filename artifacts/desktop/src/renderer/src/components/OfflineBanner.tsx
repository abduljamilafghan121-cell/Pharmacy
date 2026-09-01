import type { ReactElement } from 'react'
import { useState } from 'react'
import { WifiOff, RotateCw } from 'lucide-react'
import { getTheme } from '../theme'
import { useUiStore } from '../store/uiStore'
import { runReachabilityCheck } from '../hooks/useConnectivity'

/**
 * Global, theme-aware offline banner. Mounted app-wide; it renders nothing
 * while the server is reachable and only appears when connectivity is lost.
 * Includes a Retry action that re-runs the reachability check.
 */
export default function OfflineBanner(): ReactElement | null {
  const { dark, offline } = useUiStore()
  const [retrying, setRetrying] = useState(false)
  const theme = getTheme(dark)

  if (!offline) return null

  const retry = async (): Promise<void> => {
    if (retrying) return
    setRetrying(true)
    await runReachabilityCheck()
    setRetrying(false)
  }

  return (
    <div className="fixed bottom-6 left-1/2 z-[60] px-4 w-full max-w-xl animate-banner-in">
      <div
        style={{
          background: theme.card,
          border: '1px solid rgba(229,181,103,0.4)',
          boxShadow: theme.shadowLg
        }}
        className="flex items-center gap-3 px-4 py-3 rounded-2xl"
      >
        <span
          style={{ background: theme.amberBg, color: theme.amber }}
          className="p-2 rounded-xl shrink-0"
        >
          <WifiOff size={18} />
        </span>

        <div className="flex-1 min-w-0">
          <p style={{ color: theme.text }} className="text-sm font-semibold leading-tight">
            You're offline
          </p>
          <p style={{ color: theme.muted }} className="text-xs leading-tight mt-0.5 truncate">
            Can't reach the server. Reconnect to continue.
          </p>
        </div>

        <button
          onClick={() => void retry()}
          disabled={retrying}
          style={{
            color: theme.primary,
            border: `1px solid ${theme.borderStrong}`,
            background: theme.cardAlt
          }}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl transition-opacity hover:opacity-70 disabled:opacity-50 shrink-0"
        >
          <RotateCw size={13} className={retrying ? 'animate-spin' : ''} />
          {retrying ? 'Checking…' : 'Retry'}
        </button>
      </div>
    </div>
  )
}
