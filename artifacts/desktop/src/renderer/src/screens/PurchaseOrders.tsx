import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Loader2, Trash2, Search, PackageCheck, Scan, X, Eye, PackagePlus, PackageSearch, Undo2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useListPurchaseOrders,
  useCreatePurchaseOrder,
  useReceivePurchaseOrder,
  useGetPurchaseOrder,
  getGetPurchaseOrderQueryKey,
  useListSuppliers,
  useListMedicines,
  getListPurchaseOrdersQueryKey,
  getListMedicinesQueryKey
} from '@workspace/api-client-react'
import type { Medicine, Supplier, PurchaseOrder } from '@workspace/api-client-react'
import { useUiStore } from '../store/uiStore'
import { useAuth } from '../hooks/useAuth'
import { getTheme, mono, serif } from '../theme'
import { usePharmacySettings, formatCurrency } from '../hooks/usePharmacySettings'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'
import { useMedicineBatches, type MedicineBatch } from '../hooks/useExtraQueries'
import { apiUrl, authHeaders, jsonOrThrow } from '../lib/apiClient'
import Modal from '../components/Modal'
import Loading from '../components/Loading'

// The server computes and returns itemCount on the purchase-order list rows,
// but the generated PurchaseOrder type doesn't model it yet — declare it here.
type PurchaseOrderRow = PurchaseOrder & { itemCount?: number }

// Matches purchaseOrderStatusEnum in lib/db/src/schema/purchase-orders.ts — a purchase
// order is only ever "pending", "received", or "cancelled" (no "completed"/"ordered").
const STATUS_COLOR: Record<string, 'ok' | 'low' | 'expiring'> = {
  received: 'ok',
  pending: 'low',
  cancelled: 'expiring'
}

function StatusPill({ status, theme }: { status: string; theme: ReturnType<typeof getTheme> }): ReactElement {
  const kind = STATUS_COLOR[status] ?? 'ok'
  const bg = kind === 'ok' ? theme.greenBg : kind === 'low' ? theme.amberBg : theme.redBg
  const fg = kind === 'ok' ? theme.green : kind === 'low' ? theme.amber : theme.red
  return (
    <span style={{ background: bg, color: fg }} className="inline-block px-2 py-0.5 rounded-full text-xs capitalize">
      {status}
    </span>
  )
}

interface Line {
  medicine: Medicine
  quantity: number
  unitId?: number
  unitName?: string
  conversionFactor: number
  unitPrice: string
}

interface PriceHistoryRow {
  unitPrice: string
  quantity: number
  createdAt: string
  supplierName?: string | null
  poId: number
}

function usePriceHistory(): {
  history: Record<number, PriceHistoryRow[]>
  fetch: (medicineId: number) => Promise<void>
} {
  const [history, setHistory] = useState<Record<number, PriceHistoryRow[]>>({})
  const fetchHistory = useCallback(async (medicineId: number): Promise<void> => {
    if (history[medicineId]) return
    try {
      const res = await fetch(apiUrl(`purchase-orders/price-history?medicineId=${medicineId}`), {
        headers: authHeaders()
      })
      if (res.ok) {
        const data = (await res.json()) as PriceHistoryRow[]
        setHistory((prev) => ({ ...prev, [medicineId]: data }))
      }
    } catch {
      /* silent — history is informational */
    }
  }, [history])
  return { history, fetch: fetchHistory }
}

function getMedicineUnits(medicine: Medicine) {
  return (medicine as Medicine & { units?: { id: number; unitName: string; conversionFactorToBase: number; isBaseUnit: boolean }[] }).units ?? []
}

function CreatePurchaseOrderModal({ onClose }: { onClose: () => void }): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const queryClient = useQueryClient()
  const createPO = useCreatePurchaseOrder()
  const { data: suppliers = [] } = useListSuppliers()
  const priceHistory = usePriceHistory()
  const [supplierId, setSupplierId] = useState<number | ''>('')
  const [search, setSearch] = useState('')
  const { data: results = [] } = useListMedicines(search.trim() ? { search: search.trim() } : undefined)
  const [lines, setLines] = useState<Line[]>([])

  const addLine = (m: Medicine): void => {
    if (lines.some((l) => l.medicine.id === m.id)) return
    // Default to the base unit if one is defined (same as web's selectMedicine)
    const units = getMedicineUnits(m)
    const baseUnit = units.find((u) => u.isBaseUnit) ?? units.find((u) => u.conversionFactorToBase === 1) ?? units[0]
    setLines((prev) => [
      ...prev,
      {
        medicine: m,
        quantity: 1,
        unitId: baseUnit?.id,
        unitName: baseUnit?.unitName,
        conversionFactor: baseUnit?.conversionFactorToBase ?? 1,
        unitPrice: m.price
      }
    ])
    setSearch('')
    priceHistory.fetch(m.id)
  }

  // Unit price = base price × conversion factor (buying larger packs costs proportionally more)
  const selectUnit = (id: number, unitId: number | undefined): void => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.medicine.id !== id) return l
        const units = getMedicineUnits(l.medicine)
        const unit = units.find((u) => u.id === unitId)
        return {
          ...l,
          unitId: unit?.id,
          unitName: unit?.unitName,
          conversionFactor: unit?.conversionFactorToBase ?? 1,
          unitPrice: unit ? (parseFloat(l.medicine.price) * unit.conversionFactorToBase).toFixed(2) : l.medicine.price
        }
      })
    )
  }

  const updateLine = (id: number, patch: Partial<Line>): void => {
    setLines((prev) => prev.map((l) => (l.medicine.id === id ? { ...l, ...patch } : l)))
  }

  const removeLine = (id: number): void => {
    setLines((prev) => prev.filter((l) => l.medicine.id !== id))
  }

  const total = lines.reduce((sum, l) => sum + l.quantity * parseFloat(l.unitPrice || '0'), 0)

  const submit = async (): Promise<void> => {
    if (!supplierId) {
      showToast('Choose a supplier')
      return
    }
    if (lines.length === 0) {
      showToast('Add at least one medicine')
      return
    }
    try {
      await createPO.mutateAsync({
        data: {
          supplierId,
          items: lines.map((l) => ({
            medicineId: l.medicine.id,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            ...(l.unitId ? { unitId: l.unitId } : {})
          }))
        }
      })
      queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() })
      showToast('Purchase order created')
      onClose()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create purchase order')
    }
  }

  return (
    <Modal title="Create purchase order" onClose={onClose} width={560}>
      <label className="block mb-3">
        <span style={{ color: theme.muted }} className="text-xs mb-1.5 block">
          Supplier <span style={{ color: theme.red }}>*</span>
        </span>
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : '')}
          style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
          className="w-full text-sm rounded-lg px-3 py-2 outline-none"
        >
          <option value="">Select a supplier…</option>
          {suppliers.map((s: Supplier) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block mb-2 relative">
        <span style={{ color: theme.muted }} className="text-xs mb-1.5 block">
          Add medicine
        </span>
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ background: theme.cardAlt, border: `1px solid ${theme.border}` }}
        >
          <Search size={13} color={theme.muted} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search medicine name…"
            style={{ color: theme.text, background: 'transparent' }}
            className="field-inbox w-full text-sm placeholder:opacity-50"
          />
        </div>
        {search.trim() && results.length > 0 && (
          <div
            style={{ background: theme.card, border: `1px solid ${theme.border}` }}
            className="absolute z-10 left-0 right-0 mt-1 rounded-lg overflow-hidden shadow-xl max-h-40 overflow-y-auto"
          >
            {results.slice(0, 8).map((m: Medicine) => (
              <button
                key={m.id}
                onClick={() => addLine(m)}
                style={{ color: theme.text }}
                className="w-full text-left px-3 py-2 text-sm hover:opacity-70 flex justify-between"
              >
                <span>{m.name}</span>
                <span style={{ ...mono, color: theme.muted }}>{m.price}</span>
              </button>
            ))}
          </div>
        )}
      </label>

      {lines.length > 0 && (
        <div className="space-y-2.5 mt-3 mb-4 max-h-72 overflow-y-auto pr-0.5">
          {lines.map((l) => {
            const units = getMedicineUnits(l.medicine)
            const history = priceHistory.history[l.medicine.id] ?? []
            return (
              <div key={l.medicine.id} style={{ border: `1px solid ${theme.border}`, background: theme.cardAlt }} className="rounded-lg p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p style={{ color: theme.text }} className="text-sm font-medium truncate">
                      {l.medicine.name}
                      {l.unitName && (
                        <span style={{ color: theme.muted }} className="font-normal">
                          {' '}
                          · {l.unitName} (×{l.conversionFactor})
                        </span>
                      )}
                    </p>
                    {l.conversionFactor > 1 && (
                      <p style={{ color: theme.muted }} className="text-[10px]">
                        1 {l.unitName} = {l.conversionFactor} base units
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => removeLine(l.medicine.id)}
                    style={{ color: theme.muted, '--row-hover': theme.hover } as React.CSSProperties}
                    className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors hover:bg-[color:var(--row-hover)]"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {units.length > 0 && (
                    <select
                      value={l.unitId ?? ''}
                      onChange={(e) => selectUnit(l.medicine.id, e.target.value ? Number(e.target.value) : undefined)}
                      style={{ background: theme.card, border: `1px solid ${theme.border}`, color: theme.text }}
                      className="text-xs rounded-md px-2 py-1.5 outline-none"
                      title="Packaging unit"
                    >
                      {[...units]
                        .sort((a, b) => a.conversionFactorToBase - b.conversionFactorToBase)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.unitName} (×{u.conversionFactorToBase})
                          </option>
                        ))}
                    </select>
                  )}
                  <input
                    type="number"
                    min={1}
                    value={l.quantity}
                    onChange={(e) => updateLine(l.medicine.id, { quantity: Math.max(1, Number(e.target.value)) })}
                    style={{ ...mono, background: theme.card, border: `1px solid ${theme.border}`, color: theme.text }}
                    className="w-16 text-sm rounded-md px-2 py-1.5 outline-none"
                    title="Quantity"
                  />
                  <span style={{ color: theme.muted }} className="text-xs">
                    ×
                  </span>
                  <input
                    value={l.unitPrice}
                    onChange={(e) => updateLine(l.medicine.id, { unitPrice: e.target.value })}
                    style={{ ...mono, background: theme.card, border: `1px solid ${theme.border}`, color: theme.text }}
                    className="w-20 text-sm rounded-md px-2 py-1.5 outline-none"
                    title="Unit cost"
                  />
                  <span style={{ ...mono, color: theme.primaryText }} className="text-sm font-semibold ml-auto">
                    ${(l.quantity * parseFloat(l.unitPrice || '0')).toFixed(2)}
                  </span>
                </div>

                {history.length > 0 && (
                  <div style={{ background: theme.hover, border: `1px solid ${theme.border}` }} className="rounded-md p-2 text-[11px] space-y-1">
                    <p style={{ color: theme.muted }} className="font-medium">
                      Recent purchase prices
                    </p>
                    {history.slice(0, 3).map((h, i) => (
                      <div key={i} className="flex justify-between gap-2">
                        <span style={{ color: theme.muted }} className="truncate">
                          {h.supplierName ?? 'Unknown'} · {new Date(h.createdAt).toLocaleDateString()}
                        </span>
                        <span style={{ ...mono, color: theme.text }}>${parseFloat(h.unitPrice).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          <div style={{ background: theme.card, border: `1px solid ${theme.border}`, color: theme.text }} className="flex justify-between px-3 py-2.5 rounded-lg text-sm font-semibold">
            <span>Total</span>
            <span style={mono}>${total.toFixed(2)}</span>
          </div>
        </div>
      )}

      <button
        onClick={submit}
        disabled={createPO.isPending}
        style={{ background: theme.primary, color: '#fff' }}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
      >
        {createPO.isPending && <Loader2 size={14} className="animate-spin" />}
        {createPO.isPending ? 'Creating…' : 'Create purchase order'}
      </button>
    </Modal>
  )
}

// ── Receive PO modal: per-line batch choices + scan-to-receive ──────────────

// Per-medicine choice made while receiving a PO: either top up an existing,
// non-expired batch (choice = its batch id) or create a new one ("new").
type ReceiveLineState = { choice: 'new' | number; batchNumber: string; expiryDate: string }

function ReceivePOModal({ poId, onClose }: { poId: number; onClose: () => void }): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const queryClient = useQueryClient()

  const { data: order, isLoading } = useGetPurchaseOrder(poId, {
    query: { enabled: poId !== null, queryKey: getGetPurchaseOrderQueryKey(poId) }
  })

  const { data: allMedicines = [] } = useListMedicines()
  const medicines = allMedicines as (Medicine & { barcode?: string | null })[]

  const [poScanMode, setPoScanMode] = useState(false)
  const [scannedCounts, setScannedCounts] = useState<Record<number, number>>({})
  const [poScanFlash, setPoScanFlash] = useState<string | null>(null)
  const [batchOptions, setBatchOptions] = useState<Record<number, MedicineBatch[]>>({})
  const [receiveLines, setReceiveLines] = useState<Record<number, ReceiveLineState>>({})

  const receiveMutation = useReceivePurchaseOrder({
    mutation: {
      onSuccess: (received: any) => {
        showToast(`Purchase order #${received.id} received — inventory updated`)
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() })
        queryClient.invalidateQueries({ queryKey: getListMedicinesQueryKey(undefined) })
        queryClient.invalidateQueries({ queryKey: getGetPurchaseOrderQueryKey(received.id) })
        queryClient.invalidateQueries({ queryKey: ['medicine-batches'] })
        onClose()
      },
      onError: (err: Error) => showToast(err.message || 'Could not receive purchase order')
    }
  })

  const handlePoBarcodeScan = useCallback(
    (barcode: string): void => {
      if (!order) return
      const medicine = medicines.find((m) => m.barcode === barcode)
      if (!medicine) {
        showToast(`Barcode not recognised: ${barcode}`)
        return
      }
      const poItem = (order.items ?? []).find((item: any) => item.medicineId === medicine.id)
      if (!poItem) {
        showToast(`${medicine.name} is not a line on this purchase order`)
        return
      }
      setScannedCounts((prev) => ({ ...prev, [medicine.id]: (prev[medicine.id] ?? 0) + 1 }))
      setPoScanFlash(medicine.name)
      setTimeout(() => setPoScanFlash(null), 1500)
    },
    [order, medicines, showToast]
  )

  useBarcodeScanner({ onScan: handlePoBarcodeScan, enabled: poScanMode })

  // Load sellable batch options for each line and default lines to "new batch"
  useEffect(() => {
    if (!order || order.status !== 'pending' || !order.items?.length) return
    const ids = Array.from(new Set(order.items.map((i) => i.medicineId)))
    const today = new Date().toISOString().slice(0, 10)
    const load = async (): Promise<void> => {
      const entries = await Promise.all(
        ids.map(async (mid) => {
          try {
            const res = await fetch(apiUrl(`medicines/${mid}/batches`), { headers: authHeaders() })
            if (!res.ok) return [mid, []] as const
            const data = (await res.json()) as MedicineBatch[]
            const sellable = data.filter((b) => !b.writeOffAt && (!b.expiryDate || b.expiryDate >= today))
            return [mid, sellable] as const
          } catch {
            return [mid, []] as const
          }
        })
      )
      setBatchOptions((prev) => ({ ...prev, ...Object.fromEntries(entries) }))
    }
    load()
    setReceiveLines((prev) => {
      const next = { ...prev }
      let changed = false
      for (const mid of ids) {
        if (!next[mid]) {
          next[mid] = { choice: 'new', batchNumber: '', expiryDate: '' }
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [order?.id, order?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateReceiveLine = (medicineId: number, patch: Partial<ReceiveLineState>): void => {
    setReceiveLines((prev) => ({
      ...prev,
      [medicineId]: {
        ...(prev[medicineId] ?? { choice: 'new', batchNumber: '', expiryDate: '' }),
        ...patch
      }
    }))
  }

  const handleReceive = (): void => {
    if (!order) return
    if (!window.confirm('Receive this purchase and add its quantities to inventory?')) return
    const items = (order.items ?? []).map((item) => {
      const line = receiveLines[item.medicineId]
      if (line && typeof line.choice === 'number') {
        return { medicineId: item.medicineId, batchId: line.choice }
      }
      const batchNumber = line?.batchNumber?.trim()
      const expiryDate = line?.expiryDate
      return {
        medicineId: item.medicineId,
        ...(batchNumber ? { batchNumber } : {}),
        ...(expiryDate ? { expiryDate } : {})
      }
    })
    receiveMutation.mutate({ id: order.id, data: { items } })
  }

  const inputStyle = {
    background: theme.cardAlt,
    border: `1px solid ${theme.border}`,
    color: theme.text
  }

  return (
    <Modal title={`Receive Purchase Order #${poId}`} onClose={onClose} width={600}>
      {isLoading || !order ? (
        <Loading label="Loading order…" centered={false} />
      ) : order.status !== 'pending' ? (
        <p style={{ color: theme.muted }} className="text-sm py-4 text-center">
          This order is already {order.status}.
        </p>
      ) : (
        <div className="space-y-3">
          {/* Scan-to-receive toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPoScanMode((v) => !v)}
              style={
                poScanMode
                  ? { background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)', color: '#fff' }
                  : { border: `1px solid ${theme.borderStrong}`, color: theme.text }
              }
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            >
              <Scan size={13} /> {poScanMode ? 'Scanning — point at item…' : 'Scan to Receive'}
            </button>
            {poScanFlash && (
              <span style={{ color: theme.primaryText }} className="text-xs font-semibold animate-fade-in">
                ✓ {poScanFlash}
              </span>
            )}
          </div>

          {(order.items ?? []).map((item) => {
            const mid = item.medicineId
            const line = receiveLines[mid] ?? { choice: 'new' as const, batchNumber: '', expiryDate: '' }
            const options = batchOptions[mid] ?? []
            const scanned = scannedCounts[mid] ?? 0
            return (
              <div key={item.id} style={{ border: `1px solid ${theme.border}`, background: theme.cardAlt }} className="rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span style={{ color: theme.text }} className="text-sm font-medium">
                    {item.medicineName ?? `Medicine #${mid}`}
                  </span>
                  <span style={{ ...mono, color: theme.muted }} className="text-xs">
                    ordered {item.quantity}
                    {scanned > 0 && (
                      <span style={{ color: theme.primaryText }} className="ml-2 font-semibold">
                        scanned {scanned}
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={typeof line.choice === 'number' ? String(line.choice) : 'new'}
                    onChange={(e) =>
                      updateReceiveLine(mid, {
                        choice: e.target.value === 'new' ? 'new' : Number(e.target.value)
                      })
                    }
                    style={inputStyle}
                    className="text-xs rounded-md px-2 py-1.5 outline-none"
                  >
                    <option value="new">Create new batch</option>
                    {options.map((b) => (
                      <option key={b.id} value={b.id}>
                        Top up {b.batchNumber ? `batch ${b.batchNumber}` : `#${b.id}`} ({b.quantity} left)
                      </option>
                    ))}
                  </select>
                  {typeof line.choice !== 'number' && (
                    <>
                      <input
                        placeholder="Batch № (optional)"
                        value={line.batchNumber}
                        onChange={(e) => updateReceiveLine(mid, { batchNumber: e.target.value })}
                        style={{ ...mono, ...inputStyle }}
                        className="text-xs rounded-md px-2 py-1.5 outline-none placeholder:opacity-50 w-36"
                      />
                      <input
                        type="date"
                        value={line.expiryDate}
                        onChange={(e) => updateReceiveLine(mid, { expiryDate: e.target.value })}
                        style={inputStyle}
                        className="text-xs rounded-md px-2 py-1.5 outline-none"
                      />
                    </>
                  )}
                </div>
              </div>
            )
          })}

          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              style={{ border: `1px solid ${theme.borderStrong}`, color: theme.text }}
              className="flex-1 rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1.5"
            >
              <X size={13} /> Cancel
            </button>
            <button
              onClick={handleReceive}
              disabled={receiveMutation.isPending}
              style={{ background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)' }}
              className="flex-[2] rounded-lg py-2 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {receiveMutation.isPending && <Loader2 size={13} className="animate-spin" />}
              <PackageCheck size={14} /> Receive and update inventory
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── View PO modal: read-only detail for received/cancelled/pending ──────────
function ViewPOModal({
  poId,
  preview,
  onClose
}: {
  poId: number
  preview: PurchaseOrder | undefined
  onClose: () => void
}): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const canReverse = user?.role === 'admin'
  const { data: settings } = usePharmacySettings()
  const { data: full, isLoading } = useGetPurchaseOrder(poId)
  const po = full ?? preview
  const items = po?.items ?? []
  const total = po?.total
  const [reversing, setReversing] = useState(false)

  const handleReverse = async (): Promise<void> => {
    if (!window.confirm('Reverse this receipt? This will remove the stock lot(s) this receipt created and set the PO back to pending.')) return
    setReversing(true)
    try {
      const res = await fetch(apiUrl(`/api/purchase-orders/${poId}/reverse`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() }
      })
      const body = await jsonOrThrow(res, "Couldn't reverse receipt")
      showToast(`Receipt reversed — ${body.removedLots} lot(s) removed, PO set back to pending`)
      queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === 'string' && q.queryKey[0].startsWith('/api/purchase-orders')
      })
      queryClient.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === 'string' && q.queryKey[0].startsWith('/api/medicines')
      })
      onClose()
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't reverse receipt")
    } finally {
      setReversing(false)
    }
  }

  return (
    <Modal title={`Purchase order #${poId}`} onClose={onClose} width={600}>
      {isLoading && !po ? (
        <Loading label="Loading order details…" centered={false} />
      ) : po ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span style={{ color: theme.muted }} className="text-sm">
              {po.supplierName ?? 'Supplier'}
            </span>
            <StatusPill status={po.status} theme={theme} />
          </div>
          {items.length === 0 ? (
            <p style={{ color: theme.muted }} className="text-sm italic">
              No line items.
            </p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const unitLabel = item.unitName
                  ? `${item.quantity} ${item.unitName}${item.quantity !== 1 ? 's' : ''}`
                  : `${item.quantity} units`
                const factor = item.conversionFactorToBase ?? 1
                return (
                  <div
                    key={item.id}
                    style={{ border: `1px solid ${theme.border}`, background: theme.cardAlt }}
                    className="flex items-center justify-between text-sm rounded-lg px-3 py-2"
                  >
                    <div style={{ color: theme.text }} className="min-w-0">
                      <span className="font-medium">{item.medicineName ?? 'Medicine'}</span>
                      <p style={{ color: theme.muted }} className="text-xs">
                        {unitLabel} × {formatCurrency(parseFloat(item.unitPrice), settings)}
                        {factor > 1 && (
                          <span> ({item.quantity * factor} base units)</span>
                        )}
                      </p>
                    </div>
                    <div style={{ ...mono, color: theme.text, fontWeight: 600 }} className="shrink-0 ml-3">
                      {formatCurrency(parseFloat(item.unitPrice) * item.quantity, settings)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {total != null && (
            <div
              style={{ borderTop: `1px solid ${theme.border}` }}
              className="flex items-center justify-between pt-3"
            >
              <span style={{ color: theme.muted }} className="text-sm">
                Total
              </span>
              <span style={{ ...mono, color: theme.text, fontWeight: 600 }}>
                {formatCurrency(parseFloat(total), settings)}
              </span>
            </div>
          )}
          {canReverse && po?.status === 'received' && (
            <button
              onClick={handleReverse}
              disabled={reversing}
              style={{ border: `1px solid ${theme.red}55`, color: theme.red }}
              className="flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors hover:bg-[color:var(--row-hover)] disabled:opacity-60"
            >
              {reversing ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
              {reversing ? 'Reversing…' : 'Reverse Receive'}
            </button>
          )}
        </div>
      ) : null}
    </Modal>
  )
}

export default function PurchaseOrders(): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [receiveId, setReceiveId] = useState<number | null>(null)
  const [viewId, setViewId] = useState<number | null>(null)
  const { data: purchaseOrders = [], isLoading } = useListPurchaseOrders()
  const { data: settings } = usePharmacySettings()
  const receivePO = useReceivePurchaseOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() })
        showToast('Purchase order marked as received')
      },
      onError: (err) => showToast(err instanceof Error ? err.message : 'Failed to update purchase order')
    }
  })

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const suppliers = useMemo(() => {
    const map = new Map<string, string>()
    purchaseOrders.forEach((po) => {
      const name = po.supplierName ?? ''
      if (name) map.set(String(po.supplierId), name)
    })
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [purchaseOrders])

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase()
    return purchaseOrders.filter((po) => {
      if (statusFilter !== 'all' && po.status !== statusFilter) return false
      if (supplierFilter !== 'all' && String(po.supplierId) !== supplierFilter) return false
      const day = po.createdAt?.slice(0, 10)
      if (fromDate && day < fromDate) return false
      if (toDate && day > toDate) return false
      if (q) {
        if (/^\d+$/.test(q)) {
          // Numeric query = exact PO number match (leading zeros allowed).
          // e.g. "001" == PO #0001, NOT #0011/#0012 (avoids substring false matches).
          const numericQuery = Number(q)
          if (po.id !== numericQuery) return false
        } else {
          const haystack = (po.supplierName ?? '').toLowerCase()
          if (!haystack.includes(q)) return false
        }
      }
      return true
    })
  }, [purchaseOrders, search, statusFilter, supplierFilter, fromDate, toDate])

  const hasActiveFilters = !!(search || statusFilter !== 'all' || supplierFilter !== 'all' || fromDate || toDate)

  const clearFilters = (): void => {
    setSearch('')
    setStatusFilter('all')
    setSupplierFilter('all')
    setFromDate('')
    setToDate('')
  }

  return (
    <div className="p-7">
      <div className="flex items-center justify-between mb-4">
        <h1 style={{ ...serif, color: theme.text }} className="text-xl font-semibold">
          Purchase Orders
        </h1>
        <button
          onClick={() => setShowCreate(true)}
          style={{ background: theme.primary, color: '#fff' }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={14} />
          Create purchase order
        </button>
      </div>
      <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-xl overflow-hidden">
        {isLoading ? (
          <Loading label="Loading purchase orders…" />
        ) : purchaseOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div
              style={{ background: theme.primarySoft, color: theme.primaryText }}
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
            >
              <PackagePlus size={22} />
            </div>
            <p style={{ ...serif, color: theme.text }} className="text-base font-medium">
              No purchase orders yet
            </p>
            <p style={{ color: theme.muted }} className="text-sm mt-1 mb-4 max-w-sm">
              Create a purchase order to stock up from a supplier. You&apos;ll see it here once it&apos;s been created.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              style={{ background: theme.primary, color: '#fff' }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
            >
              <Plus size={14} /> Create purchase order
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
                  placeholder="Search by PO #, supplier…"
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
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
                className="text-sm rounded-lg px-3 py-2 outline-none"
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="received">Received</option>
                <option value="cancelled">Cancelled</option>
              </select>
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
                Showing {filteredOrders.length} of {purchaseOrders.length} purchase orders
              </p>
            )}

            {filteredOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <div
                  style={{ background: theme.primarySoft, color: theme.primaryText }}
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                >
                  <PackageSearch size={22} />
                </div>
                <p style={{ ...serif, color: theme.text }} className="text-base font-medium">
                  No matching purchase orders
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
                <th className="py-2.5 px-4 font-medium">PO</th>
                <th className="py-2.5 px-4 font-medium">Supplier</th>
                <th className="py-2.5 px-4 font-medium text-center">Items</th>
                <th className="py-2.5 px-4 font-medium text-right">Total</th>
                <th className="py-2.5 px-4 font-medium">Date</th>
                <th className="py-2.5 px-4 font-medium">Status</th>
                <th className="py-2.5 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((po, idx) => (
                <tr
                  key={po.id}
                  style={{ borderTop: idx ? `1px solid ${theme.border}` : 'none', '--row-hover': theme.hover } as React.CSSProperties}
                  className="transition-colors hover:bg-[color:var(--row-hover)]"
                >
                  <td className="py-2.5 px-4" style={{ ...mono, color: theme.primaryText }}>
                    #{String(po.id).padStart(4, '0')}
                  </td>
                  <td className="py-2.5 px-4" style={{ color: theme.text }}>
                    {po.supplierName ?? '—'}
                  </td>
                  <td className="py-2.5 px-4 text-center" style={{ ...mono, color: theme.muted }}>
                    {(po as PurchaseOrderRow).itemCount ?? po.items?.length ?? 0}
                  </td>
                  <td className="py-2.5 px-4 text-right" style={{ ...mono, color: theme.text, fontWeight: 600 }}>
                    {formatCurrency(parseFloat(po.total), settings)}
                  </td>
                  <td className="py-2.5 px-4" style={{ ...mono, color: theme.muted }}>
                    {new Date(po.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2.5 px-4">
                    <StatusPill status={po.status} theme={theme} />
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => setViewId(po.id)}
                        style={{ border: `1px solid ${theme.borderStrong}`, color: theme.muted }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors hover:opacity-70"
                      >
                        <Eye size={13} /> View
                      </button>
                      {po.status === 'pending' && (
                        <button
                          onClick={() => setReceiveId(po.id)}
                          disabled={receivePO.isPending}
                          style={{ color: theme.primaryText, background: theme.primarySoft }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-60"
                          title="Receive — choose batches and update stock"
                        >
                          <PackageCheck size={13} />
                          Receive
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
      {showCreate && <CreatePurchaseOrderModal onClose={() => setShowCreate(false)} />}
      {receiveId !== null && <ReceivePOModal poId={receiveId} onClose={() => setReceiveId(null)} />}
      {viewId !== null && (
        <ViewPOModal
          poId={viewId}
          preview={purchaseOrders.find((po) => po.id === viewId)}
          onClose={() => setViewId(null)}
        />
      )}
    </div>
  )
}
