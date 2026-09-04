import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useGetMedicine, useUpdateMedicine, useDeleteMedicine, getGetMedicineQueryKey } from '@workspace/api-client-react'
import type { Medicine } from '@workspace/api-client-react'
import {
  Pill, ArrowLeft, Trash2, Info, AlertTriangle, CalendarClock, PackageX,
  Loader2, AlertCircle, ShoppingCart, Pencil, ScanLine, Save
} from 'lucide-react'
import { useUiStore } from '../store/uiStore'
import { getTheme, mono, serif } from '../theme'
import Loading from '../components/Loading'
import { useAuth } from '../hooks/useAuth'
import { usePharmacySettings, formatCurrency } from '../hooks/usePharmacySettings'
import { formatStockDisplay } from '../lib/stock-format'
import { useMedicineBatches, useWriteOffBatch, useWriteOffStock, useAddMedicineBatch } from '../hooks/useExtraQueries'
import Modal from '../components/Modal'
import { apiUrl, authHeaders, jsonOrThrow } from '../lib/apiClient'
import BatchList from '../components/BatchList'
import ContraindicationsPanel from '../components/ContraindicationsPanel'

// The generated Medicine type hasn't caught up with the API — the server also
// returns barcode/controlledSchedule/drugClass. Same defensive pattern as
// NewSale's MedicineRow.
type MedicineDetailRow = Medicine & {
  barcode?: string | null
  controlledSchedule?: string | null
  drugClass?: string | null
}

export default function MedicineDetail(): ReactElement {
  const { dark, showToast, setScreen, pendingMedicineDetailId, setPendingMedicineDetailId } = useUiStore()
  const theme = getTheme(dark)
  const { user } = useAuth()
  const { data: settings } = usePharmacySettings()
  const queryClient = useQueryClient()

  const id = pendingMedicineDetailId
  const [writeOffOpen, setWriteOffOpen] = useState(false)
  const [writeOffQty, setWriteOffQty] = useState(1)
  const [writeOffReason, setWriteOffReason] = useState('')
  const [editOpen, setEditOpen] = useState(false)

  const { data: medicine, isLoading } = useGetMedicine(id ?? 0, {
    query: { enabled: !!id, queryKey: getGetMedicineQueryKey(id ?? 0) }
  })

  const writeOff = useWriteOffStock(id ?? 0)

  const deleteMutation = useDeleteMedicine({
    mutation: {
      onSuccess: () => {
        showToast('Medicine deleted')
        queryClient.invalidateQueries({
          predicate: (query) =>
            typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('/api/medicines')
        })
        setPendingMedicineDetailId(null)
        setScreen('medicines')
      },
      onError: () => showToast("Couldn't delete medicine")
    }
  })

  const updateMutation = useUpdateMedicine({
    mutation: {
      onSuccess: () => {
        showToast('Medicine updated')
        setEditOpen(false)
        queryClient.invalidateQueries({
          predicate: (query) =>
            typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('/api/medicines')
        })
      },
      onError: (err) => showToast(err?.message || "Couldn't update medicine")
    }
  })

  const handleWriteOff = (): void => {
    if (!writeOffReason.trim()) {
      showToast('Please enter a reason')
      return
    }
    writeOff.mutate(
      { quantity: writeOffQty, reason: writeOffReason.trim() },
      {
        onSuccess: () => {
          showToast(`${writeOffQty} unit(s) written off from ${medicine?.name}`)
          setWriteOffOpen(false)
          setWriteOffQty(1)
          setWriteOffReason('')
        },
        onError: (err) => showToast(err.message || 'Write-off failed')
      }
    )
  }

  if (isLoading) {
    return (
      <div className="p-10">
        <Loading label="Loading medicine…" />
      </div>
    )
  }
  if (!medicine) {
    return (
      <div className="p-10 text-center">
        <p style={{ color: theme.muted }} className="text-sm mb-3">
          Medicine not found.
        </p>
        <button
          onClick={() => setScreen('medicines')}
          style={{ border: `1px solid ${theme.borderStrong}`, color: theme.text }}
          className="rounded-lg px-3 py-1.5 text-xs font-medium"
        >
          Back to Medicines
        </button>
      </div>
    )
  }

  const isOutOfStock = medicine.quantity === 0
  const isLowStock = medicine.quantity > 0 && medicine.quantity <= 10
  const isExpired = Boolean(medicine.expiryDate && medicine.expiryDate < new Date().toISOString().slice(0, 10))
  const canEdit = user?.role === 'admin' || user?.role === 'pharmacist'
  const units = medicine.units
  const row = medicine as MedicineDetailRow

  const cardStyle = {
    background: theme.card,
    border: `1px solid ${theme.border}`,
    boxShadow: theme.shadow
  }

  return (
    <div className="p-7 max-w-5xl space-y-5">
      <button
        onClick={() => setScreen('medicines')}
        style={{ color: theme.muted }}
        className="flex items-center gap-1.5 text-xs font-medium hover:opacity-80"
      >
        <ArrowLeft size={13} /> Back to Medicines
      </button>

      <div className="grid grid-cols-2 gap-8">
        {/* Visual side */}
        <div
          style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}
          className="rounded-2xl p-8 flex items-center justify-center"
        >
          {medicine.imageUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <img src={medicine.imageUrl} alt={medicine.name} className="w-full h-full object-contain" />
          ) : (
            <div
              style={{ background: theme.primarySoft, color: theme.primaryText }}
              className="w-44 h-44 rounded-full flex items-center justify-center"
            >
              <Pill size={88} strokeWidth={1.2} />
            </div>
          )}
        </div>

        {/* Details side */}
        <div className="flex flex-col">
          <div className="mb-5">
            <div className="flex flex-wrap gap-2 mb-3">
              {medicine.categoryName && (
                <span
                  style={{ background: theme.primarySoft, color: theme.primaryText }}
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                >
                  {medicine.categoryName}
                </span>
              )}
              {medicine.prescriptionRequired && (
                <span
                  style={{ background: theme.amberBg, color: theme.amber }}
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                >
                  Prescription Required
                </span>
              )}
            </div>
            <h1 style={{ ...serif, color: theme.text }} className="text-2xl font-bold tracking-tight">
              {medicine.name}
            </h1>
            {medicine.genericName && (
              <p style={{ color: theme.muted }} className="text-sm mt-1">
                {medicine.genericName}
              </p>
            )}
          </div>

          <div style={{ ...mono, color: theme.text }} className="text-3xl font-bold mb-5 tracking-tight">
            {formatCurrency(parseFloat(medicine.price), settings)}
            <span style={{ color: theme.muted }} className="text-sm font-normal ml-2">
              per base unit
            </span>
          </div>

          {/* Stock status */}
          {isExpired ? (
            <div
              className="mb-4 flex items-center gap-2 rounded-xl p-3.5"
              style={{ background: theme.redBg, color: theme.red }}
            >
              <CalendarClock size={16} />
              <span className="font-medium text-sm">
                Expired on {new Date(`${medicine.expiryDate}T00:00:00`).toLocaleDateString()} — not available for sale
              </span>
            </div>
          ) : isOutOfStock ? (
            <div
              className="mb-4 flex items-center gap-2 rounded-xl p-3.5"
              style={{ background: theme.redBg, color: theme.red }}
            >
              <AlertTriangle size={16} />
              <span className="font-medium text-sm">Out of Stock</span>
            </div>
          ) : isLowStock ? (
            <div
              className="mb-4 flex items-center gap-2 rounded-xl p-3.5"
              style={{ background: theme.amberBg, color: theme.amber }}
            >
              <AlertTriangle size={16} />
              <span className="font-medium text-sm">Low Stock — {formatStockDisplay(medicine.quantity, units)} remaining</span>
            </div>
          ) : (
            <div
              className="mb-4 flex items-center gap-2 rounded-xl p-3.5"
              style={{ background: theme.greenBg, color: theme.green }}
            >
              <Info size={16} />
              <span className="font-medium text-sm">
                {formatStockDisplay(medicine.quantity, units)} in stock
                {units && units.length > 0 && (
                  <span className="opacity-70 font-normal"> ({medicine.quantity} base units)</span>
                )}
              </span>
            </div>
          )}

          {/* Quick sale link */}
          <button
            disabled={isExpired || isOutOfStock}
            onClick={() => {
              useUiStore.getState().setPendingCheckoutMedicineId(medicine.id)
              setScreen('new-sale')
            }}
            style={{ background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)', opacity: isExpired || isOutOfStock ? 0.5 : 1 }}
            className="flex items-center justify-center gap-2 rounded-lg py-2.5 text-white text-sm font-semibold mb-3 transition-transform active:scale-[0.98] disabled:active:scale-100"
          >
            <ShoppingCart size={15} /> Add to Checkout
          </button>

          {/* Admin actions */}
          {canEdit && (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setEditOpen(true)}
                style={{ border: `1px solid ${theme.primary}55`, color: theme.primaryText }}
                className="flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors hover:bg-[color:var(--row-hover)]"
              >
                <Pencil size={14} /> Edit Medicine
              </button>
              {medicine.quantity > 0 && (
                <button
                  onClick={() => setWriteOffOpen(true)}
                  style={{ border: `1px solid ${theme.amber}55`, color: theme.amber }}
                  className="flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors hover:bg-[color:var(--row-hover)]"
                >
                  <PackageX size={14} /> Write Off Stock
                </button>
              )}
              <button
                onClick={() => {
                  if (window.confirm(`Delete "${medicine.name}"?`)) {
                    deleteMutation.mutate({ id: medicine.id })
                  }
                }}
                disabled={deleteMutation.isPending}
                style={{ border: `1px solid ${theme.red}55`, color: theme.red }}
                className="flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors hover:bg-[color:var(--row-hover)] disabled:opacity-40"
              >
                <Trash2 size={14} /> Delete Medicine
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-4">
        {medicine.manufacturer && (
          <div style={cardStyle} className="rounded-xl p-4">
            <p style={{ color: theme.muted }} className="text-xs mb-1">
              Manufacturer
            </p>
            <p style={{ color: theme.text }} className="text-sm font-medium">
              {medicine.manufacturer}
            </p>
          </div>
        )}
        {medicine.batchNumber && (
          <div style={cardStyle} className="rounded-xl p-4">
            <p style={{ color: theme.muted }} className="text-xs mb-1">
              Batch Number
            </p>
            <p style={{ ...mono, color: theme.text }} className="text-sm font-medium">
              {medicine.batchNumber}
            </p>
          </div>
        )}
        {row.barcode ? (
          <div style={cardStyle} className="rounded-xl p-4">
            <p style={{ color: theme.muted }} className="text-xs mb-1">
              Barcode / SKU
            </p>
            <p className="flex items-center gap-2" style={{ color: theme.text }}>
              <ScanLine size={16} color={theme.primary} />
              <span style={{ ...mono }} className="text-sm font-medium">
                {row.barcode}
              </span>
            </p>
          </div>
        ) : canEdit ? (
          <div style={cardStyle} className="rounded-xl p-4">
            <p style={{ color: theme.muted }} className="text-xs mb-1">
              Barcode / SKU
            </p>
            <button
              onClick={() => setEditOpen(true)}
              style={{ color: theme.muted }}
              className="inline-flex items-center gap-1.5 text-sm hover:opacity-80"
            >
              <ScanLine size={15} /> No barcode — set one
            </button>
          </div>
        ) : null}
        {medicine.expiryDate && (
          <div style={cardStyle} className="rounded-xl p-4">
            <p style={{ color: theme.muted }} className="text-xs mb-1">
              Expiry Date
            </p>
            <p style={{ color: theme.text }} className="text-sm font-medium">
              {new Date(`${medicine.expiryDate}T00:00:00`).toLocaleDateString()}
            </p>
          </div>
        )}
        {medicine.description && (
          <div style={cardStyle} className="rounded-xl p-4 col-span-2">
            <p style={{ color: theme.muted }} className="text-xs mb-1">
              Description
            </p>
            <p style={{ color: theme.text }} className="text-sm">
              {medicine.description}
            </p>
          </div>
        )}
      </div>

      {/* Batch / lot list */}
      <BatchList medicineId={medicine.id} medicineName={medicine.name} />

      {/* Drug-patient contraindications */}
      {canEdit && <ContraindicationsPanel medicineId={medicine.id} />}

      {/* Write-off dialog */}
      {writeOffOpen && (
        <Modal title={`Write Off Stock — ${medicine.name}`} onClose={() => setWriteOffOpen(false)} width={400}>
          <div className="space-y-4">
            <label className="block">
              <span style={{ color: theme.muted }} className="text-xs font-medium mb-1.5 block">
                Quantity to write off <span className="opacity-60 font-normal">(max {medicine.quantity})</span>
              </span>
              <input
                type="number"
                min={1}
                max={medicine.quantity}
                value={writeOffQty}
                onChange={(e) =>
                  setWriteOffQty(Math.min(medicine.quantity, Math.max(1, parseInt(e.target.value) || 1)))
                }
                style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
                className="w-full text-sm rounded-lg px-3 py-2 outline-none"
              />
            </label>
            <label className="block">
              <span style={{ color: theme.muted }} className="text-xs font-medium mb-1.5 block">
                Reason <span style={{ color: theme.red }}>*</span>
              </span>
              <input
                placeholder="e.g. Expired, damaged, contaminated…"
                value={writeOffReason}
                onChange={(e) => setWriteOffReason(e.target.value)}
                style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
                className="w-full text-sm rounded-lg px-3 py-2 outline-none placeholder:opacity-50"
              />
            </label>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setWriteOffOpen(false)}
                style={{ border: `1px solid ${theme.borderStrong}`, color: theme.text }}
                className="flex-1 rounded-lg py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleWriteOff}
                disabled={writeOff.isPending}
                style={{ background: theme.red, color: '#fff' }}
                className="flex-1 rounded-lg py-2 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {writeOff.isPending && <Loader2 size={13} className="animate-spin" />}
                Confirm Write-Off
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit medicine dialog */}
      {editOpen && (
        <EditMedicineModal
          medicine={medicine as MedicineDetailRow}
          isSaving={updateMutation.isPending}
          onClose={() => setEditOpen(false)}
          onSave={(payload) => updateMutation.mutate({ id: medicine.id, data: payload })}
        />
      )}
    </div>
  )
}

function EditMedicineModal({
  medicine,
  isSaving,
  onClose,
  onSave
}: {
  medicine: MedicineDetailRow
  isSaving: boolean
  onClose: () => void
  onSave: (payload: Record<string, unknown>) => void
}): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)

  const [name, setName] = useState(medicine.name)
  const [genericName, setGenericName] = useState(medicine.genericName ?? '')
  const [price, setPrice] = useState(medicine.price)
  const [barcode, setBarcode] = useState(medicine.barcode ?? '')
  const [expiryDate, setExpiryDate] = useState(medicine.expiryDate ? medicine.expiryDate.slice(0, 10) : '')
  const [description, setDescription] = useState(medicine.description ?? '')
  const [controlledSchedule, setControlledSchedule] = useState(medicine.controlledSchedule ?? '')
  const [drugClass, setDrugClass] = useState(medicine.drugClass ?? '')
  const [prescriptionRequired, setPrescriptionRequired] = useState(medicine.prescriptionRequired)

  const inputStyle = {
    background: theme.cardAlt,
    border: `1px solid ${theme.border}`,
    color: theme.text
  }
  const inputCls =
    'w-full text-sm rounded-lg px-3 py-2 outline-none placeholder:opacity-50 transition-all duration-150 focus:border-transparent focus:ring-2 focus:ring-emerald-500/40'
  const labelCls = 'text-xs font-medium mb-1.5 block'

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    onSave({
      name: name.trim(),
      ...(genericName.trim() ? { genericName: genericName.trim() } : {}),
      price,
      ...(expiryDate ? { expiryDate } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
      prescriptionRequired,
      ...(controlledSchedule ? { controlledSchedule } : { controlledSchedule: null }),
      ...(drugClass.trim() ? { drugClass: drugClass.trim() } : { drugClass: null }),
      ...(barcode.trim() ? { barcode: barcode.trim() } : { barcode: null })
    })
  }

  return (
    <Modal title={`Edit Medicine — ${medicine.name}`} onClose={onClose} width={540}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span style={{ color: theme.muted }} className={labelCls}>
            Name <span style={{ color: theme.red }}>*</span>
          </span>
          <input value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} className={inputCls} />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span style={{ color: theme.muted }} className={labelCls}>
              Generic Name
            </span>
            <input value={genericName} onChange={(e) => setGenericName(e.target.value)} style={inputStyle} className={inputCls} />
          </label>
          <label className="block">
            <span style={{ color: theme.muted }} className={labelCls}>
              Barcode / SKU
            </span>
            <input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="e.g. 6291041500213"
              style={inputStyle}
              className={inputCls}
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span style={{ color: theme.muted }} className={labelCls}>
              Price per base unit <span style={{ color: theme.red }}>*</span>
            </span>
            <input type="number" step="0.01" required value={price} onChange={(e) => setPrice(e.target.value)} style={inputStyle} className={inputCls} />
          </label>
          <label className="block">
            <span style={{ color: theme.muted }} className={labelCls}>
              Expiry date
            </span>
            <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} style={inputStyle} className={inputCls} />
          </label>
        </div>
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
        <label className="block">
          <span style={{ color: theme.muted }} className={labelCls}>
            Description
          </span>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={inputStyle}
            className={inputCls}
          />
        </label>
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
            disabled={isSaving}
            style={{ background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)', color: '#fff' }}
            className="rounded-lg px-4 py-2 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {isSaving && <Loader2 size={13} className="animate-spin" />}
            <Save size={14} /> Save Changes
          </button>
        </div>
      </form>
    </Modal>
  )
}
