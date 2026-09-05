import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { CreditCard, ChevronRight, Loader2, TrendingUp, Wallet, Search, X, Undo2, Download } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useListSupplierLedger,
  useGetSupplierLedger,
  useCreateSupplierPayment,
  getListSupplierLedgerQueryKey,
  getGetSupplierLedgerQueryKey,
  type SupplierPaymentInputMethod
} from '@workspace/api-client-react'
import { useUiStore } from '../store/uiStore'
import { getTheme, mono, serif } from '../theme'
import { useAuth } from '../hooks/useAuth'
import Modal from '../components/Modal'
import Field from '../components/Field'
import Loading from '../components/Loading'
import { apiUrl, authHeaders, jsonOrThrow } from '../lib/apiClient'
import { exportReportAsPdf, type ReportColumn } from '../lib/exportReport'
import { usePharmacySettings, formatCurrency } from '../hooks/usePharmacySettings'

// The generated SupplierLedgerEntry type hasn't caught up with the API — the
// server also returns voided/voidReason/method on payment entries. Same
// defensive pattern as NewSale's MedicineRow.
type LedgerEntryRow = import('@workspace/api-client-react').SupplierLedgerEntry & {
  voided?: boolean
  voidReason?: string | null
  method?: string | null
}

function balanceColor(balance: string, theme: ReturnType<typeof getTheme>): string {
  return parseFloat(balance) > 0 ? theme.red : theme.green
}

function RecordPaymentModal({
  supplierId,
  supplierName,
  onClose
}: {
  supplierId: number
  supplierName: string
  onClose: () => void
}): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const queryClient = useQueryClient()
  const createPayment = useCreateSupplierPayment()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<SupplierPaymentInputMethod>('cash')
  const [purchaseOrderId, setPurchaseOrderId] = useState('')
  const [note, setNote] = useState('')

  const submit = async (): Promise<void> => {
    if (!amount.trim() || parseFloat(amount) <= 0) {
      showToast('Enter a valid amount')
      return
    }
    try {
      const payment = await createPayment.mutateAsync({
        data: {
          supplierId,
          purchaseOrderId: purchaseOrderId.trim() ? Number(purchaseOrderId) : null,
          amount: amount.trim(),
          method,
          note: note.trim() || null
        }
      })
      queryClient.invalidateQueries({ queryKey: getListSupplierLedgerQueryKey() })
      queryClient.invalidateQueries({ queryKey: getGetSupplierLedgerQueryKey(supplierId) })
      showToast(`Payment of ${payment.amount} recorded`)
      onClose()
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't record payment")
    }
  }

  return (
    <Modal title={`Record payment to ${supplierName}`} onClose={onClose}>
      <Field label="Amount" value={amount} onChange={setAmount} placeholder="0.00" type="number" required />
      <label className="block mb-3">
        <span style={{ color: theme.muted }} className="text-xs mb-1.5 block">
          Payment method <span style={{ color: theme.red }}>*</span>
        </span>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as SupplierPaymentInputMethod)}
          style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
          className="w-full text-sm rounded-lg px-3 py-2 outline-none transition-all duration-150 focus:border-transparent focus:ring-2 focus:ring-emerald-500/40"
        >
          <option value="cash">Cash</option>
          <option value="bank">Bank Transfer</option>
          <option value="cheque">Cheque</option>
          <option value="transfer">Online Transfer</option>
        </select>
      </label>
      <Field
        label="Purchase order # (optional)"
        value={purchaseOrderId}
        onChange={setPurchaseOrderId}
        placeholder="Leave blank for a general payment"
        type="number"
      />
      <Field label="Note (optional)" value={note} onChange={setNote} placeholder="Cheque no., reference, etc." />
      <button
        onClick={submit}
        disabled={createPayment.isPending}
        style={{ background: theme.primary, color: '#fff' }}
        className="w-full mt-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
      >
        {createPayment.isPending && <Loader2 size={14} className="animate-spin" />}
        {createPayment.isPending ? 'Recording…' : 'Record payment'}
      </button>
    </Modal>
  )
}

function VoidPaymentModal({
  paymentId,
  amount,
  supplierName,
  onClose,
  onVoided
}: {
  paymentId: number
  amount: string
  supplierName: string
  onClose: () => void
  onVoided: () => void
}): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (): Promise<void> => {
    if (!reason.trim()) {
      showToast('A void reason is required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(apiUrl(`supplier-payments/${paymentId}/void`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ reason: reason.trim() })
      })
      await jsonOrThrow(res, "Couldn't void payment")
      showToast(`Payment of ${amount} voided`)
      onVoided()
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't void payment")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Void payment — ${supplierName}`} onClose={onClose} width={440}>
      <div style={{ background: theme.amberBg, color: theme.amber }} className="rounded-lg p-3 text-sm mb-4">
        <p className="font-medium mb-1">You're about to void a payment of {amount}.</p>
        <p className="opacity-80 text-xs">
          The payment will be marked as voided and excluded from the supplier ledger balance. This can't be
          undone — please confirm this payment was recorded by mistake.
        </p>
      </div>
      <Field
        label="Void reason"
        value={reason}
        onChange={setReason}
        placeholder="e.g. Wrong amount entered, duplicate payment…"
        textarea
      />
      <div className="flex gap-2 mt-2">
        <button
          onClick={onClose}
          disabled={saving}
          style={{ border: `1px solid ${theme.borderStrong}`, color: theme.text }}
          className="flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={saving}
          style={{ background: theme.amber, color: '#fff' }}
          className="flex-1 rounded-lg py-2 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {saving && <Loader2 size={13} className="animate-spin" />}
          Void payment
        </button>
      </div>
    </Modal>
  )
}

function LedgerDetailModal({
  supplierId,
  onClose,
  onPay
}: {
  supplierId: number
  onClose: () => void
  onPay: (id: number, name: string) => void
}): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const canVoid = user?.role === 'admin'
  const [voidTarget, setVoidTarget] = useState<{ id: number; amount: string } | null>(null)
  const [exporting, setExporting] = useState(false)
  const { data: settings } = usePharmacySettings()
  const { data: detail, isLoading } = useGetSupplierLedger(supplierId, {
    query: { queryKey: getGetSupplierLedgerQueryKey(supplierId) }
  })

  const exportPdf = async (): Promise<void> => {
    if (!detail) return
    setExporting(true)
    try {
      const columns: ReportColumn[] = [
        { header: 'Date', key: 'date' },
        { header: 'Description', key: 'description' },
        { header: 'Debit', key: 'debit', align: 'right' },
        { header: 'Credit', key: 'credit', align: 'right' },
        { header: 'Balance', key: 'balance', align: 'right' }
      ]
      const rows = detail.entries.map((e) => ({
        date: new Date(e.date).toLocaleDateString(),
        description: e.description,
        debit: parseFloat(e.debit) > 0 ? formatCurrency(parseFloat(e.debit), settings) : null,
        credit: parseFloat(e.credit) > 0 ? formatCurrency(parseFloat(e.credit), settings) : null,
        balance: formatCurrency(parseFloat(e.runningBalance), settings)
      }))
      const summary = [
        { label: 'Total Ordered', value: formatCurrency(parseFloat(detail.totalOrdered), settings) },
        { label: 'Total Paid', value: formatCurrency(parseFloat(detail.totalPaid), settings) },
        { label: 'Balance', value: formatCurrency(parseFloat(detail.balance), settings) }
      ]
      const safeName = detail.supplierName.replace(/[^a-z0-9]+/gi, '_')
      await exportReportAsPdf({
        fileName: `supplier-ledger-${safeName}`,
        title: `${detail.supplierName} — Supplier Ledger`,
        pharmacy: settings,
        columns,
        rows,
        summary
      })
    } finally {
      setExporting(false)
    }
  }

  const refresh = (): void => {
    queryClient.invalidateQueries({ queryKey: getListSupplierLedgerQueryKey() })
    queryClient.invalidateQueries({ queryKey: getGetSupplierLedgerQueryKey(supplierId) })
  }

  return (
    <Modal title={detail?.supplierName ?? 'Supplier ledger'} onClose={onClose} width={640}>
      {isLoading || !detail ? (
        <Loading label="Loading ledger…" centered={false} />
      ) : (
        <div>
          <div
            style={{ background: theme.cardAlt, border: `1px solid ${theme.border}` }}
            className="grid grid-cols-3 gap-3 rounded-lg p-4 text-center text-sm mb-3"
          >
            <div>
              <p style={{ color: theme.muted }} className="text-xs">
                Ordered
              </p>
              <p style={{ ...mono, color: theme.text }} className="mt-0.5 font-semibold">
                {detail.totalOrdered}
              </p>
            </div>
            <div>
              <p style={{ color: theme.muted }} className="text-xs">
                Paid
              </p>
              <p style={{ ...mono, color: theme.green }} className="mt-0.5 font-semibold">
                {detail.totalPaid}
              </p>
            </div>
            <div>
              <p style={{ color: theme.muted }} className="text-xs">
                Balance
              </p>
              <p style={{ ...mono, color: balanceColor(detail.balance, theme) }} className="mt-0.5 font-semibold">
                {detail.balance}
              </p>
            </div>
          </div>

          {(detail.contactName || detail.email || detail.phone) && (
            <div style={{ color: theme.muted }} className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-3">
              {detail.contactName && <span>Contact: {detail.contactName}</span>}
              {detail.email && <span>Email: {detail.email}</span>}
              {detail.phone && <span>Phone: {detail.phone}</span>}
            </div>
          )}

          <div style={{ border: `1px solid ${theme.border}` }} className="rounded-lg overflow-hidden max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  style={{ background: theme.cardAlt, color: theme.muted }}
                  className="text-left text-xs sticky top-0"
                >
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-3 py-2 font-medium text-right">Debit</th>
                  <th className="px-3 py-2 font-medium text-right">Credit</th>
                  <th className="px-3 py-2 font-medium text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {detail.entries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-sm" style={{ color: theme.muted }}>
                      No transactions yet.
                    </td>
                  </tr>
                ) : (
                  detail.entries.map((rawEntry) => {
                    const entry = rawEntry as LedgerEntryRow
                    return (
                    <tr
                      key={`${entry.entryType}-${entry.id}`}
                      style={{ borderTop: `1px solid ${theme.border}`, opacity: entry.voided ? 0.55 : 1 }}
                    >
                      <td className="px-3 py-2 text-xs" style={{ ...mono, color: theme.muted }}>
                        {new Date(entry.date).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span
                            style={{
                              background: entry.voided
                                ? theme.hover
                                : entry.entryType === 'purchase_order'
                                ? theme.amberBg
                                : theme.greenBg,
                              color: entry.voided
                                ? theme.muted
                                : entry.entryType === 'purchase_order'
                                ? theme.amber
                                : theme.green
                            }}
                            className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                          >
                            {entry.entryType === 'purchase_order' ? 'PO' : entry.voided ? 'VOID' : 'PMT'}
                          </span>
                          <span
                            style={{ color: entry.voided ? theme.muted : theme.text, textDecoration: entry.voided ? 'line-through' : 'none' }}
                            className="text-sm"
                          >
                            {entry.description}
                          </span>
                          {entry.voided && entry.voidReason && (
                            <span style={{ color: theme.muted }} className="text-xs italic">
                              — {entry.voidReason}
                            </span>
                          )}
                          {canVoid && entry.entryType === 'payment' && !entry.voided && entry.method !== 'credit' && (
                            <button
                              onClick={() => setVoidTarget({ id: entry.paymentId!, amount: entry.credit })}
                              title="Void this payment"
                              style={{ color: theme.amber, border: `1px solid ${theme.amber}55` }}
                              className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold hover:bg-[color:var(--row-hover)]"
                            >
                              <Undo2 size={11} /> Void
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-sm" style={{ ...mono, color: theme.red }}>
                        {parseFloat(entry.debit) > 0 ? entry.debit : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-sm" style={{ ...mono, color: theme.green }}>
                        {parseFloat(entry.credit) > 0 ? entry.credit : '—'}
                      </td>
                      <td
                        className="px-3 py-2 text-right text-sm font-medium"
                        style={{ ...mono, color: balanceColor(entry.runningBalance, theme) }}
                      >
                        {entry.runningBalance}
                      </td>
                    </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end mt-3 gap-2">
            <button
              onClick={exportPdf}
              disabled={exporting}
              style={{ color: theme.primaryText, background: theme.primarySoft, border: `1px solid ${theme.border}` }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
            >
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {exporting ? 'Exporting…' : 'Export PDF'}
            </button>
            <button
              onClick={() => onPay(detail.supplierId, detail.supplierName)}
              style={{ background: theme.primary, color: '#fff' }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium"
            >
              <CreditCard size={14} />
              Record payment
            </button>
          </div>

          {voidTarget && (
            <VoidPaymentModal
              paymentId={voidTarget.id}
              amount={voidTarget.amount}
              supplierName={detail.supplierName}
              onClose={() => setVoidTarget(null)}
              onVoided={() => {
                setVoidTarget(null)
                refresh()
              }}
            />
          )}
        </div>
      )}
    </Modal>
  )
}

export default function SupplierLedger(): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)
  const { data: summaries = [], isLoading } = useListSupplierLedger()
  const [viewingId, setViewingId] = useState<number | null>(null)
  const [payTarget, setPayTarget] = useState<{ id: number; name: string } | null>(null)

  const totalOrdered = summaries.reduce((sum, s) => sum + parseFloat(s.totalOrdered), 0)
  const totalPaid = summaries.reduce((sum, s) => sum + parseFloat(s.totalPaid), 0)
  const totalBalance = summaries.reduce((sum, s) => sum + parseFloat(s.balance), 0)

  const [search, setSearch] = useState('')
  const [balanceFilter, setBalanceFilter] = useState('all')

  const filteredSummaries = useMemo(() => {
    const q = search.trim().toLowerCase()
    return summaries.filter((s) => {
      if (q && !s.supplierName.toLowerCase().includes(q)) return false
      const bal = parseFloat(s.balance)
      if (balanceFilter === 'outstanding' && bal <= 0) return false
      if (balanceFilter === 'settled' && bal !== 0) return false
      if (balanceFilter === 'credit' && bal >= 0) return false
      return true
    })
  }, [summaries, search, balanceFilter])

  const hasActiveFilters = !!(search || balanceFilter !== 'all')

  const clearFilters = (): void => {
    setSearch('')
    setBalanceFilter('all')
  }

  return (
    <div className="p-7">
      <div className="mb-4">
        <h1 style={{ ...serif, color: theme.text }} className="text-xl font-semibold">
          Supplier Ledger
        </h1>
        <p style={{ color: theme.muted }} className="text-sm mt-0.5">
          Purchase orders, payments, and outstanding balances per supplier
        </p>
      </div>

      {!isLoading && summaries.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-xl p-4 flex items-center justify-between">
            <div>
              <p style={{ color: theme.muted }} className="text-xs mb-1">
                Total Ordered
              </p>
              <p style={{ ...mono, color: theme.text }} className="text-lg font-semibold">
                {totalOrdered.toFixed(2)}
              </p>
            </div>
            <TrendingUp size={16} color={theme.muted} />
          </div>
          <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-xl p-4 flex items-center justify-between">
            <div>
              <p style={{ color: theme.muted }} className="text-xs mb-1">
                Total Paid
              </p>
              <p style={{ ...mono, color: theme.green }} className="text-lg font-semibold">
                {totalPaid.toFixed(2)}
              </p>
            </div>
            <CreditCard size={16} color={theme.muted} />
          </div>
          <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-xl p-4 flex items-center justify-between">
            <div>
              <p style={{ color: theme.muted }} className="text-xs mb-1">
                Outstanding Balance
              </p>
              <p style={{ ...mono, color: theme.red }} className="text-lg font-semibold">
                {totalBalance.toFixed(2)}
              </p>
            </div>
            <Wallet size={16} color={theme.muted} />
          </div>
        </div>
      )}

      <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-xl overflow-hidden">
        {isLoading ? (
          <Loading label="Loading ledger…" />
        ) : summaries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
            <div style={{ background: theme.hover, color: theme.muted }} className="w-12 h-12 rounded-xl flex items-center justify-center mb-3">
              <Wallet size={22} />
            </div>
            <p style={{ color: theme.text }} className="text-base font-medium">
              No supplier activity yet
            </p>
            <p style={{ color: theme.muted }} className="text-sm mt-1 max-w-sm">
              Purchase orders and payments will be summarised here once you start ordering from suppliers.
            </p>
          </div>
        ) : (
          <>
            {/* Filter bar */}
            <div
              style={{ background: theme.card, borderBottom: `1px solid ${theme.border}` }}
              className="p-3 flex flex-wrap items-center gap-2"
            >
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg flex-1 min-w-[200px]"
                style={{ background: theme.cardAlt, border: `1px solid ${theme.border}` }}
              >
                <Search size={13} color={theme.muted} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by supplier…"
                  style={{ color: theme.text, background: 'transparent' }}
                  className="field-inbox w-full text-sm placeholder:opacity-50"
                />
                {search && (
                  <button onClick={() => setSearch('')} style={{ color: theme.muted }} className="hover:opacity-70">
                    <X size={13} />
                  </button>
                )}
              </div>
              <select
                value={balanceFilter}
                onChange={(e) => setBalanceFilter(e.target.value)}
                style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
                className="text-sm rounded-lg px-3 py-2 outline-none"
              >
                <option value="all">Balance (any)</option>
                <option value="outstanding">Has balance</option>
                <option value="settled">Settled</option>
                <option value="credit">Overpaid</option>
              </select>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  style={{ color: theme.muted }}
                  className="flex items-center gap-1 text-xs px-2 py-1.5 hover:opacity-70"
                >
                  <X size={12} /> Clear
                </button>
              )}
            </div>

            {hasActiveFilters && (
              <p style={{ color: theme.muted }} className="text-xs py-3 px-4">
                Showing {filteredSummaries.length} of {summaries.length} suppliers
              </p>
            )}

            {filteredSummaries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
                <div style={{ background: theme.hover, color: theme.muted }} className="w-12 h-12 rounded-xl flex items-center justify-center mb-3">
                  <Search size={22} />
                </div>
                <p style={{ color: theme.text }} className="text-base font-medium">
                  No matching suppliers
                </p>
                <p style={{ color: theme.muted }} className="text-sm mt-1 mb-4 max-w-sm">
                  Try a different name or balance filter.
                </p>
                <button
                  onClick={clearFilters}
                  style={{ color: theme.primaryText, background: theme.primarySoft }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
                >
                  <X size={14} /> Clear filters
                </button>
              </div>
            ) : (
              <table className="w-full text-sm">
            <thead>
              <tr
                style={{ color: theme.muted, borderBottom: `1px solid ${theme.border}` }}
                className="text-left text-xs uppercase tracking-wide"
              >
                <th className="py-2.5 px-4 font-medium">Supplier</th>
                <th className="py-2.5 px-4 font-medium text-right">Total Ordered</th>
                <th className="py-2.5 px-4 font-medium text-right">Total Paid</th>
                <th className="py-2.5 px-4 font-medium text-right">Balance</th>
                <th className="py-2.5 px-4 font-medium">Last Activity</th>
                <th className="py-2.5 px-4 font-medium text-right"></th>
              </tr>
            </thead>
            <tbody>
              {filteredSummaries.map((s, idx) => (
                <tr
                  key={s.supplierId}
                  style={{ borderTop: idx ? `1px solid ${theme.border}` : 'none', '--row-hover': theme.hover } as React.CSSProperties}
                  className="transition-colors hover:bg-[color:var(--row-hover)]"
                >
                  <td className="py-2.5 px-4" style={{ color: theme.text }}>
                    {s.supplierName}
                  </td>
                  <td className="py-2.5 px-4 text-right" style={{ ...mono, color: theme.muted }}>
                    {s.totalOrdered}
                  </td>
                  <td className="py-2.5 px-4 text-right" style={{ ...mono, color: theme.green }}>
                    {s.totalPaid}
                  </td>
                  <td className="py-2.5 px-4 text-right" style={{ ...mono, color: balanceColor(s.balance, theme) }}>
                    {s.balance}
                  </td>
                  <td className="py-2.5 px-4" style={{ ...mono, color: theme.muted }}>
                    {s.lastActivity ? new Date(s.lastActivity).toLocaleDateString() : '—'}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => setViewingId(s.supplierId)}
                        style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                      >
                        <ChevronRight size={12} />
                        View
                      </button>
                      <button
                        onClick={() => setPayTarget({ id: s.supplierId, name: s.supplierName })}
                        style={{ background: theme.primary, color: '#fff' }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                      >
                        <CreditCard size={12} />
                        Pay
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
            )}
          </>
        )}
      </div>

      {viewingId !== null && (
        <LedgerDetailModal
          supplierId={viewingId}
          onClose={() => setViewingId(null)}
          onPay={(id, name) => {
            setViewingId(null)
            setPayTarget({ id, name })
          }}
        />
      )}
      {payTarget && (
        <RecordPaymentModal supplierId={payTarget.id} supplierName={payTarget.name} onClose={() => setPayTarget(null)} />
      )}
    </div>
  )
}
