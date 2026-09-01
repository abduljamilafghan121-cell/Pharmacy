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
  Flame,
  CreditCard,
  Truck,
  Timer,
  ShieldAlert,
  FileText,
  Receipt
} from 'lucide-react'
import { useGetInventoryReport } from '@workspace/api-client-react'
import {
  useGetProfitReport,
  useTopMedicinesRanged,
  useStaffProductivity,
  useReorderSuggestions,
  usePaymentsReport,
  usePurchasesBySupplier,
  useExpiringStock,
  useControlledSubstancesReport,
  useInsuranceClaimsReport,
  useSalesTransactionsReport
} from '../hooks/useExtraQueries'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useUiStore } from '../store/uiStore'
import { getTheme, mono, serif } from '../theme'
import { usePharmacySettings, formatCurrency } from '../hooks/usePharmacySettings'
import { useGetSalesReport } from '@workspace/api-client-react'
import Loading from '../components/Loading'

type Tab = 'overview' | 'sales' | 'reorder' | 'staff' | 'payments' | 'purchases' | 'expiring' | 'controlled' | 'claims'

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

  const [expiryDays, setExpiryDays] = useState(90)

  const { data: payments, isLoading: paymentsLoading } = usePaymentsReport(fromDate, toDate)
  const { data: purchases = [], isLoading: purchasesLoading } = usePurchasesBySupplier(fromDate, toDate)
  const { data: expiring = [], isLoading: expiringLoading } = useExpiringStock(expiryDays)
  const { data: controlled, isLoading: controlledLoading } = useControlledSubstancesReport(fromDate, toDate)
  const { data: claims, isLoading: claimsLoading } = useInsuranceClaimsReport(fromDate, toDate)
  const { data: saleReport, isLoading: saleLoading } = useSalesTransactionsReport(fromDate, toDate)

  const tabs: { key: Tab; label: string; icon: typeof TrendingUp }[] = [
    { key: 'overview', label: 'Overview', icon: TrendingUp },
    { key: 'sales', label: 'Sale Report', icon: Receipt },
    { key: 'reorder', label: 'Reorder', icon: Flame },
    { key: 'staff', label: 'Staff', icon: UsersIcon },
    { key: 'payments', label: 'Payments', icon: CreditCard },
    { key: 'purchases', label: 'Purchases', icon: Truck },
    { key: 'expiring', label: 'Expiring', icon: Timer },
    { key: 'controlled', label: 'Controlled', icon: ShieldAlert },
    { key: 'claims', label: 'Claims', icon: FileText }
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

  const downloadCsv = (name: string, header: string[], rows: (string | number)[][]): void => {
    if (!rows.length) return
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name}-${fromDate}-to-${toDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportPaymentsCsv = (): void => {
    const rows: (string | number)[][] = []
    payments?.byMethod.forEach((m) => rows.push([m.method, m.count, m.amount]))
    downloadCsv('payments-report', ['Method', 'Transactions', 'Amount'], rows)
  }

  const exportPurchasesCsv = (): void => {
    downloadCsv(
      'purchases-report',
      ['Supplier', 'POs', 'Purchased', 'Paid', 'Returns', 'Balance'],
      purchases.map((p) => [p.supplierName, p.purchaseOrders, p.totalPurchased, p.totalPaid, p.totalReturns, p.balance])
    )
  }

  const exportExpiringCsv = (): void => {
    downloadCsv(
      'expiring-stock',
      ['Medicine', 'Batch', 'Expiry', 'Qty', 'Supplier'],
      expiring.map((e) => [e.medicineName ?? '', e.batchNumber ?? '', e.expiryDate ?? '', e.quantity, e.supplierName ?? ''])
    )
  }

  const exportControlledCsv = (): void => {
    downloadCsv(
      'controlled-substances',
      ['Schedule', 'Events', 'Units'],
      (controlled?.bySchedule ?? []).map((s) => [s.schedule, s.count, s.quantity])
    )
  }

  const exportClaimsCsv = (): void => {
    downloadCsv(
      'insurance-claims',
      ['Status', 'Claims', 'Amount'],
      (claims?.byStatus ?? []).map((s) => [s.status, s.count, s.amount])
    )
  }

  const exportSalesTransactionsCsv = (): void => {
    downloadCsv(
      'sale-report',
      ['Sale ID', 'Date', 'Patient', 'Staff', 'Items', 'Subtotal', 'Discount', 'Tax', 'Total', 'Payment', 'Status'],
      (saleReport?.transactions ?? []).map((t) => [
        t.id,
        new Date(t.createdAt).toLocaleString(),
        t.patientName ?? '',
        t.servedByName ?? '',
        t.itemCount,
        t.subtotal,
        t.discountAmount,
        t.taxAmount,
        t.total,
        t.paymentMethod ?? t.paymentStatus,
        t.status
      ])
    )
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
          className="flex flex-wrap items-center gap-1 p-1 rounded-xl"
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
              <Loading label="Loading…" />
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

      {tab === 'sales' && (
        <div className="space-y-5">
          <div className="flex gap-4">
            <GradientStat
              icon={Receipt}
              label="Total Sales"
              value={saleLoading ? '…' : String(saleReport?.totalSales ?? 0)}
              accent={theme.primary}
              theme={theme}
            />
            <GradientStat
              icon={TrendingUp}
              label="Sale Revenue"
              value={saleLoading ? '…' : formatCurrency(parseFloat(saleReport?.totalRevenue ?? '0'), settings)}
              accent={theme.green}
              theme={theme}
            />
            <GradientStat
              icon={AlertTriangle}
              label="Discounts"
              value={saleLoading ? '…' : formatCurrency(parseFloat(saleReport?.totalDiscount ?? '0'), settings)}
              accent={theme.amber}
              theme={theme}
              sub={saleLoading ? undefined : `tax ${formatCurrency(parseFloat(saleReport?.totalTax ?? '0'), settings)}`}
            />
            <GradientStat
              icon={Package}
              label="Cancelled"
              value={saleLoading ? '…' : String(saleReport?.cancelledCount ?? 0)}
              accent={theme.red}
              theme={theme}
            />
          </div>
          <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 flex items-center justify-between gap-2" style={{ borderBottom: `1px solid ${theme.border}` }}>
              <div>
                <h2 style={{ color: theme.text }} className="text-sm font-medium">
                  Sale Transactions
                </h2>
                <p style={{ color: theme.muted }} className="text-xs mt-0.5">
                  Every sale in this date range
                </p>
              </div>
              {saleReport?.transactions?.length ? (
                <button onClick={exportSalesTransactionsCsv} className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70" style={{ color: theme.muted }}>
                  <Download size={13} /> Export CSV
                </button>
              ) : null}
            </div>
            {saleLoading ? (
              <Loading label="Loading…" />
            ) : !saleReport?.transactions?.length ? (
              <p style={{ color: theme.muted }} className="p-4 text-sm">
                No sales in this date range.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: theme.muted, borderBottom: `1px solid ${theme.border}` }} className="text-left text-xs uppercase tracking-wide">
                      <th className="py-2.5 px-5 font-medium">#</th>
                      <th className="py-2.5 px-5 font-medium">Date</th>
                      <th className="py-2.5 px-5 font-medium">Patient</th>
                      <th className="py-2.5 px-5 font-medium">Staff</th>
                      <th className="py-2.5 px-5 font-medium">Items</th>
                      <th className="py-2.5 px-5 font-medium">Subtotal</th>
                      <th className="py-2.5 px-5 font-medium">Disc</th>
                      <th className="py-2.5 px-5 font-medium">Tax</th>
                      <th className="py-2.5 px-5 font-medium">Total</th>
                      <th className="py-2.5 px-5 font-medium">Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saleReport.transactions.map((t, i) => {
                      const cancelled = t.status === 'cancelled'
                      return (
                        <tr key={t.id} style={{ borderTop: i ? `1px solid ${theme.border}` : 'none', opacity: cancelled ? 0.5 : 1 }}>
                          <td className="py-2.5 px-5" style={{ ...mono, color: theme.muted }}>
                            #{t.id}
                          </td>
                          <td className="py-2.5 px-5" style={{ ...mono, color: theme.muted }}>
                            {new Date(t.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-2.5 px-5" style={{ color: theme.text }}>
                            {t.patientName ?? 'Walk-in'}
                          </td>
                          <td className="py-2.5 px-5" style={{ color: theme.muted }}>
                            {t.servedByName ?? '—'}
                          </td>
                          <td className="py-2.5 px-5" style={{ ...mono, color: theme.muted }}>
                            {t.itemCount}
                          </td>
                          <td className="py-2.5 px-5" style={{ ...mono, color: theme.text }}>
                            {formatCurrency(parseFloat(t.subtotal), settings)}
                          </td>
                          <td className="py-2.5 px-5" style={{ ...mono, color: theme.muted }}>
                            {parseFloat(t.discountAmount) > 0 ? formatCurrency(parseFloat(t.discountAmount), settings) : '—'}
                          </td>
                          <td className="py-2.5 px-5" style={{ ...mono, color: theme.muted }}>
                            {formatCurrency(parseFloat(t.taxAmount), settings)}
                          </td>
                          <td className="py-2.5 px-5" style={{ ...mono, color: theme.text }}>
                            {formatCurrency(parseFloat(t.total), settings)}
                          </td>
                          <td className="py-2.5 px-5">
                            <span
                              style={{
                                color: t.paymentStatus === 'unpaid' ? theme.red : theme.primary,
                                background: t.paymentStatus === 'unpaid' ? theme.redBg : theme.primary + '22'
                              }}
                              className="inline-block px-2 py-0.5 rounded-full text-xs capitalize font-medium"
                            >
                              {t.paymentMethod ?? t.paymentStatus}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'reorder' && (
        <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-2xl overflow-hidden">
          {reorderLoading ? (
            <Loading label="Loading reorder suggestions…" />
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
            <Loading label="Loading staff productivity…" />
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

      {tab === 'payments' && (
        <div className="space-y-5">
          <div className="flex gap-4">
            <GradientStat
              icon={CreditCard}
              label="Collected"
              value={paymentsLoading ? '…' : formatCurrency(parseFloat(payments?.totalCollected ?? '0'), settings)}
              accent={theme.green}
              theme={theme}
            />
            <GradientStat
              icon={AlertTriangle}
              label="Outstanding (unpaid)"
              value={paymentsLoading ? '…' : formatCurrency(parseFloat(payments?.outstanding.amount ?? '0'), settings)}
              accent={theme.red}
              theme={theme}
              sub={paymentsLoading ? undefined : `${payments?.outstanding.count ?? 0} unpaid orders`}
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 flex items-center justify-between gap-2" style={{ borderBottom: `1px solid ${theme.border}` }}>
                <div>
                  <h2 style={{ color: theme.text }} className="text-sm font-medium">
                    Payments by Method
                  </h2>
                  <p style={{ color: theme.muted }} className="text-xs mt-0.5">
                    Completed transactions
                  </p>
                </div>
                {payments?.byMethod?.length ? (
                  <button onClick={exportPaymentsCsv} className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70" style={{ color: theme.muted }}>
                    <Download size={13} /> Export CSV
                  </button>
                ) : null}
              </div>
              {paymentsLoading ? (
                <Loading label="Loading…" />
              ) : !payments?.byMethod?.length ? (
                <p style={{ color: theme.muted }} className="p-4 text-sm">
                  No payments in this date range.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: theme.muted, borderBottom: `1px solid ${theme.border}` }} className="text-left text-xs uppercase tracking-wide">
                      <th className="py-2.5 px-5 font-medium">Method</th>
                      <th className="py-2.5 px-5 font-medium">Transactions</th>
                      <th className="py-2.5 px-5 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.byMethod.map((m, i) => (
                      <tr key={m.method} style={{ borderTop: i ? `1px solid ${theme.border}` : 'none' }}>
                        <td className="py-2.5 px-5 capitalize" style={{ color: theme.text }}>
                          {m.method}
                        </td>
                        <td className="py-2.5 px-5" style={{ ...mono, color: theme.muted }}>
                          {m.count}
                        </td>
                        <td className="py-2.5 px-5" style={{ ...mono, color: theme.text }}>
                          {formatCurrency(parseFloat(m.amount), settings)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${theme.border}` }}>
                <h2 style={{ color: theme.text }} className="text-sm font-medium">
                  Orders by Payment Status
                </h2>
              </div>
              {paymentsLoading ? (
                <Loading label="Loading…" />
              ) : !payments?.byOrderStatus?.length ? (
                <p style={{ color: theme.muted }} className="p-4 text-sm">
                  No orders in this date range.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: theme.muted, borderBottom: `1px solid ${theme.border}` }} className="text-left text-xs uppercase tracking-wide">
                      <th className="py-2.5 px-5 font-medium">Status</th>
                      <th className="py-2.5 px-5 font-medium">Orders</th>
                      <th className="py-2.5 px-5 font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.byOrderStatus.map((o, i) => (
                      <tr key={o.paymentStatus} style={{ borderTop: i ? `1px solid ${theme.border}` : 'none' }}>
                        <td className="py-2.5 px-5 capitalize" style={{ color: o.paymentStatus === 'unpaid' ? theme.red : theme.text }}>
                          {o.paymentStatus}
                        </td>
                        <td className="py-2.5 px-5" style={{ ...mono, color: theme.muted }}>
                          {o.count}
                        </td>
                        <td className="py-2.5 px-5" style={{ ...mono, color: theme.text }}>
                          {formatCurrency(parseFloat(o.amount), settings)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'purchases' && (
        <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 flex items-center justify-between gap-2" style={{ borderBottom: `1px solid ${theme.border}` }}>
            <div>
              <h2 style={{ color: theme.text }} className="text-sm font-medium">
                Purchases by Supplier
              </h2>
              <p style={{ color: theme.muted }} className="text-xs mt-0.5">
                Outstanding balance = purchased − paid − returned
              </p>
            </div>
            {purchases.length ? (
              <button onClick={exportPurchasesCsv} className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70" style={{ color: theme.muted }}>
                <Download size={13} /> Export CSV
              </button>
            ) : null}
          </div>
          {purchasesLoading ? (
            <Loading label="Loading…" />
          ) : purchases.length === 0 ? (
            <p style={{ color: theme.muted }} className="p-4 text-sm">
              No supplier activity in this date range.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: theme.muted, borderBottom: `1px solid ${theme.border}` }} className="text-left text-xs uppercase tracking-wide">
                  <th className="py-2.5 px-5 font-medium">Supplier</th>
                  <th className="py-2.5 px-5 font-medium">POs</th>
                  <th className="py-2.5 px-5 font-medium">Purchased</th>
                  <th className="py-2.5 px-5 font-medium">Paid</th>
                  <th className="py-2.5 px-5 font-medium">Returns</th>
                  <th className="py-2.5 px-5 font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p, i) => {
                  const bal = parseFloat(p.balance)
                  return (
                    <tr key={p.supplierId} style={{ borderTop: i ? `1px solid ${theme.border}` : 'none' }}>
                      <td className="py-2.5 px-5" style={{ color: theme.text }}>
                        {p.supplierName}
                      </td>
                      <td className="py-2.5 px-5" style={{ ...mono, color: theme.muted }}>
                        {p.purchaseOrders}
                      </td>
                      <td className="py-2.5 px-5" style={{ ...mono, color: theme.text }}>
                        {formatCurrency(parseFloat(p.totalPurchased), settings)}
                      </td>
                      <td className="py-2.5 px-5" style={{ ...mono, color: theme.green }}>
                        {formatCurrency(parseFloat(p.totalPaid), settings)}
                      </td>
                      <td className="py-2.5 px-5" style={{ ...mono, color: theme.muted }}>
                        {formatCurrency(parseFloat(p.totalReturns), settings)}
                      </td>
                      <td className="py-2.5 px-5" style={{ ...mono, color: bal > 0 ? theme.red : theme.text }}>
                        {formatCurrency(bal, settings)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'expiring' && (
        <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 flex items-center justify-between gap-2" style={{ borderBottom: `1px solid ${theme.border}` }}>
            <div>
              <h2 style={{ color: theme.text }} className="text-sm font-medium">
                Expiring Stock
              </h2>
              <p style={{ color: theme.muted }} className="text-xs mt-0.5">
                Batches with remaining stock expiring soon
              </p>
            </div>
            <div className="flex items-center gap-2">
              {[30, 60, 90, 180].map((d) => (
                <button
                  key={d}
                  onClick={() => setExpiryDays(d)}
                  style={{
                    background: expiryDays === d ? theme.primary : 'transparent',
                    color: expiryDays === d ? '#fff' : theme.muted,
                    border: `1px solid ${theme.borderStrong}`
                  }}
                  className="text-xs font-medium px-2.5 py-1 rounded-lg transition-colors"
                >
                  {d}d
                </button>
              ))}
              {expiring.length ? (
                <button onClick={exportExpiringCsv} className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70 ml-2" style={{ color: theme.muted }}>
                  <Download size={13} /> Export CSV
                </button>
              ) : null}
            </div>
          </div>
          {expiringLoading ? (
            <Loading label="Loading…" />
          ) : expiring.length === 0 ? (
            <p style={{ color: theme.muted }} className="p-4 text-sm">
              No stock expiring within {expiryDays} days.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: theme.muted, borderBottom: `1px solid ${theme.border}` }} className="text-left text-xs uppercase tracking-wide">
                  <th className="py-2.5 px-5 font-medium">Medicine</th>
                  <th className="py-2.5 px-5 font-medium">Batch</th>
                  <th className="py-2.5 px-5 font-medium">Expiry</th>
                  <th className="py-2.5 px-5 font-medium">Qty</th>
                  <th className="py-2.5 px-5 font-medium">Supplier</th>
                </tr>
              </thead>
              <tbody>
                {expiring.map((e, i) => (
                  <tr key={e.batchId} style={{ borderTop: i ? `1px solid ${theme.border}` : 'none' }}>
                    <td className="py-2.5 px-5" style={{ color: theme.text }}>
                      {e.medicineName}
                    </td>
                    <td className="py-2.5 px-5" style={{ ...mono, color: theme.muted }}>
                      {e.batchNumber ?? '—'}
                    </td>
                    <td className="py-2.5 px-5" style={{ ...mono, color: theme.amber }}>
                      {e.expiryDate ?? '—'}
                    </td>
                    <td className="py-2.5 px-5" style={{ ...mono, color: theme.text }}>
                      {e.quantity}
                    </td>
                    <td className="py-2.5 px-5" style={{ color: theme.muted }}>
                      {e.supplierName ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'controlled' && (
        <div className="space-y-5">
          <div className="flex gap-4">
            <GradientStat
              icon={ShieldAlert}
              label="Dispensing Events"
              value={controlledLoading ? '…' : String(controlled?.totalEvents ?? 0)}
              accent={theme.red}
              theme={theme}
              sub={controlledLoading ? undefined : 'controlled substances'}
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 flex items-center justify-between gap-2" style={{ borderBottom: `1px solid ${theme.border}` }}>
                <div>
                  <h2 style={{ color: theme.text }} className="text-sm font-medium">
                    By Schedule
                  </h2>
                </div>
                {controlled?.bySchedule?.length ? (
                  <button onClick={exportControlledCsv} className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70" style={{ color: theme.muted }}>
                    <Download size={13} /> Export CSV
                  </button>
                ) : null}
              </div>
              {controlledLoading ? (
                <Loading label="Loading…" />
              ) : !controlled?.bySchedule?.length ? (
                <p style={{ color: theme.muted }} className="p-4 text-sm">
                  No controlled dispensing in this date range.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: theme.muted, borderBottom: `1px solid ${theme.border}` }} className="text-left text-xs uppercase tracking-wide">
                      <th className="py-2.5 px-5 font-medium">Schedule</th>
                      <th className="py-2.5 px-5 font-medium">Events</th>
                      <th className="py-2.5 px-5 font-medium">Units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {controlled.bySchedule.map((s, i) => (
                      <tr key={s.schedule} style={{ borderTop: i ? `1px solid ${theme.border}` : 'none' }}>
                        <td className="py-2.5 px-5" style={{ ...mono, color: theme.text }}>
                          Schedule {s.schedule}
                        </td>
                        <td className="py-2.5 px-5" style={{ ...mono, color: theme.muted }}>
                          {s.count}
                        </td>
                        <td className="py-2.5 px-5" style={{ ...mono, color: theme.text }}>
                          {s.quantity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${theme.border}` }}>
                <h2 style={{ color: theme.text }} className="text-sm font-medium">
                  By Medicine
                </h2>
              </div>
              {controlledLoading ? (
                <Loading label="Loading…" />
              ) : !controlled?.byMedicine?.length ? (
                <p style={{ color: theme.muted }} className="p-4 text-sm">
                  No controlled dispensing in this date range.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: theme.muted, borderBottom: `1px solid ${theme.border}` }} className="text-left text-xs uppercase tracking-wide">
                      <th className="py-2.5 px-5 font-medium">Medicine</th>
                      <th className="py-2.5 px-5 font-medium">Events</th>
                      <th className="py-2.5 px-5 font-medium">Units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {controlled.byMedicine.map((m, i) => (
                      <tr key={m.medicineId} style={{ borderTop: i ? `1px solid ${theme.border}` : 'none' }}>
                        <td className="py-2.5 px-5" style={{ color: theme.text }}>
                          {m.medicineName ?? `Medicine #${m.medicineId}`}
                        </td>
                        <td className="py-2.5 px-5" style={{ ...mono, color: theme.muted }}>
                          {m.count}
                        </td>
                        <td className="py-2.5 px-5" style={{ ...mono, color: theme.text }}>
                          {m.quantity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'claims' && (
        <div className="space-y-5">
          <div className="flex gap-4">
            <GradientStat
              icon={FileText}
              label="Total Claims"
              value={claimsLoading ? '…' : String(claims?.totalClaims ?? 0)}
              accent={theme.primary}
              theme={theme}
              sub={claimsLoading ? undefined : `value ${formatCurrency(parseFloat(claims?.totalAmount ?? '0'), settings)}`}
            />
            <GradientStat
              icon={CreditCard}
              label="Pending Receivable"
              value={claimsLoading ? '…' : formatCurrency(parseFloat(claims?.pendingReceivable ?? '0'), settings)}
              accent={theme.amber}
              theme={theme}
              sub="submitted + approved, not yet paid"
            />
          </div>
          <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 flex items-center justify-between gap-2" style={{ borderBottom: `1px solid ${theme.border}` }}>
              <div>
                <h2 style={{ color: theme.text }} className="text-sm font-medium">
                  Claims by Status
                </h2>
              </div>
              {claims?.byStatus?.length ? (
                <button onClick={exportClaimsCsv} className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70" style={{ color: theme.muted }}>
                  <Download size={13} /> Export CSV
                </button>
              ) : null}
            </div>
            {claimsLoading ? (
              <Loading label="Loading…" />
            ) : !claims?.byStatus?.length ? (
              <p style={{ color: theme.muted }} className="p-4 text-sm">
                No claims in this date range.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: theme.muted, borderBottom: `1px solid ${theme.border}` }} className="text-left text-xs uppercase tracking-wide">
                    <th className="py-2.5 px-5 font-medium">Status</th>
                    <th className="py-2.5 px-5 font-medium">Claims</th>
                    <th className="py-2.5 px-5 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {claims.byStatus.map((s, i) => (
                    <tr key={s.status} style={{ borderTop: i ? `1px solid ${theme.border}` : 'none' }}>
                      <td className="py-2.5 px-5 capitalize" style={{ color: s.status === 'rejected' ? theme.red : theme.text }}>
                        {s.status}
                      </td>
                      <td className="py-2.5 px-5" style={{ ...mono, color: theme.muted }}>
                        {s.count}
                      </td>
                      <td className="py-2.5 px-5" style={{ ...mono, color: theme.text }}>
                        {formatCurrency(parseFloat(s.amount), settings)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
