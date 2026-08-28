import type { ReactElement } from 'react'
import { useState } from 'react'
import { Layers, Plus, PackageX, Loader2, AlertTriangle } from 'lucide-react'
import { useUiStore } from '../store/uiStore'
import { getTheme, mono } from '../theme'
import { useAuth } from '../hooks/useAuth'
import { usePharmacySettings, formatCurrency } from '../hooks/usePharmacySettings'
import {
  useMedicineBatches,
  useWriteOffBatch,
  useAddMedicineBatch,
  type MedicineBatch
} from '../hooks/useExtraQueries'
import Modal from '../components/Modal'

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function isExpired(expiryDate: string | null): boolean {
  return !!expiryDate && expiryDate < todayStr()
}

function isExpiringSoon(expiryDate: string | null): boolean {
  if (!expiryDate) return false
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() + 30)
  return expiryDate >= todayStr() && expiryDate <= cutoff.toISOString().slice(0, 10)
}

export default function BatchList({
  medicineId,
  medicineName
}: {
  medicineId: number
  medicineName: string
}): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const { user } = useAuth()
  const { data: settings } = usePharmacySettings()
  const { data: batches, isLoading } = useMedicineBatches(medicineId)
  const writeOff = useWriteOffBatch(medicineId)
  const addBatch = useAddMedicineBatch(medicineId)

  const canEdit = user?.role === 'admin' || user?.role === 'pharmacist'

  // Write-off state
  const [writeOffBatch, setWriteOffBatch] = useState<MedicineBatch | null>(null)
  const [writeOffReason, setWriteOffReason] = useState('')

  // Add batch state
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ batchNumber: '', expiryDate: '', quantity: 1, costPrice: '' })
  const [showDepleted, setShowDepleted] = useState(false)

  const activeBatches = (batches ?? []).filter((b) => b.quantity > 0 && !b.writeOffAt)
  const emptyOrWrittenOff = (batches ?? []).filter((b) => b.quantity === 0 || b.writeOffAt)

  const inputStyle = {
    background: theme.cardAlt,
    border: `1px solid ${theme.border}`,
    color: theme.text
  }

  return (
    <div
      style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}
      className="rounded-xl overflow-hidden"
    >
      <div
        style={{ borderBottom: `1px solid ${theme.border}`, color: theme.text }}
        className="flex items-center gap-2 px-5 py-4 text-sm font-semibold"
      >
        <Layers size={15} color={theme.primaryText} />
        Stock Batches (Lots)
        {batches && batches.length > 0 && (
          <span style={{ color: theme.muted }} className="ml-auto text-xs font-normal">
            {activeBatches.length} active lot{activeBatches.length !== 1 ? 's' : ''}
          </span>
        )}
        {canEdit && (
          <button
            onClick={() => setAddOpen(true)}
            style={{ border: `1px solid ${theme.borderStrong}`, color: theme.text }}
            className="ml-2 flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs font-medium transition-colors hover:bg-[color:var(--row-hover)]"
          >
            <Plus size={12} /> Add Batch
          </button>
        )}
      </div>

      <div className="p-5">
        {isLoading ? (
          <div style={{ color: theme.muted }} className="flex items-center gap-2 text-sm">
            <Loader2 size={14} className="animate-spin" /> Loading batches…
          </div>
        ) : !batches || batches.length === 0 ? (
          <p style={{ color: theme.muted }} className="text-sm italic">
            No batch records yet. Receive a purchase order or add a batch manually to start tracking lots.
          </p>
        ) : (
          <div className="space-y-3">
            {activeBatches.map((batch) => {
              const expired = isExpired(batch.expiryDate)
              const expiringSoon = isExpiringSoon(batch.expiryDate)
              return (
                <div
                  key={batch.id}
                  className="rounded-lg p-3 flex items-start justify-between gap-3"
                  style={{
                    border: `1px solid ${expired ? theme.red : expiringSoon ? theme.amber : theme.border}55`,
                    background: expired ? theme.redBg : expiringSoon ? theme.amberBg : theme.cardAlt
                  }}
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span style={{ color: theme.text }} className="text-sm font-semibold">
                        {batch.batchNumber ? `Batch ${batch.batchNumber}` : `Batch #${batch.id}`}
                      </span>
                      {expired && (
                        <span
                          style={{ background: theme.redBg, color: theme.red }}
                          className="text-[9px] font-bold px-1.5 py-0 rounded"
                        >
                          EXPIRED
                        </span>
                      )}
                      {!expired && expiringSoon && (
                        <span
                          style={{ background: theme.amberBg, color: theme.amber }}
                          className="text-[9px] font-bold px-1.5 py-0 rounded"
                        >
                          EXPIRING SOON
                        </span>
                      )}
                    </div>
                    <div style={{ ...mono, color: theme.muted }} className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                      <span>
                        <span style={{ color: theme.text }} className="font-semibold">
                          {batch.quantity.toLocaleString()}
                        </span>{' '}
                        units remaining
                      </span>
                      {batch.expiryDate && (
                        <span>
                          Expires{' '}
                          <span
                            className="font-medium"
                            style={{ color: expired ? theme.red : expiringSoon ? theme.amber : theme.text }}
                          >
                            {new Date(`${batch.expiryDate}T00:00:00`).toLocaleDateString()}
                          </span>
                        </span>
                      )}
                      {batch.costPrice && <span>Cost {formatCurrency(parseFloat(batch.costPrice), settings)}/unit</span>}
                      <span>Received {new Date(batch.receivedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => {
                        setWriteOffBatch(batch)
                        setWriteOffReason('')
                      }}
                      title="Write off this batch"
                      style={{ color: theme.muted }}
                      className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors hover:bg-[color:var(--row-hover)]"
                    >
                      <PackageX size={14} />
                    </button>
                  )}
                </div>
              )
            })}

            {emptyOrWrittenOff.length > 0 && (
              <div>
                <button
                  onClick={() => setShowDepleted((s) => !s)}
                  style={{ color: theme.muted }}
                  className="text-xs cursor-pointer hover:opacity-80 select-none"
                >
                  {showDepleted ? '▾' : '▸'} {emptyOrWrittenOff.length} depleted / written-off lot
                  {emptyOrWrittenOff.length !== 1 ? 's' : ''}
                </button>
                {showDepleted && (
                  <div className="space-y-2 mt-2">
                    {emptyOrWrittenOff.map((batch) => (
                      <div
                        key={batch.id}
                        style={{ border: `1px solid ${theme.border}`, background: theme.hover }}
                        className="rounded-lg p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span style={{ ...mono, color: theme.muted }} className="text-sm">
                            {batch.batchNumber ? `Batch ${batch.batchNumber}` : `Batch #${batch.id}`}
                          </span>
                          {batch.writeOffAt && (
                            <span
                              style={{ border: `1px solid ${theme.borderStrong}`, color: theme.muted }}
                              className="text-[9px] font-bold px-1.5 py-0 rounded"
                            >
                              WRITTEN OFF
                            </span>
                          )}
                        </div>
                        {batch.writeOffReason && (
                          <p style={{ color: theme.muted }} className="text-xs mt-1">
                            Reason: {batch.writeOffReason}
                          </p>
                        )}
                        {batch.expiryDate && (
                          <p style={{ color: theme.muted }} className="text-xs">
                            Expired {new Date(`${batch.expiryDate}T00:00:00`).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add batch dialog */}
      {addOpen && (
        <Modal title={`Add Stock Batch — ${medicineName}`} onClose={() => setAddOpen(false)} width={440}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span style={{ color: theme.muted }} className="text-xs font-medium mb-1.5 block">
                  Batch / Lot Number
                </span>
                <input
                  placeholder="e.g. BX-2024-001"
                  value={form.batchNumber}
                  onChange={(e) => setForm((f) => ({ ...f, batchNumber: e.target.value }))}
                  style={inputStyle}
                  className="w-full text-sm rounded-lg px-3 py-2 outline-none placeholder:opacity-50"
                />
              </label>
              <label className="block">
                <span style={{ color: theme.muted }} className="text-xs font-medium mb-1.5 block">
                  Expiry Date
                </span>
                <input
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
                  style={inputStyle}
                  className="w-full text-sm rounded-lg px-3 py-2 outline-none"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span style={{ color: theme.muted }} className="text-xs font-medium mb-1.5 block">
                  Quantity (base units) <span style={{ color: theme.red }}>*</span>
                </span>
                <input
                  type="number"
                  min={1}
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: Math.max(1, parseInt(e.target.value) || 1) }))}
                  style={inputStyle}
                  className="w-full text-sm rounded-lg px-3 py-2 outline-none"
                />
              </label>
              <label className="block">
                <span style={{ color: theme.muted }} className="text-xs font-medium mb-1.5 block">
                  Cost Price / base unit
                </span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="0.00"
                  value={form.costPrice}
                  onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
                  style={inputStyle}
                  className="w-full text-sm rounded-lg px-3 py-2 outline-none placeholder:opacity-50"
                />
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setAddOpen(false)}
                style={{ border: `1px solid ${theme.borderStrong}`, color: theme.text }}
                className="flex-1 rounded-lg py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  addBatch.mutate(
                    {
                      batchNumber: form.batchNumber.trim() || null,
                      expiryDate: form.expiryDate || null,
                      quantity: form.quantity,
                      costPrice: form.costPrice || null
                    },
                    {
                      onSuccess: () => {
                        showToast('Batch added successfully')
                        setAddOpen(false)
                        setForm({ batchNumber: '', expiryDate: '', quantity: 1, costPrice: '' })
                      },
                      onError: (err) => showToast(err.message || 'Failed to add batch')
                    }
                  )
                }
                disabled={addBatch.isPending || form.quantity < 1}
                style={{ background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)' }}
                className="flex-1 rounded-lg py-2 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {addBatch.isPending && <Loader2 size={13} className="animate-spin" />}
                Add Batch
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Write-off confirmation dialog */}
      {writeOffBatch && (
        <Modal title="Write Off Batch" onClose={() => setWriteOffBatch(null)} width={400}>
          <div className="space-y-4">
            <div
              className="flex items-center gap-2 rounded-lg p-3 text-sm"
              style={{ background: theme.redBg, color: theme.red }}
            >
              <AlertTriangle size={15} className="shrink-0" />
              <span>
                This will write off{' '}
                <strong>
                  {writeOffBatch.quantity} unit{writeOffBatch.quantity !== 1 ? 's' : ''}
                </strong>{' '}
                from {writeOffBatch.batchNumber ? `batch ${writeOffBatch.batchNumber}` : `batch #${writeOffBatch.id}`}.
                This cannot be undone.
              </span>
            </div>
            <label className="block">
              <span style={{ color: theme.muted }} className="text-xs font-medium mb-1.5 block">
                Reason <span style={{ color: theme.red }}>*</span>
              </span>
              <input
                placeholder="e.g. Expired, damaged, contaminated…"
                value={writeOffReason}
                onChange={(e) => setWriteOffReason(e.target.value)}
                style={inputStyle}
                className="w-full text-sm rounded-lg px-3 py-2 outline-none placeholder:opacity-50"
              />
            </label>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setWriteOffBatch(null)}
                style={{ border: `1px solid ${theme.borderStrong}`, color: theme.text }}
                className="flex-1 rounded-lg py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  writeOff.mutate(
                    { batchId: writeOffBatch.id, reason: writeOffReason.trim() },
                    {
                      onSuccess: () => {
                        showToast('Batch written off')
                        setWriteOffBatch(null)
                        setWriteOffReason('')
                      },
                      onError: (err) => showToast(err.message || 'Write-off failed')
                    }
                  )
                }
                disabled={writeOff.isPending || !writeOffReason.trim()}
                style={{ background: theme.red, color: '#fff' }}
                className="flex-1 rounded-lg py-2 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {writeOff.isPending && <Loader2 size={13} className="animate-spin" />}
                Write Off
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
