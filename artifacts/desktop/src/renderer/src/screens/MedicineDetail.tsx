import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useGetMedicine, useDeleteMedicine, getGetMedicineQueryKey } from '@workspace/api-client-react'
import {
  Pill, ArrowLeft, Trash2, Info, AlertTriangle, CalendarClock, PackageX,
  Loader2, AlertCircle, ShoppingCart
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

  const { data: medicine, isLoading } = useGetMedicine(id ?? 0, {
    query: { enabled: !!id } as any
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
  const units = (medicine as any).units as typeof medicine.units | undefined

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
    </div>
  )
}
