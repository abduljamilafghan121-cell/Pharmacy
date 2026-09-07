import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { Loader2, Plus, Wallet, TrendingUp, Calendar, Search, X, Undo2, Download, ReceiptText } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useListExpenses,
  useCreateExpense,
  useVoidExpense,
  getListExpensesQueryKey,
  type ExpenseCategory,
  type ExpenseMethod,
  type ExpenseInputCategory,
  type ExpenseInputMethod
} from '@workspace/api-client-react'
import { useUiStore } from '../store/uiStore'
import { getTheme, mono, serif } from '../theme'
import Modal from '../components/Modal'
import Field from '../components/Field'
import Loading from '../components/Loading'
import { usePharmacySettings, formatCurrency } from '../hooks/usePharmacySettings'
import { exportReportAsPdf, type ReportColumn } from '../lib/exportReport'

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  rent: 'Rent',
  utilities: 'Utilities',
  salaries: 'Salaries',
  supplies: 'Supplies',
  maintenance: 'Maintenance',
  marketing: 'Marketing',
  transport: 'Transport',
  insurance: 'Insurance',
  miscellaneous: 'Miscellaneous'
}

const METHOD_LABELS: Record<ExpenseMethod, string> = {
  cash: 'Cash',
  bank: 'Bank',
  cheque: 'Cheque',
  transfer: 'Transfer',
  credit: 'Credit'
}

const CATEGORY_ORDER: ExpenseCategory[] = Object.keys(CATEGORY_LABELS) as ExpenseCategory[]

function AddExpenseModal({ onClose }: { onClose: () => void }): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const queryClient = useQueryClient()
  const createExpense = useCreateExpense()
  const [category, setCategory] = useState<ExpenseInputCategory>('miscellaneous')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<ExpenseInputMethod>('cash')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')

  const submit = async (): Promise<void> => {
    if (!description.trim()) {
      showToast('Enter a description')
      return
    }
    if (!amount.trim() || parseFloat(amount) <= 0) {
      showToast('Enter a valid amount')
      return
    }
    try {
      const expense = await createExpense.mutateAsync({
        data: {
          category,
          description: description.trim(),
          amount: amount.trim(),
          method,
          expenseDate: date || null,
          note: note.trim() || null
        }
      })
      queryClient.invalidateQueries({ queryKey: getListExpensesQueryKey() })
      showToast(`Expense of ${expense.amount} recorded`)
      onClose()
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't record expense")
    }
  }

  return (
    <Modal title="Record expense" onClose={onClose} width={480}>
      <label className="block mb-3">
        <span style={{ color: theme.muted }} className="text-xs mb-1.5 block">
          Category <span style={{ color: theme.red }}>*</span>
        </span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ExpenseInputCategory)}
          style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
          className="w-full text-sm rounded-lg px-3 py-2 outline-none transition-all duration-150 focus:border-transparent focus:ring-2 focus:ring-emerald-500/40"
        >
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </label>

      <Field label="Description" value={description} onChange={setDescription} placeholder="e.g. Monthly shop rent" required />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" value={amount} onChange={setAmount} placeholder="0.00" type="number" required />
        <label className="block mb-3">
          <span style={{ color: theme.muted }} className="text-xs mb-1.5 block">
            Payment method <span style={{ color: theme.red }}>*</span>
          </span>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as ExpenseInputMethod)}
            style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
            className="w-full text-sm rounded-lg px-3 py-2 outline-none transition-all duration-150 focus:border-transparent focus:ring-2 focus:ring-emerald-500/40"
          >
            {(Object.keys(METHOD_LABELS) as ExpenseMethod[]).map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Field label="Expense date" value={date} onChange={setDate} placeholder="YYYY-MM-DD" type="date" />
      <Field label="Note (optional)" value={note} onChange={setNote} placeholder="Receipt no., reference, etc." textarea />

      <button
        onClick={submit}
        disabled={createExpense.isPending}
        style={{ background: theme.primary, color: '#fff' }}
        className="w-full mt-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
      >
        {createExpense.isPending && <Loader2 size={14} className="animate-spin" />}
        {createExpense.isPending ? 'Recording…' : 'Record expense'}
      </button>
    </Modal>
  )
}

function VoidExpenseModal({
  expense,
  onClose,
  onVoided
}: {
  expense: { id: number; amount: string; category: string }
  onClose: () => void
  onVoided: () => void
}): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const queryClient = useQueryClient()
  const voidExpense = useVoidExpense()
  const [reason, setReason] = useState('')

  const submit = async (): Promise<void> => {
    if (!reason.trim()) {
      showToast('A void reason is required')
      return
    }
    try {
      await voidExpense.mutateAsync({ id: expense.id, data: { reason: reason.trim() } })
      queryClient.invalidateQueries({ queryKey: getListExpensesQueryKey() })
      showToast(`Expense of ${expense.amount} voided`)
      onVoided()
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't void expense")
    }
  }

  return (
    <Modal title="Void expense" onClose={onClose} width={440}>
      <div style={{ background: theme.amberBg, color: theme.amber }} className="rounded-lg p-3 text-sm mb-4">
        <p className="font-medium mb-1">You're about to void a {expense.category} expense of {expense.amount}.</p>
        <p className="opacity-80 text-xs">
          The expense will be marked as voided and excluded from the expenses ledger totals. This can't be undone —
          please confirm this expense was recorded by mistake.
        </p>
      </div>
      <Field
        label="Void reason"
        value={reason}
        onChange={setReason}
        placeholder="e.g. Wrong amount entered, duplicate expense…"
        textarea
      />
      <div className="flex gap-2 mt-2">
        <button
          onClick={onClose}
          disabled={voidExpense.isPending}
          style={{ border: `1px solid ${theme.borderStrong}`, color: theme.text }}
          className="flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={voidExpense.isPending}
          style={{ background: theme.amber, color: '#fff' }}
          className="flex-1 rounded-lg py-2 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {voidExpense.isPending && <Loader2 size={13} className="animate-spin" />}
          Void expense
        </button>
      </div>
    </Modal>
  )
}

export default function Expenses(): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const { data, isLoading } = useListExpenses()
  const { data: settings } = usePharmacySettings()
  const [addOpen, setAddOpen] = useState(false)
  const [voidTarget, setVoidTarget] = useState<{ id: number; amount: string; category: string } | null>(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'all' | ExpenseCategory>('all')
  const [exporting, setExporting] = useState(false)

  const entries = data?.entries ?? []
  const summary = data?.summary

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entries.filter((e) => {
      if (categoryFilter !== 'all' && e.category !== categoryFilter) return false
      if (q && !e.description.toLowerCase().includes(q) && !(e.recordedByName ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [entries, search, categoryFilter])

  const hasActiveFilters = !!(search || categoryFilter !== 'all')

  const clearFilters = (): void => {
    setSearch('')
    setCategoryFilter('all')
  }

  const exportPdf = async (): Promise<void> => {
    if (!data) return
    setExporting(true)
    try {
      const columns: ReportColumn[] = [
        { header: 'Date', key: 'date' },
        { header: 'Category', key: 'category' },
        { header: 'Description', key: 'description' },
        { header: 'Method', key: 'method' },
        { header: 'Amount', key: 'amount', align: 'right' },
        { header: 'Recorded By', key: 'recordedBy' }
      ]
      const rows = data.entries.map((e) => ({
        date: new Date(e.expenseDate).toLocaleDateString(),
        category: CATEGORY_LABELS[e.category],
        description: e.description,
        method: METHOD_LABELS[e.method],
        amount: formatCurrency(parseFloat(e.amount), settings),
        recordedBy: e.recordedByName ?? `#${e.recordedById ?? ''}`
      }))
      const summaryRows = [
        { label: 'Total (all time)', value: formatCurrency(parseFloat(data.summary.total), settings) },
        { label: 'This month', value: formatCurrency(parseFloat(data.summary.thisMonth), settings) },
        ...CATEGORY_ORDER.map((c) => ({
          label: CATEGORY_LABELS[c],
          value: formatCurrency(parseFloat(data.summary.byCategory[c] ?? '0'), settings)
        }))
      ]
      await exportReportAsPdf({
        fileName: 'expenses-ledger',
        title: 'Expenses Ledger',
        pharmacy: settings,
        columns,
        rows,
        summary: summaryRows
      })
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not export report')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="p-7">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 style={{ ...serif, color: theme.text }} className="text-xl font-semibold">
            Expenses
          </h1>
          <p style={{ color: theme.muted }} className="text-sm mt-0.5">
            Record and track business spending
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          style={{ background: theme.primary, color: '#fff' }}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={14} />
          Record expense
        </button>
      </div>

      {summary && (
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-xl p-4 flex items-center justify-between">
            <div>
              <p style={{ color: theme.muted }} className="text-xs mb-1">
                Total Expenses
              </p>
              <p style={{ ...mono, color: theme.text }} className="text-lg font-semibold">
                {summary.total}
              </p>
            </div>
            <Wallet size={16} color={theme.muted} />
          </div>
          <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-xl p-4 flex items-center justify-between">
            <div>
              <p style={{ color: theme.muted }} className="text-xs mb-1">
                This Month
              </p>
              <p style={{ ...mono, color: theme.red }} className="text-lg font-semibold">
                {summary.thisMonth}
              </p>
            </div>
            <TrendingUp size={16} color={theme.muted} />
          </div>
          <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-xl p-4 flex items-center justify-between">
            <div>
              <p style={{ color: theme.muted }} className="text-xs mb-1">
                Today's Date
              </p>
              <p style={{ ...mono, color: theme.muted }} className="text-lg font-semibold">
                {new Date().toLocaleDateString()}
              </p>
            </div>
            <Calendar size={16} color={theme.muted} />
          </div>
        </div>
      )}

      {summary && (
        <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-xl p-4 mb-4">
          <p style={{ color: theme.muted }} className="text-xs mb-3 font-medium">
            Spending by category
          </p>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_ORDER.map((c) => {
              const value = parseFloat(summary.byCategory[c] ?? '0')
              return (
                <button
                  key={c}
                  onClick={() => setCategoryFilter(categoryFilter === c ? 'all' : c)}
                  style={{
                    background: categoryFilter === c ? theme.primarySoft : theme.cardAlt,
                    border: `1px solid ${categoryFilter === c ? theme.primary : theme.border}`,
                    color: categoryFilter === c ? theme.primaryText : theme.text
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
                >
                  <span className="font-medium">{CATEGORY_LABELS[c]}</span>
                  <span style={{ ...mono, color: theme.muted }}>
                    {value > 0 ? summary.byCategory[c] : '—'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-xl overflow-hidden">
        {isLoading ? (
          <Loading label="Loading expenses…" />
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
            <div style={{ background: theme.hover, color: theme.muted }} className="w-12 h-12 rounded-xl flex items-center justify-center mb-3">
              <ReceiptText size={22} />
            </div>
            <p style={{ color: theme.text }} className="text-base font-medium">
              No expenses recorded yet
            </p>
            <p style={{ color: theme.muted }} className="text-sm mt-1 max-w-sm">
              Rent, utilities, salaries and other business costs will show here once you record your first expense.
            </p>
            <button
              onClick={() => setAddOpen(true)}
              style={{ background: theme.primary, color: '#fff' }}
              className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
            >
              <Plus size={14} /> Record expense
            </button>
          </div>
        ) : (
          <>
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
                  placeholder="Search by description or recorded by…"
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
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as 'all' | ExpenseCategory)}
                style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
                className="text-sm rounded-lg px-3 py-2 outline-none"
              >
                <option value="all">All categories</option>
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
              <button
                onClick={exportPdf}
                disabled={exporting}
                style={{ color: theme.primaryText, background: theme.primarySoft, border: `1px solid ${theme.border}` }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
              >
                {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                {exporting ? 'Exporting…' : 'Export PDF'}
              </button>
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
                Showing {filteredEntries.length} of {entries.length} expenses
              </p>
            )}

            {filteredEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
                <div style={{ background: theme.hover, color: theme.muted }} className="w-12 h-12 rounded-xl flex items-center justify-center mb-3">
                  <Search size={22} />
                </div>
                <p style={{ color: theme.text }} className="text-base font-medium">
                  No matching expenses
                </p>
                <p style={{ color: theme.muted }} className="text-sm mt-1 mb-4 max-w-sm">
                  Try a different search or category filter.
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
                    <th className="py-2.5 px-4 font-medium">Date</th>
                    <th className="py-2.5 px-4 font-medium">Category</th>
                    <th className="py-2.5 px-4 font-medium">Description</th>
                    <th className="py-2.5 px-4 font-medium">Method</th>
                    <th className="py-2.5 px-4 font-medium text-right">Amount</th>
                    <th className="py-2.5 px-4 font-medium">Recorded By</th>
                    <th className="py-2.5 px-4 font-medium text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((e, idx) => (
                    <tr
                      key={e.id}
                      style={{
                        borderTop: idx ? `1px solid ${theme.border}` : 'none',
                        opacity: e.voided ? 0.55 : 1,
                        '--row-hover': theme.hover
                      } as React.CSSProperties}
                      className="transition-colors hover:bg-[color:var(--row-hover)]"
                    >
                      <td className="py-2.5 px-4" style={{ ...mono, color: theme.muted }}>
                        {new Date(e.expenseDate).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          style={{
                            background: e.voided ? theme.hover : theme.amberBg,
                            color: e.voided ? theme.muted : theme.amber,
                            textDecoration: e.voided ? 'line-through' : 'none'
                          }}
                          className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                        >
                          {CATEGORY_LABELS[e.category] ?? e.category}
                        </span>
                      </td>
                      <td className="py-2.5 px-4" style={{ color: e.voided ? theme.muted : theme.text }}>
                        {e.description}
                        {e.voided && e.voidReason && (
                          <span style={{ color: theme.muted }} className="text-xs italic block">
                            Voided — {e.voidReason}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4" style={{ color: theme.muted }}>
                        {METHOD_LABELS[e.method] ?? e.method}
                      </td>
                      <td
                        className="py-2.5 px-4 text-right"
                        style={{
                          ...mono,
                          color: e.voided ? theme.muted : theme.red,
                          textDecoration: e.voided ? 'line-through' : 'none'
                        }}
                      >
                        {e.amount}
                      </td>
                      <td className="py-2.5 px-4" style={{ color: theme.muted }}>
                        {e.recordedByName ?? '—'}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex justify-end">
                          {!e.voided && (
                            <button
                              onClick={() => setVoidTarget({ id: e.id, amount: e.amount, category: CATEGORY_LABELS[e.category] })}
                              title="Void this expense"
                              style={{ color: theme.amber, border: `1px solid ${theme.amber}55` }}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold hover:bg-[color:var(--row-hover)]"
                            >
                              <Undo2 size={11} /> Void
                            </button>
                          )}
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

      {addOpen && <AddExpenseModal onClose={() => setAddOpen(false)} />}
      {voidTarget && (
        <VoidExpenseModal
          expense={voidTarget}
          onClose={() => setVoidTarget(null)}
          onVoided={() => setVoidTarget(null)}
        />
      )}
    </div>
  )
}