import type { ReactElement } from 'react'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useListMedicines,
  useListCategories,
  useCreateMedicine,
  useListMedicineUnits,
  useCreateMedicineUnit,
  useDeleteMedicineUnit,
  getListMedicinesQueryKey,
  getListMedicineUnitsQueryKey
} from '@workspace/api-client-react'
import type { Medicine, MedicineUnit } from '@workspace/api-client-react'
import { Search, Plus, Filter, AlertCircle, CalendarClock, Trash2, Loader2, Lock, Package } from 'lucide-react'
import { useUiStore } from '../store/uiStore'
import { getTheme, mono, serif } from '../theme'
import { useAuth } from '../hooks/useAuth'
import { usePharmacySettings, formatCurrency } from '../hooks/usePharmacySettings'
import { formatStockDisplay } from '../lib/stock-format'
import Modal from '../components/Modal'

// The server returns controlledSchedule/drugClass but the generated Medicine
// type is stale — read them defensively (web does the same via `as any`).
type MedicineRow = Medicine & {
  controlledSchedule?: string | null
  drugClass?: string | null
  barcode?: string | null
}

export default function Medicines(): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)
  const { user } = useAuth()
  const { data: settings } = usePharmacySettings()
  const { setScreen, setPendingMedicineDetailId } = useUiStore()

  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [addOpen, setAddOpen] = useState(false)
  const [unitsFor, setUnitsFor] = useState<MedicineRow | null>(null)

  const { data: medicines = [], isLoading } = useListMedicines({
    search: search.trim() || undefined,
    categoryId: categoryId || undefined
  })
  const { data: categories = [] } = useListCategories()

  const isAdmin = user?.role === 'admin' || user?.role === 'pharmacist'
  const rows = (medicines ?? []) as MedicineRow[]

  const openDetail = (id: number): void => {
    setPendingMedicineDetailId(id)
    setScreen('medicine-detail')
  }

  return (
    <div className="p-7 max-w-6xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 style={{ ...serif, color: theme.text }} className="text-xl font-semibold">
            Medicines
          </h1>
          <p style={{ color: theme.muted }} className="text-xs mt-0.5">
            Browse the full catalog of pharmaceutical products.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setAddOpen(true)}
            style={{ background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)' }}
            className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-white text-sm font-semibold transition-transform active:scale-[0.98]"
          >
            <Plus size={14} /> Add Medicine
          </button>
        )}
      </div>

      {/* Search + category filter */}
      <div
        className="flex items-center gap-3 p-3 rounded-xl mb-5"
        style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}
      >
        <div className="flex items-center gap-2 flex-1">
          <Search size={14} color={theme.muted} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search medicines by name or generic name..."
            style={{ color: theme.text, background: 'transparent' }}
            className="flex-1 text-sm outline-none placeholder:opacity-60"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Filter size={14} color={theme.muted} />
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}
            style={{
              background: theme.cardAlt,
              border: `1px solid ${theme.border}`,
              color: theme.text
            }}
            className="rounded-lg px-2.5 py-2 text-sm outline-none"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} style={{ background: theme.hover }} className="h-64 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <AlertCircle size={30} color={theme.muted} strokeWidth={1.6} />
          <p style={{ color: theme.text }} className="text-sm font-medium">
            No medicines found
          </p>
          <p style={{ color: theme.muted }} className="text-xs">
            Try adjusting your search or filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {rows.map((medicine) => (
            <MedicineCard
              key={medicine.id}
              medicine={medicine}
              isAdmin={isAdmin}
              theme={theme}
              settings={settings}
              onOpen={() => openDetail(medicine.id)}
              onManageUnits={() => setUnitsFor(medicine)}
            />
          ))}
        </div>
      )}

      {addOpen && <AddMedicineModal onClose={() => setAddOpen(false)} />}
      {unitsFor && <ManageUnitsModal medicine={unitsFor} onClose={() => setUnitsFor(null)} />}
    </div>
  )
}

// ── Medicine card ───────────────────────────────────────────────────────────

function MedicineCard({
  medicine,
  isAdmin,
  theme,
  settings,
  onOpen,
  onManageUnits
}: {
  medicine: MedicineRow
  isAdmin: boolean
  theme: ReturnType<typeof getTheme>
  settings: ReturnType<typeof usePharmacySettings>['data']
  onOpen: () => void
  onManageUnits: () => void
}): ReactElement {
  const isOutOfStock = medicine.quantity === 0
  const todayStr = new Date().toISOString().slice(0, 10)
  const isExpired = Boolean(medicine.expiryDate && medicine.expiryDate < todayStr)
  const isExpiringSoon = Boolean(
    medicine.expiryDate &&
      !isExpired &&
      medicine.expiryDate <= new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)
  )

  const units = medicine.units as MedicineUnit[] | undefined
  const stockDisplay = formatStockDisplay(medicine.quantity, units)
  const hasUnits = units && units.length > 0
  const controlledSchedule = medicine.controlledSchedule

  return (
    <div
      style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}
      className="card-lift rounded-xl overflow-hidden flex flex-col cursor-pointer"
      onClick={onOpen}
    >
      {/* Header block */}
      <div
        style={{ background: theme.cardAlt, borderBottom: `1px solid ${theme.border}` }}
        className="relative p-6 flex items-center justify-center"
      >
        {medicine.imageUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img src={medicine.imageUrl} alt={medicine.name} className="w-20 h-20 object-contain" />
        ) : (
          <div
            style={{ background: theme.primarySoft, color: theme.primaryText }}
            className="w-20 h-20 rounded-full flex items-center justify-center"
          >
            <span className="text-2xl font-bold">{medicine.name.charAt(0)}</span>
          </div>
        )}
        <div className="absolute top-3 left-3 flex flex-col gap-1">
          {medicine.prescriptionRequired && (
            <span
              style={{ background: theme.redBg, color: theme.red }}
              className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded"
            >
              Rx Required
            </span>
          )}
          {controlledSchedule && (
            <span
              style={{ background: theme.amberBg, color: theme.amber }}
              className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded flex items-center gap-0.5"
            >
              <Lock size={8} /> Sch {controlledSchedule}
            </span>
          )}
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <div className="mb-2 min-w-0">
          <p style={{ color: theme.text }} className="text-sm font-semibold truncate">
            {medicine.name}
          </p>
          <p style={{ color: theme.muted }} className="text-xs truncate" title={medicine.genericName ?? undefined}>
            {medicine.genericName || '—'}
          </p>
        </div>
        <div className="mt-auto space-y-2.5 pt-3">
          {medicine.expiryDate && (
            <div
              className="flex items-center gap-1.5 text-xs"
              style={{
                color: isExpired ? theme.red : isExpiringSoon ? theme.amber : theme.muted,
                fontWeight: isExpired || isExpiringSoon ? 600 : 400
              }}
            >
              <CalendarClock size={12} />
              {isExpired
                ? 'Expired'
                : `Expires ${new Date(`${medicine.expiryDate}T00:00:00`).toLocaleDateString()}`}
            </div>
          )}
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <p style={{ ...mono, color: theme.primaryText }} className="text-lg font-bold">
                {formatCurrency(parseFloat(medicine.price), settings)}
              </p>
              {isOutOfStock ? (
                <p style={{ color: theme.red }} className="mt-0.5 text-xs font-semibold">
                  Out of stock
                </p>
              ) : hasUnits ? (
                <p style={{ color: theme.muted }} className="mt-0.5 text-xs truncate" title={`${medicine.quantity} base units`}>
                  {stockDisplay}
                </p>
              ) : (
                <p style={{ color: theme.muted }} className="mt-0.5 text-xs">
                  {medicine.quantity} in stock
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              {isAdmin && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onManageUnits()
                  }}
                  title="Manage packaging units"
                  style={{ color: theme.muted }}
                  className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg transition-colors hover:bg-[color:var(--row-hover)]"
                >
                  <Package size={12} /> Units
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onOpen()
                }}
                style={{ border: `1px solid ${theme.borderStrong}`, color: theme.text }}
                className="shrink-0 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors hover:bg-[color:var(--row-hover)]"
              >
                Details
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Add medicine modal ──────────────────────────────────────────────────────

function AddMedicineModal({ onClose }: { onClose: () => void }): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const queryClient = useQueryClient()
  const { data: categories = [] } = useListCategories()

  const [name, setName] = useState('')
  const [genericName, setGenericName] = useState('')
  const [price, setPrice] = useState('')
  const [quantity, setQuantity] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [controlledSchedule, setControlledSchedule] = useState('')
  const [drugClass, setDrugClass] = useState('')
  const [prescriptionRequired, setPrescriptionRequired] = useState(false)

  const createMutation = useCreateMedicine({
    mutation: {
      onSuccess: () => {
        showToast('Medicine added — it is now available in your inventory')
        queryClient.invalidateQueries({ queryKey: getListMedicinesQueryKey(undefined) })
        queryClient.invalidateQueries({
          predicate: (query) =>
            typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('/api/medicines')
        })
        onClose()
      },
      onError: (err: Error) => showToast(err.message || "Couldn't add medicine")
    }
  })

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    createMutation.mutate({
      data: {
        name: name.trim(),
        genericName: genericName.trim() || undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        quantity: Number(quantity),
        price,
        expiryDate,
        prescriptionRequired,
        description: description.trim() || undefined,
        // Extended fields — passed through since they're not in the generated schema yet
        ...(controlledSchedule ? ({ controlledSchedule } as any) : {}),
        ...(drugClass.trim() ? ({ drugClass: drugClass.trim() } as any) : {})
      } as any
    })
  }

  const inputStyle = {
    background: theme.cardAlt,
    border: `1px solid ${theme.border}`,
    color: theme.text
  }
  const inputCls =
    'w-full text-sm rounded-lg px-3 py-2 outline-none placeholder:opacity-50 transition-all duration-150 focus:border-transparent focus:ring-2 focus:ring-emerald-500/40'
  const labelCls = 'text-xs font-medium mb-1.5 block'

  return (
    <Modal title="Add New Medicine" onClose={onClose} width={520}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span style={{ color: theme.muted }} className={labelCls}>
            Name <span style={{ color: theme.red }}>*</span>
          </span>
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Amoxicillin 500mg" style={inputStyle} className={inputCls} />
        </label>
        <label className="block">
          <span style={{ color: theme.muted }} className={labelCls}>
            Generic Name
          </span>
          <input value={genericName} onChange={(e) => setGenericName(e.target.value)} placeholder="Amoxicillin" style={inputStyle} className={inputCls} />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span style={{ color: theme.muted }} className={labelCls}>
              Price per base unit <span style={{ color: theme.red }}>*</span>
            </span>
            <input type="number" step="0.01" required value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.50" style={inputStyle} className={inputCls} />
            <span style={{ color: theme.muted }} className="text-[11px] mt-1 block">
              Per the smallest unit (e.g. per tablet, per ml)
            </span>
          </label>
          <label className="block">
            <span style={{ color: theme.muted }} className={labelCls}>
              Initial stock (base units) <span style={{ color: theme.red }}>*</span>
            </span>
            <input type="number" required value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="100" style={inputStyle} className={inputCls} />
            <span style={{ color: theme.muted }} className="text-[11px] mt-1 block">
              In base units (e.g. total tablets)
            </span>
          </label>
        </div>
        <label className="block">
          <span style={{ color: theme.muted }} className={labelCls}>
            Expiry date <span style={{ color: theme.red }}>*</span>
          </span>
          <input
            type="date"
            required
            min={new Date().toISOString().slice(0, 10)}
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            style={inputStyle}
            className={inputCls}
          />
          <span style={{ color: theme.muted }} className="text-[11px] mt-1 block">
            Expired medicines are blocked at checkout.
          </span>
        </label>
        <label className="block">
          <span style={{ color: theme.muted }} className={labelCls}>
            Category
          </span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={inputStyle} className={inputCls}>
            <option value="">Select a category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span style={{ color: theme.muted }} className={labelCls}>
            Description
          </span>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Dosage instructions, side effects, etc."
            style={inputStyle}
            className={inputCls}
          />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span style={{ color: theme.muted }} className={labelCls}>
              Controlled Schedule
            </span>
            <select value={controlledSchedule} onChange={(e) => setControlledSchedule(e.target.value)} style={inputStyle} className={inputCls}>
              <option value="">Not controlled</option>
              <option value="II">Schedule II</option>
              <option value="III">Schedule III</option>
              <option value="IV">Schedule IV</option>
              <option value="V">Schedule V</option>
            </select>
          </label>
          <label className="block">
            <span style={{ color: theme.muted }} className={labelCls}>
              Drug Class
            </span>
            <input value={drugClass} onChange={(e) => setDrugClass(e.target.value)} placeholder="e.g. NSAID, Beta-blocker" style={inputStyle} className={inputCls} />
          </label>
        </div>
        <label className="flex items-center gap-2 pt-1 cursor-pointer">
          <input
            type="checkbox"
            checked={prescriptionRequired}
            onChange={(e) => setPrescriptionRequired(e.target.checked)}
            className="w-4 h-4 accent-emerald-600"
          />
          <span style={{ color: theme.text }} className="text-sm">
            Requires Prescription
          </span>
        </label>
        <p style={{ background: theme.hover, color: theme.muted }} className="text-xs rounded-lg p-3">
          After adding, open the medicine's detail page to define packaging levels (tablet → strip → box) and
          packaging units.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            style={{ border: `1px solid ${theme.borderStrong}`, color: theme.text }}
            className="rounded-lg px-4 py-2 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            style={{ background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)' }}
            className="rounded-lg px-4 py-2 text-white text-sm font-semibold transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {createMutation.isPending ? 'Saving…' : 'Save Medicine'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Pill icon used by the empty state of units modal (kept for parity)

// ── Manage packaging units modal ────────────────────────────────────────────

function ManageUnitsModal({
  medicine,
  onClose
}: {
  medicine: MedicineRow
  onClose: () => void
}): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const queryClient = useQueryClient()

  const { data: liveUnits, isLoading: unitsLoading } = useListMedicineUnits(medicine.id)
  const displayUnits: MedicineUnit[] = liveUnits ?? medicine.units ?? []

  const createUnit = useCreateMedicineUnit({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMedicineUnitsQueryKey(medicine.id) })
        queryClient.invalidateQueries({ queryKey: getListMedicinesQueryKey(undefined) })
        showToast('Packaging unit added')
      },
      onError: (err: Error) => showToast(err.message || "Couldn't add packaging unit")
    }
  })

  const deleteUnit = useDeleteMedicineUnit({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMedicineUnitsQueryKey(medicine.id) })
        queryClient.invalidateQueries({ queryKey: getListMedicinesQueryKey(undefined) })
        showToast('Packaging unit removed')
      },
      onError: (err: Error) => showToast(err.message || "Couldn't remove packaging unit")
    }
  })

  const [unitName, setUnitName] = useState('')
  const [factor, setFactor] = useState('')
  const [isBase, setIsBase] = useState(false)

  const handleAddUnit = (e: React.FormEvent): void => {
    e.preventDefault()
    const parsed = parseInt(factor, 10)
    if (!unitName.trim() || !parsed || parsed < 1) {
      showToast('Fill in unit name and a conversion factor ≥ 1')
      return
    }
    createUnit.mutate({
      id: medicine.id,
      data: { unitName: unitName.trim(), conversionFactorToBase: parsed, isBaseUnit: isBase }
    })
    setUnitName('')
    setFactor('')
    setIsBase(false)
  }

  const sorted = [...displayUnits].sort((a, b) => a.conversionFactorToBase - b.conversionFactorToBase)
  const inputStyle = {
    background: theme.cardAlt,
    border: `1px solid ${theme.border}`,
    color: theme.text
  }
  const inputCls =
    'w-full text-sm rounded-lg px-3 py-2 outline-none placeholder:opacity-50 transition-all duration-150 focus:border-transparent focus:ring-2 focus:ring-emerald-500/40'

  return (
    <Modal title={`Packaging units — ${medicine.name}`} onClose={onClose} width={500}>
      <div className="space-y-4">
        {/* How it works */}
        <div style={{ background: theme.hover, border: `1px solid ${theme.border}`, color: theme.muted }} className="rounded-lg p-3 space-y-1.5 text-xs">
          <p style={{ color: theme.text }} className="font-semibold text-sm">
            How packaging units work
          </p>
          <p>
            Stock is always stored as the <strong style={{ color: theme.text }}>smallest sellable unit</strong> (e.g.
            individual tablet). Every other unit tells the system how many of those base units it contains.
          </p>
          <p style={{ color: theme.text }} className="font-medium mt-1">
            Example — 1 strip = 10 tablets:
          </p>
          <div style={{ borderColor: theme.primary }} className="space-y-1 pl-2 border-l-2">
            <p>
              ① Add <strong>Tablet</strong> · factor <strong>1</strong> · ✓ Base unit → the individual tablet
            </p>
            <p>
              ② Add <strong>Strip</strong> · factor <strong>10</strong> → 1 strip = 10 tablets
            </p>
            <p>
              ③ Add <strong>Box</strong> · factor <strong>100</strong> → 1 box = 100 tablets (optional)
            </p>
          </div>
          <p className="mt-1">
            In a sale you can then choose <em>Tablet</em> and enter 5 to sell exactly 5 tablets.
          </p>
        </div>

        {/* Current units */}
        {unitsLoading ? (
          <div style={{ color: theme.muted }} className="flex items-center gap-2 text-sm py-2">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : sorted.length === 0 ? (
          <p style={{ color: theme.muted }} className="text-sm py-2 italic">
            No packaging units defined yet. Add one below.
          </p>
        ) : (
          <div className="space-y-2">
            {!sorted.some((u) => u.isBaseUnit || u.conversionFactorToBase === 1) && (
              <div
                className="flex items-start gap-2 rounded-lg p-3 text-xs"
                style={{ background: theme.amberBg, border: `1px solid ${theme.amber}44`, color: theme.amber }}
              >
                <span className="text-base leading-none mt-0.5">⚠</span>
                <span>
                  <strong>No base unit defined.</strong> You can still sell individual units using the "Individual unit
                  (×1)" option, but adding an explicit base unit (e.g. Tablet · factor 1) lets you name it properly.
                </span>
              </div>
            )}
            {sorted.map((unit) => (
              <div
                key={unit.id}
                style={{ border: `1px solid ${theme.border}`, background: theme.cardAlt }}
                className="flex items-center justify-between rounded-lg p-3"
              >
                <div>
                  <span style={{ color: theme.text }} className="font-medium text-sm">
                    {unit.unitName}
                  </span>
                  {unit.isBaseUnit && (
                    <span
                      style={{ background: theme.primarySoft, color: theme.primaryText }}
                      className="ml-2 text-[10px] px-1.5 py-0.5 rounded"
                    >
                      Base
                    </span>
                  )}
                  <p style={{ color: theme.muted }} className="text-xs mt-0.5">
                    1 {unit.unitName} = {unit.conversionFactorToBase} base unit
                    {unit.conversionFactorToBase !== 1 ? 's' : ''}
                  </p>
                </div>
                <button
                  onClick={() => deleteUnit.mutate({ id: medicine.id, unitId: unit.id })}
                  disabled={deleteUnit.isPending}
                  title="Remove unit"
                  style={{ color: theme.muted }}
                  className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors hover:bg-[color:var(--row-hover)] disabled:opacity-40"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add unit form */}
        <form onSubmit={handleAddUnit} style={{ borderTop: `1px solid ${theme.border}` }} className="space-y-3 pt-4">
          <p style={{ color: theme.text }} className="text-sm font-medium">
            Add packaging unit
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span style={{ color: theme.muted }} className="text-xs font-medium mb-1.5 block">
                Unit name
              </span>
              <input value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="e.g. Tablet, Strip, Box" required style={inputStyle} className={inputCls} />
            </label>
            <label className="block">
              <span style={{ color: theme.muted }} className="text-xs font-medium mb-1.5 block">
                How many base units?
              </span>
              <input type="number" min={1} value={factor} onChange={(e) => setFactor(e.target.value)} placeholder="e.g. 1, 10, 100" required style={inputStyle} className={inputCls} />
            </label>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isBase} onChange={(e) => setIsBase(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
            <span style={{ color: theme.text }} className="text-sm">
              This is the base unit <span style={{ color: theme.muted }}>(set factor to 1, e.g. Tablet)</span>
            </span>
          </label>
          <button
            type="submit"
            disabled={createUnit.isPending}
            style={{ background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)' }}
            className="w-full flex items-center justify-center gap-2 rounded-lg py-2 text-white text-sm font-semibold transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {createUnit.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add unit
          </button>
        </form>
      </div>
    </Modal>
  )
}

