import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Search, X, Receipt as ReceiptIcon, Plus } from 'lucide-react'
import { useListOrders, type Order } from '@workspace/api-client-react'
import { useUiStore } from '../store/uiStore'
import { getTheme, mono, serif } from '../theme'
import { usePharmacySettings, formatCurrency } from '../hooks/usePharmacySettings'
import SaleDetail from '../components/SaleDetail'

// The generated Order type hasn't caught up with the API yet — the server
// does return patientName (see artifacts/api-server/src/routes/orders.ts).
// Same gap as Prescription in Prescriptions.tsx.
type OrderRow = Order & { patientName?: string | null }

// Only pending/dispensed/cancelled are real order statuses (see
// orderStatusEnum in lib/db/src/schema/orders.ts) — 'delivered' and
// 'processing' don't exist in this schema and never match a real order.
const STATUS_COLOR: Record<string, 'ok' | 'low' | 'expiring'> = {
  dispensed: 'ok',
  pending: 'low',
  cancelled: 'expiring'
}

const PAYMENT_COLOR: Record<string, 'ok' | 'low' | 'expiring'> = {
  paid: 'ok',
  unpaid: 'low',
  refunded: 'expiring'
}

function Pill({ label, kind, theme }: { label: string; kind: 'ok' | 'low' | 'expiring'; theme: ReturnType<typeof getTheme> }): ReactElement {
  const bg = kind === 'ok' ? theme.greenBg : kind === 'low' ? theme.amberBg : theme.redBg
  const fg = kind === 'ok' ? theme.green : kind === 'low' ? theme.amber : theme.red
  return (
    <span style={{ background: bg, color: fg }} className="inline-block px-2 py-0.5 rounded-full text-xs capitalize">
      {label}
    </span>
  )
}

export default function Sales(): ReactElement {
  const { dark, setScreen, pendingSaleDetailId, setPendingSaleDetailId } = useUiStore()
  const theme = getTheme(dark)
  const { data: settings } = usePharmacySettings()
  const { data: orders = [], isLoading } = useListOrders()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)

  // Deep link from the completed-sale screen (desktop's /sales/:id equivalent)
  useEffect(() => {
    if (pendingSaleDetailId != null) {
      setOpenId(pendingSaleDetailId)
      setPendingSaleDetailId(null)
    }
  }, [pendingSaleDetailId, setPendingSaleDetailId])

  const hasActiveFilters = !!(search || statusFilter !== 'all' || paymentFilter !== 'all' || fromDate || toDate)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (orders as OrderRow[]).filter((order) => {
      if (statusFilter !== 'all' && order.status !== statusFilter) return false
      if (paymentFilter !== 'all' && order.paymentStatus !== paymentFilter) return false
      const orderDate = order.createdAt?.slice(0, 10)
      if (fromDate && orderDate < fromDate) return false
      if (toDate && orderDate > toDate) return false
      if (q) {
        const saleNo = `#${order.id.toString().padStart(4, '0')}`.toLowerCase()
        const haystack = `${saleNo} ${order.id} ${order.patientName ?? ''} ${(order as any).servedByName ?? ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [orders, search, statusFilter, paymentFilter, fromDate, toDate])

  const clearFilters = (): void => {
    setSearch('')
    setStatusFilter('all')
    setPaymentFilter('all')
    setFromDate('')
    setToDate('')
  }

  return (
    <div className="p-7">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 style={{ ...serif, color: theme.text }} className="text-xl font-semibold">
            Sales
          </h1>
          <p style={{ color: theme.muted }} className="text-sm mt-0.5">
            History of all counter sales and transactions
          </p>
        </div>
        <button
          onClick={() => setScreen('new-sale')}
          style={{ background: theme.primary, color: '#fff' }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={14} />
          New Sale
        </button>
      </div>

      <div
        style={{ background: theme.card, border: `1px solid ${theme.border}` }}
        className="rounded-xl p-3 mb-3 flex flex-wrap items-center gap-2"
      >
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg flex-1 min-w-[200px]"
          style={{ background: theme.cardAlt, border: `1px solid ${theme.border}` }}
        >
          <Search size={13} color={theme.muted} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by sale #, patient…"
            style={{ color: theme.text, background: 'transparent' }}
            className="w-full text-sm outline-none placeholder:opacity-50"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
          className="text-sm rounded-lg px-3 py-2 outline-none"
        >
          <option value="all">All statuses</option>
          <option value="dispensed">Dispensed</option>
          <option value="pending">Pending</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
          className="text-sm rounded-lg px-3 py-2 outline-none"
        >
          <option value="all">All payments</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
          <option value="refunded">Refunded</option>
        </select>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
            className="text-sm rounded-lg px-2.5 py-2 outline-none"
          />
          <span style={{ color: theme.muted }} className="text-xs">
            to
          </span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
            className="text-sm rounded-lg px-2.5 py-2 outline-none"
          />
        </div>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            style={{ color: theme.muted }}
            className="flex items-center gap-1 text-xs px-2 py-1.5 hover:opacity-70"
          >
            <X size={12} />
            Clear
          </button>
        )}
      </div>

      {hasActiveFilters && !isLoading && (
        <p style={{ color: theme.muted }} className="text-xs mb-2">
          Showing {filtered.length} of {orders.length} sales
        </p>
      )}

      <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-xl overflow-hidden">
        {isLoading ? (
          <p style={{ color: theme.muted }} className="p-4 text-sm">
            Loading orders…
          </p>
        ) : orders.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-2">
            <ReceiptIcon size={28} color={theme.muted} />
            <p style={{ color: theme.muted }} className="text-sm">
              No sales yet.
            </p>
            <button
              onClick={() => setScreen('new-sale')}
              style={{ background: theme.primary, color: '#fff' }}
              className="mt-1 px-3 py-1.5 rounded-lg text-xs font-medium"
            >
              Process first sale
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-2">
            <Search size={24} color={theme.muted} />
            <p style={{ color: theme.muted }} className="text-sm">
              No sales match your filters.
            </p>
            <button
              onClick={clearFilters}
              style={{ border: `1px solid ${theme.border}`, color: theme.text }}
              className="mt-1 px-3 py-1.5 rounded-lg text-xs"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr
                style={{ color: theme.muted, borderBottom: `1px solid ${theme.border}` }}
                className="text-left text-xs uppercase tracking-wide"
              >
                <th className="py-2.5 px-4 font-medium">Sale #</th>
                <th className="py-2.5 px-4 font-medium">Date</th>
                <th className="py-2.5 px-4 font-medium">Patient</th>
                <th className="py-2.5 px-4 font-medium">Served By</th>
                <th className="py-2.5 px-4 font-medium">Total</th>
                <th className="py-2.5 px-4 font-medium">Status</th>
                <th className="py-2.5 px-4 font-medium">Payment</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o, idx) => (
                <tr
                  key={o.id}
                  onClick={() => setOpenId(o.id)}
                  style={{ borderTop: idx ? `1px solid ${theme.border}` : 'none' }}
                  className="cursor-pointer hover:opacity-80"
                >
                  <td className="py-2.5 px-4" style={{ ...mono, color: theme.text }}>
                    #{o.id.toString().padStart(4, '0')}
                  </td>
                  <td className="py-2.5 px-4" style={{ ...mono, color: theme.muted }}>
                    {new Date(o.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4" style={{ color: theme.text }}>
                    {o.patientName ?? 'Walk-in'}
                  </td>
                  <td className="py-2.5 px-4 text-xs" style={{ color: theme.muted }}>
                    {(o as any).servedByName ?? '—'}
                  </td>
                  <td className="py-2.5 px-4" style={{ ...mono, color: theme.text }}>
                    {formatCurrency(parseFloat(o.total), settings)}
                  </td>
                  <td className="py-2.5 px-4">
                    <Pill label={o.status} kind={STATUS_COLOR[o.status] ?? 'ok'} theme={theme} />
                  </td>
                  <td className="py-2.5 px-4">
                    <Pill label={o.paymentStatus} kind={PAYMENT_COLOR[o.paymentStatus] ?? 'ok'} theme={theme} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {openId !== null && <SaleDetail orderId={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}
