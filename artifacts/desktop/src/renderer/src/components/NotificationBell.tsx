import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Bell, AlertTriangle, Clock, FileText } from 'lucide-react'
import { useGetInventoryReport, useListPrescriptions, getGetInventoryReportQueryKey, getListPrescriptionsQueryKey } from '@workspace/api-client-react'
import { useUiStore } from '../store/uiStore'
import { getTheme } from '../theme'
import { useAuth } from '../hooks/useAuth'

// Ported from artifacts/web/src/components/layout/NotificationBell.tsx.
// Same role-based enabling and same two generated queries — web shows a
// dropdown-menu, desktop shows a small pop-over panel since it has no
// dropdown primitive. No polling: plain react-query semantics, exactly
// like web.

export default function NotificationBell(): ReactElement | null {
  const { dark, setScreen } = useUiStore()
  const theme = getTheme(dark)
  const { user, isAuthenticated } = useAuth()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const canSeeInventoryAlerts = !!user && ['admin', 'pharmacist', 'viewer'].includes(user.role)
  const canSeePrescriptionAlerts = !!user && ['admin', 'pharmacist', 'cashier', 'viewer'].includes(user.role)

  const { data: inventory } = useGetInventoryReport({ query: { enabled: isAuthenticated && canSeeInventoryAlerts, queryKey: getGetInventoryReportQueryKey() } })
  const { data: prescriptions } = useListPrescriptions({ query: { enabled: isAuthenticated && canSeePrescriptionAlerts, queryKey: getListPrescriptionsQueryKey() } })

  const lowStockCount = canSeeInventoryAlerts ? (inventory?.lowStockCount ?? 0) : 0
  const expiringCount = canSeeInventoryAlerts ? (inventory?.expiringCount ?? 0) : 0
  const pendingRxCount = canSeePrescriptionAlerts
    ? (prescriptions ?? []).filter((p) => p.status === 'pending').length
    : 0

  const total = lowStockCount + expiringCount + pendingRxCount

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!isAuthenticated) return null

  const chromeHover = dark ? 'hover:bg-white/10' : 'hover:bg-black/[0.06]'
  const chipBg = dark ? 'rgba(255,255,255,0.05)' : 'rgba(15,31,27,0.04)'
  const chipBorder = dark ? 'rgba(255,255,255,0.07)' : theme.border

  const go = (screen: 'inventory' | 'prescriptions'): void => {
    setOpen(false)
    setScreen(screen)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Notifications"
        aria-label="Notifications"
        className={`relative p-1.5 rounded-lg transition-colors ${chromeHover}`}
        style={{ background: open ? (dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,31,27,0.07)') : chipBg, border: `1px solid ${chipBorder}` }}
      >
        <Bell size={13} color={theme.onSidebarMuted} />
        {total > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-semibold flex items-center justify-center"
            style={{ boxShadow: `0 0 0 2px ${theme.sidebar}` }}
          >
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            background: theme.card,
            border: `1px solid ${theme.borderStrong}`,
            boxShadow: theme.shadowLg
          }}
          className="absolute right-0 top-[calc(100%+8px)] w-72 rounded-xl overflow-hidden z-50 animate-scale-in"
        >
          <div
            style={{ ...{ color: theme.muted }, borderBottom: `1px solid ${theme.border}` }}
            className="px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider"
          >
            Alerts
          </div>
          {total === 0 ? (
            <p style={{ color: theme.muted }} className="px-3.5 py-4 text-xs text-center">
              Nothing needs attention right now.
            </p>
          ) : (
            <div className="py-1" style={{ '--row-hover': theme.hover } as React.CSSProperties}>
              {lowStockCount > 0 && (
                <button
                  onClick={() => go('inventory')}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-xs transition-colors hover:bg-[color:var(--row-hover)]"
                  style={{ color: theme.text }}
                >
                  <AlertTriangle size={14} color={theme.amber} className="shrink-0" />
                  <span>
                    {lowStockCount} medicine{lowStockCount !== 1 ? 's' : ''} low on stock
                  </span>
                </button>
              )}
              {expiringCount > 0 && (
                <button
                  onClick={() => go('inventory')}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-xs transition-colors hover:bg-[color:var(--row-hover)]"
                  style={{ color: theme.text }}
                >
                  <Clock size={14} color={theme.red} className="shrink-0" />
                  <span>
                    {expiringCount} medicine{expiringCount !== 1 ? 's' : ''} expiring within 30 days
                  </span>
                </button>
              )}
              {pendingRxCount > 0 && (
                <button
                  onClick={() => go('prescriptions')}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-xs transition-colors hover:bg-[color:var(--row-hover)]"
                  style={{ color: theme.text }}
                >
                  <FileText size={14} color={theme.primaryText} className="shrink-0" />
                  <span>
                    {pendingRxCount} prescription{pendingRxCount !== 1 ? 's' : ''} awaiting verification
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
