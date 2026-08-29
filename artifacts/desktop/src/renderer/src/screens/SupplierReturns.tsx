import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Plus, Loader2, Trash2, Eye, RotateCcw, Search, X } from 'lucide-react'
import { useListSuppliers, useListMedicines, getListMedicinesQueryKey } from '@workspace/api-client-react'
import type { Medicine } from '@workspace/api-client-react'
import {
  useListSupplierReturns,
  useSupplierReturnDetail,
  useMedicineBatches,
  useCreateSupplierReturn,
  type MedicineBatch,
  type SupplierReturn
} from '../hooks/useExtraQueries'
import { useUiStore } from '../store/uiStore'
import { getTheme, mono, serif } from '../theme'
import { usePharmacySettings, formatCurrency } from '../hooks/usePharmacySettings'
import Modal from '../components/Modal'
import Field from '../components/Field'

interface ReturnLine {
  medicine: Medicine
  batchId: number | null
  quantity: number
  unitCost: string
}

// One line item's medicine + batch picker. Split out so each line can run
// its own useMedicineBatches() query independently (batches are only ever
// fetched for a medicine once it's actually picked for a line).
function LineItemRow({
  line,
  onChange,
  onRemove
}: {
  line: ReturnLine
  onChange: (next: ReturnLine) => void
  onRemove: () => void
}): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)
  const { data: batches = [], isLoading } = useMedicineBatches(line.medicine.id)

  // A return can only target a batch with stock still left in it.
  const availableBatches = batches.filter((b) => b.quantity > 0)

  const selectedBatch = availableBatches.find((b) => b.id === line.batchId) ?? null

  return (
    <div style={{ border: `1px solid ${theme.border}` }} className="rounded-lg p-3 mb-2">
      <div className="flex items-center justify-between mb-2">
        <span style={{ color: theme.text }} className="text-sm font-medium">
          {line.medicine.name}
        </span>
        <button onClick={onRemove} style={{ color: theme.red }} className="hover:opacity-70">
          <Trash2 size={14} />
        </button>
      </div>
      {isLoading ? (
        <p style={{ color: theme.muted }} className="text-xs">
          Loading batches…
        </p>
      ) : availableBatches.length === 0 ? (
        <p style={{ color: theme.red }} className="text-xs">
          No received batches with remaining stock for this medicine.
        </p>
      ) : (
        <>
          <label className="block mb-2">
            <span style={{ color: theme.muted }} className="text-xs mb-1 block">
              Batch
            </span>
            <select
              value={line.batchId ?? ''}
              onChange={(e) => {
                const bid = Number(e.target.value)
                const batch = availableBatches.find((b) => b.id === bid)
                onChange({ ...line, batchId: bid, unitCost: batch?.costPrice ?? '' })
              }}
              style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
              className="w-full text-sm rounded-lg px-3 py-2 outline-none"
            >
              <option value="" disabled>
                Select a batch…
              </option>
              {availableBatches.map((b: MedicineBatch) => (
                <option key={b.id} value={b.id}>
                  {b.batchNumber ?? `Batch #${b.id}`} — {b.quantity} in stock
                  {b.expiryDate ? ` — exp. ${b.expiryDate}` : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3 mb-2">
            <label className="block">
              <span style={{ color: theme.muted }} className="text-xs mb-1 block">
                Quantity to return {selectedBatch ? `(max ${selectedBatch.quantity})` : ''}
              </span>
              <input
                type="number"
                min={1}
                max={selectedBatch?.quantity}
                value={line.quantity}
                onChange={(e) => onChange({ ...line, quantity: Number(e.target.value) })}
                style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
                className="w-full text-sm rounded-lg px-3 py-2 outline-none transition-all duration-150 focus:border-transparent focus:ring-2 focus:ring-emerald-500/40"
              />
            </label>
            <label className="block">
              <span style={{ color: theme.muted }} className="text-xs mb-1 block">
                Unit cost (credit value)
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={line.unitCost}
                placeholder="Defaults to purchase cost"
                onChange={(e) => onChange({ ...line, unitCost: e.target.value })}
                style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
                className="w-full text-sm rounded-lg px-3 py-2 outline-none transition-all duration-150 focus:border-transparent focus:ring-2 focus:ring-emerald-500/40"
              />
            </label>
          </div>
        </>
      )}
    </div>
  )
}

function NewReturnModal({ onClose }: { onClose: () => void }): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const createReturn = useCreateSupplierReturn()

  const { data: suppliers = [] } = useListSuppliers()
  const [supplierId, setSupplierId] = useState<number | ''>('')
  const [reason, setReason] = useState('')
  const [lines, setLines] = useState<ReturnLine[]>([])

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 150)
    return () => clearTimeout(t)
  }, [search])
  const medicineSearchParams = debouncedSearch.trim() ? { search: debouncedSearch.trim() } : undefined
  const { data: results = [] } = useListMedicines(medicineSearchParams, {
    query: { queryKey: getListMedicinesQueryKey(medicineSearchParams), enabled: !!debouncedSearch.trim() }
  })

  const addMedicine = (medicine: Medicine): void => {
    if (lines.some((l) => l.medicine.id === medicine.id)) return
    setLines((prev) => [...prev, { medicine, batchId: null, quantity: 1, unitCost: '' }])
    setSearch('')
  }

  const submit = async (): Promise<void> => {
    if (!supplierId) {
      showToast('Pick a supplier')
      return
    }
    if (!reason.trim()) {
      showToast('A reason is required')
      return
    }
    if (lines.length === 0) {
      showToast('Add at least one item to return')
      return
    }
    const incomplete = lines.find((l) => !l.batchId || l.quantity < 1)
    if (incomplete) {
      showToast(`Pick a batch and quantity for ${incomplete.medicine.name}`)
      return
    }

    try {
      const result = await createReturn.mutateAsync({
        supplierId,
        reason: reason.trim(),
        items: lines.map((l) => ({
          medicineId: l.medicine.id,
          medicineBatchId: l.batchId as number,
          quantity: l.quantity,
          ...(l.unitCost ? { unitCost: parseFloat(l.unitCost) } : {})
        }))
      })
      showToast(`Return recorded — credit of ${result.totalAmount}`)
      onClose()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to record return')
    }
  }

  return (
    <Modal title="New supplier return" onClose={onClose} width={520}>
      <label className="block mb-3">
        <span style={{ color: theme.muted }} className="text-xs mb-1.5 block">
          Supplier<span style={{ color: theme.red }}> *</span>
        </span>
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : '')}
          style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
          className="w-full text-sm rounded-lg px-3 py-2 outline-none transition-all duration-150 focus:border-transparent focus:ring-2 focus:ring-emerald-500/40"
        >
          <option value="" disabled>
            Select a supplier…
          </option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <Field label="Reason" value={reason} onChange={setReason} placeholder="e.g. Damaged in transit" required />

      <span style={{ color: theme.muted }} className="text-xs mb-1.5 block">
        Items
      </span>
      {lines.map((line) => (
        <LineItemRow
          key={line.medicine.id}
          line={line}
          onChange={(next) => setLines((prev) => prev.map((l) => (l.medicine.id === next.medicine.id ? next : l)))}
          onRemove={() => setLines((prev) => prev.filter((l) => l.medicine.id !== line.medicine.id))}
        />
      ))}

      <div className="relative mb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search medicine to add…"
          style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
          className="w-full text-sm rounded-lg px-3 py-2 outline-none placeholder:opacity-50"
        />
        {results.length > 0 && search.trim() && (
          <div
            style={{ background: theme.card, border: `1px solid ${theme.border}` }}
            className="absolute z-10 w-full mt-1 rounded-lg overflow-hidden max-h-40 overflow-y-auto shadow-lg"
          >
            {results.map((m) => (
              <button
                key={m.id}
                onClick={() => addMedicine(m)}
                style={{ color: theme.text }}
                className="w-full text-left text-sm px-3 py-2 hover:opacity-80 block"
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={submit}
        disabled={createReturn.isPending}
        style={{ background: theme.primary, color: '#fff' }}
        className="w-full mt-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
      >
        {createReturn.isPending && <Loader2 size={14} className="animate-spin" />}
        {createReturn.isPending ? 'Recording…' : 'Record return'}
      </button>
    </Modal>
  )
}

function ReturnDetailModal({ id, onClose }: { id: number; onClose: () => void }): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const { data: settings } = usePharmacySettings()
  const { data: detail, isLoading } = useSupplierReturnDetail(id)

  const copyReference = async (): Promise<void> => {
    if (!detail) return
    try {
      await navigator.clipboard.writeText(`Return #${detail.id} — ${detail.supplierName ?? 'Supplier'}`)
      showToast('Copied to clipboard')
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <Modal
      title={
        detail ? `Return #${detail.id} — ${detail.supplierName ?? 'Supplier'}` : 'Supplier return'
      }
      onClose={onClose}
      width={520}
    >
      {isLoading || !detail ? (
        <p style={{ color: theme.muted }} className="text-sm py-2">
          Loading return details…
        </p>
      ) : (
        <div className="space-y-4">
          <div style={{ color: theme.muted }} className="text-sm space-y-1">
            <p>
              <span style={{ color: theme.text }} className="font-medium">
                Reason:
              </span>{' '}
              {detail.reason}
            </p>
            <p>
              <span style={{ color: theme.text }} className="font-medium">
                Date:
              </span>{' '}
              {new Date(detail.createdAt).toLocaleString()}
            </p>
            <p>
              <span style={{ color: theme.text }} className="font-medium">
                Total credit:
              </span>{' '}
              <span style={{ color: theme.green, fontWeight: 600 }}>
                +{formatCurrency(parseFloat(String(detail.totalAmount)), settings)}
              </span>
            </p>
          </div>

          <div style={{ borderTop: `1px solid ${theme.border}` }} className="pt-3">
            <p style={{ color: theme.muted }} className="text-xs font-semibold uppercase tracking-wide mb-2">
              Items returned
            </p>
            {detail.items.length === 0 ? (
              <p style={{ color: theme.muted }} className="text-sm italic">
                No items found.
              </p>
            ) : (
              <div className="space-y-2">
                {detail.items.map((item) => (
                  <div
                    key={item.id}
                    style={{ border: `1px solid ${theme.border}`, background: theme.cardAlt }}
                    className="flex items-center justify-between text-sm rounded-lg px-3 py-2"
                  >
                    <div style={{ color: theme.text }}>
                      <span className="font-medium">{item.medicineName ?? `Medicine #${item.medicineId}`}</span>
                      <span style={{ color: theme.muted }} className="ml-2 text-xs">
                        batch #{item.medicineBatchId}
                      </span>
                    </div>
                    <div style={{ color: theme.muted }} className="text-right text-xs">
                      <p>
                        {item.quantity} × {formatCurrency(parseFloat(item.unitCost), settings)}
                      </p>
                      <p style={{ color: theme.text, fontWeight: 600 }}>
                        {formatCurrency(parseFloat(item.lineTotal), settings)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={copyReference}
            style={{ border: `1px solid ${theme.border}`, color: theme.text }}
            className="w-full py-2 rounded-lg text-xs font-medium hover:opacity-70"
          >
            Copy return reference
          </button>
        </div>
      )}
    </Modal>
  )
}

export default function SupplierReturns(): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)
  const { data: settings } = usePharmacySettings()
  const [showNew, setShowNew] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const { data: returns = [], isLoading, isError } = useListSupplierReturns()

  const [search, setSearch] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const suppliers = useMemo(() => {
    const map = new Map<string, string>()
    returns.forEach((r) => {
      const name = r.supplierName ?? ''
      if (name) map.set(String(r.supplierId), name)
    })
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [returns])

  const filteredReturns = useMemo(() => {
    const q = search.trim().toLowerCase()
    return returns.filter((r) => {
      if (supplierFilter !== 'all' && String(r.supplierId) !== supplierFilter) return false
      const day = r.createdAt?.slice(0, 10)
      if (fromDate && day < fromDate) return false
      if (toDate && day > toDate) return false
      if (q) {
        if (/^\d+$/.test(q)) {
          const numericQuery = Number(q)
          if (r.id !== numericQuery && r.purchaseOrderId !== numericQuery) return false
        } else {
          const haystack = `${r.supplierName ?? ''} ${r.reason ?? ''}`.toLowerCase()
          if (!haystack.includes(q)) return false
        }
      }
      return true
    })
  }, [returns, search, supplierFilter, fromDate, toDate])

  const hasActiveFilters = !!(search || supplierFilter !== 'all' || fromDate || toDate)

  const clearFilters = (): void => {
    setSearch('')
    setSupplierFilter('all')
    setFromDate('')
    setToDate('')
  }

  return (
    <div className="p-7">
      <div className="flex items-center justify-between mb-4">
        <h1 style={{ ...serif, color: theme.text }} className="text-xl font-semibold">
          Supplier Returns
        </h1>
        <button
          onClick={() => setShowNew(true)}
          style={{ background: theme.primary, color: '#fff' }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={14} />
          New return
        </button>
      </div>
      <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-xl overflow-hidden">
        {isLoading ? (
          <p style={{ color: theme.muted }} className="p-4 text-sm">
            Loading returns…
          </p>
        ) : isError ? (
          <p style={{ color: theme.red }} className="p-4 text-sm">
            Couldn&apos;t load supplier returns.
          </p>
        ) : returns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
            <div style={{ background: theme.primarySoft, color: theme.primaryText }} className="w-12 h-12 rounded-xl flex items-center justify-center mb-3">
              <RotateCcw size={22} />
            </div>
            <p style={{ color: theme.text }} className="text-base font-medium">
              No supplier returns yet
            </p>
            <p style={{ color: theme.muted }} className="text-sm mt-1 mb-4 max-w-sm">
              Record a return to track stock you&apos;ve sent back to a supplier and the credit due to you.
            </p>
            <button
              onClick={() => setShowNew(true)}
              style={{ background: theme.primary, color: '#fff' }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
            >
              <Plus size={14} /> New return
            </button>
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
                  placeholder="Search by return #, supplier, PO…"
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
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
                className="text-sm rounded-lg px-3 py-2 outline-none"
              >
                <option value="all">All suppliers</option>
                {suppliers.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
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
                Showing {filteredReturns.length} of {returns.length} returns
              </p>
            )}

            {filteredReturns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
                <div style={{ background: theme.hover, color: theme.muted }} className="w-12 h-12 rounded-xl flex items-center justify-center mb-3">
                  <Search size={22} />
                </div>
                <p style={{ color: theme.text }} className="text-base font-medium">
                  No matching returns
                </p>
                <p style={{ color: theme.muted }} className="text-sm mt-1 mb-4 max-w-sm">
                  Try adjusting your search or filters.
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
                <th className="py-2.5 px-4 font-medium">Return</th>
                <th className="py-2.5 px-4 font-medium">Supplier</th>
                <th className="py-2.5 px-4 font-medium">PO</th>
                <th className="py-2.5 px-4 font-medium">Reason</th>
                <th className="py-2.5 px-4 font-medium text-right">Credit</th>
                <th className="py-2.5 px-4 font-medium">Date</th>
                <th className="py-2.5 px-4 font-medium text-right"></th>
              </tr>
            </thead>
            <tbody>
              {filteredReturns.map((r, idx) => (
                <tr
                  key={r.id}
                  style={{ borderTop: idx ? `1px solid ${theme.border}` : 'none', '--row-hover': theme.hover } as React.CSSProperties}
                  className="transition-colors hover:bg-[color:var(--row-hover)]"
                >
                  <td className="py-2.5 px-4" style={{ ...mono, color: theme.primaryText }}>
                    #{String(r.id).padStart(4, '0')}
                  </td>
                  <td className="py-2.5 px-4" style={{ color: theme.text }}>
                    {r.supplierName ?? '—'}
                  </td>
                  <td className="py-2.5 px-4" style={{ ...mono, color: theme.muted }}>
                    {r.purchaseOrderId ? `#${r.purchaseOrderId}` : '—'}
                  </td>
                  <td className="py-2.5 px-4" style={{ color: theme.muted }}>
                    {r.reason}
                  </td>
                  <td className="py-2.5 px-4 text-right" style={{ ...mono, color: theme.green, fontWeight: 600 }}>
                    +{formatCurrency(parseFloat(String(r.totalAmount)), settings)}
                  </td>
                  <td className="py-2.5 px-4" style={{ ...mono, color: theme.muted }}>
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2.5 px-4">
                    <button
                      onClick={() => setDetailId(r.id)}
                      style={{ border: `1px solid ${theme.border}`, color: theme.text }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium hover:opacity-70"
                    >
                      <Eye size={13} /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
            )}
          </>
        )}
      </div>
      {showNew && <NewReturnModal onClose={() => setShowNew(false)} />}
      {detailId !== null && <ReturnDetailModal id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}
