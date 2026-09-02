import type { ReactElement } from 'react'
import {
  TrendingUp,
  TrendingDown,
  PackageX,
  CalendarClock,
  ArrowRight,
  Plus,
  Mail,
  Receipt as ReceiptIcon,
  ClipboardList,
  PackagePlus,
  Loader2
} from 'lucide-react'
import { useGetSalesReport, useGetTopMedicines, useListOrders, type Order } from '@workspace/api-client-react'
import { useUiStore } from '../store/uiStore'
import { getTheme, mono, serif } from '../theme'
import { useInventory } from '../hooks/useInventory'

// The generated Order type hasn't caught up with the API yet — the server does
// return patientName on order rows (see artifacts/api-server/src/routes/orders.ts).
type RecentOrderRow = Order & { patientName?: string | null }
import { useAuth } from '../hooks/useAuth'
import { usePharmacySettings, formatCurrency } from '../hooks/usePharmacySettings'
import { useSendDigest } from '../hooks/useNotifications'
import StatCard from '../components/StatCard'

function timeOfDayGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

// Local date (not UTC) as YYYY-MM-DD, to match how a person reads "today" —
// toISOString() would roll over at UTC midnight, which is wrong for anyone
// west of Greenwich.
function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface PanelProps {
  title: string
  color: string
  rows: { id: string; name: string }[]
  renderValue: (row: { id: string; name: string }) => React.ReactNode
  onViewAll?: () => void
  Icon: typeof PackageX
}

function Panel({ title, color, rows, renderValue, onViewAll, Icon }: PanelProps): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)
  return (
    <div
      style={{
        background: theme.card,
        border: `1px solid ${theme.border}`,
        boxShadow: theme.shadow
      }}
      className="rounded-xl p-5"
    >
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2.5">
          <span style={{ background: color + '22', color }} className="p-1.5 rounded-lg">
            <Icon size={14} />
          </span>
          <h2 className="text-sm font-semibold tracking-tight" style={{ color: theme.text }}>
            {title}
          </h2>
          <span style={{ ...mono, color: theme.muted }} className="text-xs">
            {rows.length}
          </span>
        </div>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="flex items-center gap-0.5 text-xs font-medium transition-opacity hover:opacity-70"
            style={{ color: theme.muted }}
          >
            View all <ArrowRight size={11} />
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <div
          style={{ border: `1px dashed ${theme.borderStrong}`, color: theme.muted }}
          className="rounded-lg py-6 text-center text-sm"
        >
          Nothing to flag — all clear.
        </div>
      ) : (
        <div className="space-y-0">
          {rows.slice(0, 5).map((i, idx) => (
            <div
              key={i.id}
              className="flex items-center justify-between py-2.5 text-sm transition-colors hover:bg-transparent"
              style={{ borderTop: idx ? `1px solid ${theme.border}` : 'none' }}
            >
              <span className="flex items-center gap-2 min-w-0" style={{ color: theme.text }}>
                <span style={{ background: theme.hover }} className="w-1.5 h-1.5 rounded-full shrink-0" />
                <span className="truncate">{i.name}</span>
              </span>
              <span style={{ ...mono, color, fontWeight: 600 }} className="shrink-0 ml-2">
                {renderValue(i)}
              </span>
            </div>
          ))}
          {rows.length > 5 && (
            <p style={{ color: theme.muted }} className="text-xs pt-2 pb-1 text-center">
              +{rows.length - 5} more
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function Dashboard(): ReactElement {
  const { dark, setScreen, setPendingSaleDetailId, showToast } = useUiStore()
  const theme = getTheme(dark)
  const { user } = useAuth()
  const { data: settings } = usePharmacySettings()
  const { data: inventory = [] } = useInventory()
  // No date filters — /reports/sales returns every day it has orders for,
  // same as artifacts/web's Dashboard, so "today" is found client-side.
  const { data: sales, isLoading: salesLoading } = useGetSalesReport()
  // Same two generated hooks web's Dashboard uses for "Top Selling Medicines"
  // and "Latest Sales" — no extra endpoints or polling.
  const { data: topMedicines = [], isLoading: topLoading } = useGetTopMedicines()
  const { data: recentOrders = [], isLoading: ordersLoading } = useListOrders()
  const sendDigest = useSendDigest()

  const low = inventory.filter((i) => i.status === 'low')
  const expiring = inventory.filter((i) => i.status === 'expiring')
  const outOfStock = inventory.filter((i) => (i.qty ?? 0) <= 0)

  const today = new Date()
  const todayStr = localDateStr(today)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = localDateStr(yesterday)

  const todayRow = sales?.byDay.find((d) => d.date === todayStr)
  const yesterdayRow = sales?.byDay.find((d) => d.date === yesterdayStr)

  const todayRevenue = todayRow ? parseFloat(todayRow.revenue) : 0
  const todayOrders = todayRow?.orders ?? 0
  const avgBasket = todayOrders > 0 ? todayRevenue / todayOrders : 0

  // Only show a trend arrow when there's a real prior day to compare
  // against — a fabricated "12%" with nothing behind it is worse than no
  // trend at all.
  const yesterdayRevenue = yesterdayRow ? parseFloat(yesterdayRow.revenue) : null
  const revenueTrendPct =
    yesterdayRevenue != null && yesterdayRevenue > 0
      ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 1000) / 10
      : null

  const openSale = (id: number): void => {
    setPendingSaleDetailId(id)
    setScreen('sales')
  }

  const handleDigest = (): void => {
    sendDigest.mutate(undefined, {
      onSuccess: (data) =>
        showToast(
          `Digest logged — ${data.summary.lowStockCount} low-stock, ${data.summary.expiringCount} expiring, ${data.summary.pendingPrescriptionCount} prescriptions pending (no email provider connected yet)`
        ),
      onError: (err) => showToast(err.message || "Couldn't send digest")
    })
  }

  const digestBtn = (
    <button
      onClick={handleDigest}
      disabled={sendDigest.isPending}
      style={{ border: `1px solid ${theme.borderStrong}`, color: theme.text }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-60 shrink-0"
      title="Log an operations digest for today (admin)"
    >
      {sendDigest.isPending ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
      Email Digest
    </button>
  )

  return (
    <div className="p-7 space-y-6 max-w-6xl">
      {/* Greeting band */}
      <div
        style={{
          background: theme.gradientAccent,
          border: `1px solid ${theme.border}`,
          borderRadius: 16,
          boxShadow: theme.shadow
        }}
        className="p-5 flex items-center justify-between gap-3 animate-fade-up"
      >
        <div className="min-w-0">
          <h1 style={{ ...serif, color: theme.text }} className="text-[22px] font-semibold">
            {timeOfDayGreeting()}
            {user?.name ? `, ${user.name}` : ''}
          </h1>
          <p style={{ color: theme.muted }} className="text-sm mt-0.5">
            Here's what's happening at {settings?.name ?? 'your pharmacy'}.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {user?.role === 'admin' && digestBtn}
          <div style={{ ...mono, color: theme.muted }} className="text-xs hidden lg:block ml-1">
            {today.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>
        </div>
      </div>

      <div className="flex gap-4 animate-fade-up" style={{ animationDelay: '40ms' }}>
        <StatCard
          label="Today's sales"
          value={salesLoading ? '…' : formatCurrency(todayRevenue, settings)}
          trend={revenueTrendPct != null ? `${Math.abs(revenueTrendPct)}%` : undefined}
          trendUp={revenueTrendPct != null ? revenueTrendPct >= 0 : undefined}
        />
        <StatCard label="Avg. basket" value={salesLoading ? '…' : todayOrders > 0 ? formatCurrency(avgBasket, settings) : '—'} />
        <StatCard label="Low stock items" value={String(low.length)} tone={theme.amber} />
        <StatCard label="Expiring < 30d" value={String(expiring.length)} tone={theme.red} />
        <StatCard label="Out of stock" value={String(outOfStock.length)} tone={outOfStock.length > 0 ? theme.red : theme.green} />
      </div>

      {/* Quick actions strip */}
      <div
        style={{
          background: `linear-gradient(150deg, ${theme.card} 0%, ${theme.cardAlt} 100%)`,
          border: `1px solid ${theme.border}`,
          boxShadow: theme.shadow
        }}
        className="rounded-xl p-4 flex items-center gap-2.5 animate-fade-up"
      >
        <button
          onClick={() => setScreen('new-sale')}
          style={{ background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)' }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-semibold transition-transform active:scale-[0.98]"
        >
          <Plus size={15} /> New Sale
        </button>
        <button
          onClick={() => setScreen('prescriptions')}
          style={{ background: theme.primarySoft, color: theme.primaryText }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-transform active:scale-[0.98]"
        >
          <ClipboardList size={15} /> Prescriptions
        </button>
        <button
          onClick={() => setScreen('inventory')}
          style={{ background: theme.hover, color: theme.text }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-transform active:scale-[0.98]"
        >
          <PackagePlus size={15} /> Add Medicine
        </button>
      </div>

      {/* Row: Top Selling Medicines (2fr) + Low stock (1fr) */}
      <div className="grid grid-cols-3 gap-4 animate-fade-up" style={{ animationDelay: '80ms' }}>
        <div
          style={{
            background: theme.card,
            border: `1px solid ${theme.border}`,
            boxShadow: theme.shadow
          }}
          className="col-span-2 rounded-xl p-5"
        >
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2.5">
              <span style={{ background: theme.primarySoft, color: theme.primaryText }} className="p-1.5 rounded-lg">
                <TrendingUp size={14} />
              </span>
              <h2 className="text-sm font-semibold tracking-tight" style={{ color: theme.text }}>
                Top selling medicines
              </h2>
            </div>
            <button
              onClick={() => setScreen('reports')}
              className="flex items-center gap-0.5 text-xs font-medium transition-opacity hover:opacity-70"
              style={{ color: theme.muted }}
            >
              Reports <ArrowRight size={11} />
            </button>
          </div>
          {topLoading ? (
            <div className="space-y-2.5">
              {[0, 1, 2].map((n) => (
                <div key={n} style={{ background: theme.hover }} className="h-10 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : topMedicines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div style={{ background: theme.primarySoft, color: theme.primaryText }} className="w-10 h-10 rounded-lg flex items-center justify-center mb-2.5">
                <TrendingUp size={18} />
              </div>
              <p style={{ color: theme.text }} className="text-sm font-medium">No sales data yet</p>
              <p style={{ color: theme.muted }} className="text-xs mt-0.5">Top sellers will appear here once you make a few sales.</p>
            </div>
          ) : (
            <div className="space-y-0">
              {topMedicines.slice(0, 5).map((item, idx) => (
                <div
                  key={item.medicineId}
                  className="flex items-center justify-between py-2.5 text-sm"
                  style={{ borderTop: idx ? `1px solid ${theme.border}` : 'none' }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      style={{ ...mono, background: idx < 3 ? theme.primarySoft : theme.hover, color: idx < 3 ? theme.primaryText : theme.muted }}
                      className="w-5 h-5 rounded-md text-[10px] font-bold flex items-center justify-center shrink-0"
                    >
                      {idx + 1}
                    </span>
                    <span className="truncate" style={{ color: theme.text }}>
                      {item.medicineName}
                    </span>
                    <span style={{ ...mono, color: theme.muted }} className="text-xs shrink-0">
                      {item.totalSold} sold
                    </span>
                  </div>
                  <span style={{ ...mono, color: theme.primaryText, fontWeight: 600 }} className="shrink-0 ml-2">
                    {formatCurrency(parseFloat(String(item.revenue)), settings)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <Panel
          title="Low stock"
          color={theme.amber}
          rows={low}
          Icon={PackageX}
          onViewAll={() => setScreen('inventory')}
          renderValue={(r) => {
            const item = inventory.find((i) => i.id === r.id)
            return `${item?.qty ?? '—'} left`
          }}
        />
      </div>

      {/* Row: Latest Sales (2fr) + Expiring (1fr) */}
      <div className="grid grid-cols-3 gap-4 animate-fade-up" style={{ animationDelay: '120ms' }}>
        <div
          style={{
            background: theme.card,
            border: `1px solid ${theme.border}`,
            boxShadow: theme.shadow
          }}
          className="col-span-2 rounded-xl p-5"
        >
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2.5">
              <span style={{ background: theme.hover, color: theme.muted }} className="p-1.5 rounded-lg">
                <ReceiptIcon size={14} />
              </span>
              <h2 className="text-sm font-semibold tracking-tight" style={{ color: theme.text }}>
                Latest sales
              </h2>
            </div>
            <button
              onClick={() => setScreen('sales')}
              className="flex items-center gap-0.5 text-xs font-medium transition-opacity hover:opacity-70"
              style={{ color: theme.muted }}
            >
              View all <ArrowRight size={11} />
            </button>
          </div>
          {ordersLoading ? (
            <div className="space-y-2.5">
              {[0, 1, 2].map((n) => (
                <div key={n} style={{ background: theme.hover }} className="h-10 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div style={{ background: theme.hover, color: theme.muted }} className="w-10 h-10 rounded-lg flex items-center justify-center mb-2.5">
                <ReceiptIcon size={18} />
              </div>
              <p style={{ color: theme.text }} className="text-sm font-medium">No sales recorded yet</p>
              <p style={{ color: theme.muted }} className="text-xs mt-0.5">Latest sales will show up here once you ring up an order.</p>
            </div>
          ) : (
            <div className="space-y-0">
              {(recentOrders as RecentOrderRow[]).slice(0, 5).map((order, idx) => (
                <button
                  key={order.id}
                  onClick={() => openSale(order.id)}
                  className="w-full flex items-center justify-between py-2.5 text-sm text-left transition-colors hover:bg-[color:var(--row-hover)] rounded-lg px-2 -mx-2"
                  style={{ borderTop: idx ? `1px solid ${theme.border}` : 'none', '--row-hover': theme.hover } as React.CSSProperties}
                >
                  <div className="min-w-0">
                    <span style={{ ...mono, color: theme.text }} className="font-medium">
                      Sale #{String(order.id).padStart(4, '0')}
                    </span>
                    <p style={{ color: theme.muted }} className="text-xs truncate">
                      {order.patientName || 'Walk-in'} ·{' '}
                      {new Date(order.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-2 flex items-center gap-2.5">
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize"
                      style={{
                        background: order.paymentStatus === 'paid' ? theme.primarySoft : theme.hover,
                        color: order.paymentStatus === 'paid' ? theme.primaryText : theme.muted
                      }}
                    >
                      {order.paymentStatus}
                    </span>
                    <span style={{ ...mono, color: theme.text, fontWeight: 600 }}>
                      {formatCurrency(parseFloat(String(order.total)), settings)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <Panel
          title="Expiring soon"
          color={theme.red}
          rows={expiring}
          Icon={CalendarClock}
          onViewAll={() => setScreen('inventory')}
          renderValue={(r) => {
            const item = inventory.find((i) => i.id === r.id)
            return item?.expiry ?? '—'
          }}
        />
      </div>

      {/* Subtle trend hint under the stats */}
      {revenueTrendPct != null && (
        <p style={{ color: theme.muted }} className="text-xs flex items-center gap-1.5 -mt-2">
          {revenueTrendPct >= 0 ? (
            <TrendingUp size={12} color={theme.green} />
          ) : (
            <TrendingDown size={12} color={theme.red} />
          )}
          Revenue is{' '}
          <strong style={{ color: revenueTrendPct >= 0 ? theme.green : theme.red }}>
            {Math.abs(revenueTrendPct)}% {revenueTrendPct >= 0 ? 'up' : 'down'}
          </strong>{' '}
          versus yesterday.
        </p>
      )}
    </div>
  )
}
