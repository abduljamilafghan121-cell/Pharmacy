import type { ReactElement } from 'react'
import { useState } from 'react'
import {
  TrendingUp,
  Package,
  AlertTriangle,
  Award,
  Users as UsersIcon,
  ArrowUpRight,
  Download,
  Flame
} from 'lucide-react'
import { useGetInventoryReport } from '@workspace/api-client-react'
import {
  useGetProfitReport,
  useTopMedicinesRanged,
  useStaffProductivity,
  useReorderSuggestions
} from '../hooks/useExtraQueries'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useUiStore } from '../store/uiStore'
import { getTheme, mono, serif } from '../theme'
import { usePharmacySettings, formatCurrency } from '../hooks/usePharmacySettings'
import { useGetSalesReport } from '@workspace/api-client-react'

type Tab = 'overview' | 'reorder' | 'staff'

const URGENCY_COLOR: Record<string, 'ok' | 'low' | 'expiring'> = {
  critical: 'expiring',
  high: 'low',
  medium: 'ok'
}

function Pill({ label, kind, theme }: { label: string; kind: 'ok' | 'low' | 'expiring'; theme: ReturnType<typeof getTheme> }): ReactElement {
  const bg = kind === 'ok' ? theme.greenBg : kind === 'low' ? theme.amberBg : theme.redBg
  const fg = kind === 'ok' ? theme.green : kind === 'low' ? theme.amber : theme.red
  return (
    <span style={{ background: bg, color: fg }} className="inline-block px-2 py-0.5 rounded-full text-xs capitalize font-medium">
      {label}
    </span>
  )
}

function GradientStat({
  icon: Icon,
  label,
  value,
  accent,
  theme,
  sub
}: {
  icon: typeof TrendingUp
  label: string
  value: string
  accent: string
  theme: ReturnType<typeof getTheme>
  sub?: string
}): ReactElement {
  return (
    <div
      style={{
        background: `linear-gradient(150deg, ${theme.card} 0%, ${theme.cardAlt} 100%)`,
        border: `1px solid ${theme.border}`
      }}
      className="rounded-2xl p-5 flex-1 relative overflow-hidden"
    >
      <div
        style={{ background: accent, opacity: 0.12 }}
        className="absolute -top-6 -right-6 w-24 h-24 rounded-full"
      />
      <div
        style={{ background: `${accent}22`, color: accent }}
        className="w-9 h-9 rounded-xl flex items-center justify-center mb-4 relative"
      >
        <Icon size={17} />
      </div>
      <div style={{ color: theme.muted }} className="text-xs uppercase tracking-wide mb-1.5">
        {label}
      </div>
      <div style={{ ...mono, color: theme.text }} className="text-2xl font-semibold">
        {value}
      </div>
      {sub && (
        <div style={{ color: theme.muted }} className="text-xs mt-1">
          {sub}
        </div>
      )}
    </div>
  )
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export default function Reports(): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)
  const { data: settings } = usePharmacySettings()
  const [tab, setTab] = useState<Tab>('overview')

  const today = toISODate(new Date())
  const thirtyDaysAgo = toISODate(new Date(Date.now() - 29 * 86400000))
  const [fromDate, setFromDate] = useState(thirtyDaysAgo)
  const [toDate, setToDate] = useState(today)

  const quickRanges = [
    { label: '7 days', days: 6 },
    { label: '30 days', days: 29 },
    { label: '90 days', days: 89 }
  ]

  const applyQuickRange = (days: number): void => {
    setFromDate(toISODate(new Date(Date.now() - days * 86400000)))
    setToDate(today)
  }

  const { data: inventory, isLoading: invLoading } = useGetInventoryReport()
  const { data: sales, isLoading: salesLoading, isError: salesError } = useGetSalesReport({ from: fromDate, to: toDate })
  const { data: topMedicines = [], isLoading: topLoading } = useTopMedicinesRanged(fromDate, toDate)
  const { data: profit, isLoading: profitLoading } = useGetProfitReport(fromDate, toDate)
  const { data: reorder = [], isLoading: reorderLoading } = useReorderSuggestions()
  const { data: staff = [], isLoading: staffLoading } = useStaffProductivity(fromDate, toDate)

  const tabs: { key: Tab; label: string; icon: typeof TrendingUp }[] = [
    { key: 'overview', label: 'Overview', icon: TrendingUp },
    { key: 'reorder', label: 'Reorder Suggestions', icon: Flame },
    { key: 'staff', label: 'Staff Productivity', icon: UsersIcon }
  ]

  const exportSalesCsv = (): void => {
    if (!sales?.byDay?.length) return
    const header = ['Date', 'Orders', 'Revenue']
    const rows = sales.byDay.map((d) => [d.date, d.orders, d.revenue])
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sales-report-${fromDate}-to-${toDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportTopMedicinesCsv = (): void => {
    const header = ['Medicine', 'Units Sold', 'Revenue']
    const rows = topMedicines.map((m) => [m.medicineName ?? `Medicine #${m.medicineId}`, m.totalSold, m.revenue])
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `top-medicines-${fromDate}-to-${toDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-7">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 style={{ ...serif, color: theme.text }} className="text-xl font-semibold">
            Reports
          </h1>
          <p style={{ color: theme.muted }} className="text-sm mt-0.5">
            Business performance at a glance
          </p>
        </div>
        <div
          style={{ background: theme.card, border: `1px solid ${theme.border}` }}
          className="flex items-center gap-1 p-1 rounded-xl"
        >
          {tabs.map((t) => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  background: active ? theme.primary : 'transparent',
                  color: active ? '#fff' : theme.muted
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              >
                <t.icon size={13} />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Date range controls */}
      <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-xl p-4 flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-2">
          <label style={{ color: theme.muted }} className="text-sm shrink-0">
            From
          </label>
          <input
            type="date"
            value={fromDate}
            max={toDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
            className="text-sm rounded px-2 py-1.5 outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <label style={{ color: theme.muted }} className="text-sm shrink-0">
            To
          </label>
          <input
            type="date"
            value={toDate}
            min={fromDate}
            max={today}
            onChange={(e) => setToDate(e.target.value)}
            style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
            className="text-sm rounded px-2 py-1.5 outline-none"
          />
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          {quickRanges.map((r) => (
            <button
              key={r.label}
              onClick={() => applyQuickRange(r.days)}
              style={{ border: `1px solid ${theme.borderStrong}`, color: theme.text }}
              className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors hover:opacity-70"
            >
              Last {r.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && (
        <div className="space-y-5">
          {salesError && (
            <div
              style={{ border: `1px solid ${theme.red}`, background: theme.redBg, color: theme.red }}
              className="rounded-xl px-4 py-3 text-sm"
            >
              Couldn't load sales report. Adjust the date range and try again.
            </div>
          )}
          <div className="flex gap-4">
            <GradientStat
              icon={TrendingUp}
              label="Revenue"
              value={profitLoading ? '…' : formatCurrency(parseFloat(profit?.revenue ?? '0'), settings)}
              accent={theme.primary}
              theme={theme}
            />
            <GradientStat
              icon={Award}
              label="Profit Margin"
              value={profitLoading ? '…' : `${profit?.marginPct?.toFixed?.(1) ?? profit?.marginPct ?? 0}%`}
              accent={theme.green}
              theme={theme}
              sub={profit?.note}
            />
            <GradientStat
              icon={Package}
              label="Total Stock"
              value={invLoading ? '…' : String(inventory?.totalStock ?? 0)}
              accent={theme.amber}
              theme={theme}
              sub={invLoading ? undefined : `${inventory?.totalMedicines ?? 0} medicines`}
            />
            <GradientStat
              icon={AlertTriangle}
              label="Needs Attention"
              value={invLoading ? '…' : String((inventory?.lowStockCount ?? 0) + (inventory?.expiringCount ?? 0))}
              accent={theme.red}
              theme={theme}
              sub={invLoading ? undefined : `${inventory?.lowStockCount ?? 0} low · ${inventory?.expiringCount ?? 0} expiring`}
            />
          </div>

          {/* Sales Over Time chart */}
          <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 flex items-center justify-between gap-2">
              <div>
                <h2 style={{ color: theme.text }} className="text-sm font-medium">
                  Sales Over Time
                </h2>
                <p style={{ color: theme.muted }} className="text-xs mt-0.5">
                  {salesLoading ? 'Loading…' : `${sales?.byDay?.length ?? 0} days · ${sales?.totalOrders ?? 0} orders · ${formatCurrency(parseFloat(sales?.totalRevenue ?? '0'), settings)}`}
                </p>
              </div>
              <button
                onClick={exportSalesCsv}
                disabled={!sales?.byDay?.length}
                className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70 disabled:opacity-50"
                style={{ color: theme.muted }}
              >
                <Download size={13} /> Export CSV
              </button>
            </div>
            <div className="h-[300px] w-full px-3 pb-4">
              {salesLoading ? (
                <div className="w-full h-full bg-[color:var(--skel)] animate-pulse rounded-md" style={{ '--skel': theme.hover } as React.CSSProperties} />
              ) : sales?.byDay && sales.byDay.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sales.byDay}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.border} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: theme.muted }}
                      tickMargin={8}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(val: number) => `$${val}`}
                      tick={{ fontSize: 11, fill: theme.muted }}
                      axisLine={false}
                      tickLine={false}
                      width={54}
                    />
                    <Tooltip
                      cursor={{ fill: theme.hover }}
                      contentStyle={{ borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.card }}
                      labelStyle={{ color: theme.muted }}
                      formatter={(value: any) => [formatCurrency(parseFloat(String(value ?? 0)), settings) as any, 'Revenue']}
                    />
                    <Bar dataKey="revenue" fill={theme.primary} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm" style={{ color: theme.muted }}>
                  No sales data in this date range.
                </div>
              )}
            </div>
          </div>

          <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-2xl overflow-hidden">
            <div style={{ borderBottom: `1px solid ${theme.border}` }} className="px-5 py-3.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Award size={14} color={theme.primary} />
                <h2 style={{ color: theme.text }} className="text-sm font-medium">
                  Top Selling Medicines
                </h2>
              </div>
              {topMedicines.length > 0 && (
                <button
                  onClick={exportTopMedicinesCsv}
                  className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70"
                  style={{ color: theme.muted }}
                >
                  <Download size={13} /> Export CSV
                </button>
              )}
            </div>
            {topLoading ? (
              <p style={{ color: theme.muted }} className="p-4 text-sm">
                Loading…
              </p>
            ) : topMedicines.length === 0 ? (
              <p style={{ color: theme.muted }} className="p-4 text-sm">
                No sales data yet.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: theme.muted, borderBottom: `1px solid ${theme.border}` }} className="text-left text-xs uppercase tracking-wide">
                    <th className="py-2.5 px-5 font-medium">#</th>
                    <th className="py-2.5 px-5 font-medium">Medicine</th>
                    <th className="py-2.5 px-5 font-medium">Units Sold</th>
                    <th className="py-2.5 px-5 font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topMedicines.map((m, idx) => (
                    <tr key={m.medicineId} style={{ borderTop: idx ? `1px solid ${theme.border}` : 'none' }}>
                      <td className="py-2.5 px-5" style={{ ...mono, color: theme.muted }}>
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-5" style={{ color: theme.text }}>
                        {m.medicineName}
                      </td>
                      <td className="py-2.5 px-5" style={{ ...mono, color: theme.muted }}>
                        {m.totalSold}
                      </td>
                      <td className="py-2.5 px-5" style={{ ...mono, color: theme.text }}>
                        {formatCurrency(parseFloat(String(m.revenue)), settings)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'reorder' && (
        <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-2xl overflow-hidden">
          {reorderLoading ? (
            <p style={{ color: theme.muted }} className="p-4 text-sm">
              Loading reorder suggestions…
            </p>
          ) : reorder.length === 0 ? (
            <p style={{ color: theme.muted }} className="p-4 text-sm">
              Nothing needs reordering right now.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: theme.muted, borderBottom: `1px solid ${theme.border}` }} className="text-left text-xs uppercase tracking-wide">
                  <th className="py-2.5 px-5 font-medium">Medicine</th>
                  <th className="py-2.5 px-5 font-medium">In Stock</th>
                  <th className="py-2.5 px-5 font-medium">Reorder Level</th>
                  <th className="py-2.5 px-5 font-medium">30d Sold</th>
                  <th className="py-2.5 px-5 font-medium">Suggested Qty</th>
                  <th className="py-2.5 px-5 font-medium">Urgency</th>
                </tr>
              </thead>
              <tbody>
                {reorder.map((r, idx) => (
                  <tr key={r.medicineId} style={{ borderTop: idx ? `1px solid ${theme.border}` : 'none' }}>
                    <td className="py-2.5 px-5" style={{ color: theme.text }}>
                      {r.medicineName}
                      {r.genericName && (
                        <span style={{ color: theme.muted }} className="ml-1.5 text-xs">
                          ({r.genericName})
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-5" style={{ ...mono, color: theme.text }}>
                      {r.currentStock}
                    </td>
                    <td className="py-2.5 px-5" style={{ ...mono, color: theme.muted }}>
                      {r.reorderLevel}
                    </td>
                    <td className="py-2.5 px-5" style={{ ...mono, color: theme.muted }}>
                      {r.sold30Days}
                    </td>
                    <td className="py-2.5 px-5" style={{ ...mono, color: theme.primary }}>
                      +{r.suggestedReorderQty}
                    </td>
                    <td className="py-2.5 px-5">
                      <Pill label={r.urgency} kind={URGENCY_COLOR[r.urgency] ?? 'ok'} theme={theme} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'staff' && (
        <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-2xl overflow-hidden">
          {staffLoading ? (
            <p style={{ color: theme.muted }} className="p-4 text-sm">
              Loading staff productivity…
            </p>
          ) : staff.length === 0 ? (
            <p style={{ color: theme.muted }} className="p-4 text-sm">
              No staff activity yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: theme.muted, borderBottom: `1px solid ${theme.border}` }} className="text-left text-xs uppercase tracking-wide">
                  <th className="py-2.5 px-5 font-medium">Staff</th>
                  <th className="py-2.5 px-5 font-medium">Orders</th>
                  <th className="py-2.5 px-5 font-medium">Items Sold</th>
                  <th className="py-2.5 px-5 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {staff
                  .slice()
                  .sort((a, b) => parseFloat(b.totalRevenue) - parseFloat(a.totalRevenue))
                  .map((s, idx) => (
                    <tr key={s.userId ?? idx} style={{ borderTop: idx ? `1px solid ${theme.border}` : 'none' }}>
                      <td className="py-2.5 px-5 flex items-center gap-2" style={{ color: theme.text }}>
                        {idx === 0 && <ArrowUpRight size={13} color={theme.green} />}
                        {s.userName ?? 'Unknown'}
                      </td>
                      <td className="py-2.5 px-5" style={{ ...mono, color: theme.muted }}>
                        {s.totalOrders}
                      </td>
                      <td className="py-2.5 px-5" style={{ ...mono, color: theme.muted }}>
                        {s.totalItems}
                      </td>
                      <td className="py-2.5 px-5" style={{ ...mono, color: theme.text }}>
                        {formatCurrency(parseFloat(String(s.totalRevenue)), settings)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
