import type { ReactElement } from 'react'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useListPrescriptions,
  useVerifyPrescription,
  useRejectPrescription,
  useCreatePrescription,
  getListPrescriptionsQueryKey
} from '@workspace/api-client-react'
import { FileText, CheckCircle, XCircle, Plus, User, Stethoscope, Paperclip, ImagePlus, AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import { useUiStore } from '../store/uiStore'
import { getTheme, mono, serif } from '../theme'
import { usePharmacySettings } from '../hooks/usePharmacySettings'
import { apiUrl, authHeaders, jsonOrThrow } from '../lib/apiClient'
import Modal from '../components/Modal'

// The generated Prescription type is stale — the server actually returns
// patientName/doctorName/maxRefills/refillsUsed/attachmentUrl (see
// artifacts/api-server/src/routes/prescriptions.ts). Same gap as web.
type PrescriptionRow = {
  id: number
  status: string
  createdAt: string
  notes?: string | null
  patientName?: string | null
  doctorName?: string | null
  attachmentUrl?: string | null
  maxRefills?: number
  refillsUsed?: number
}

const MAX_FILE_MB = 5

// PATCH /prescriptions/:id/attachment — not in the generated client yet
function useAttachPrescriptionFile() {
  const queryClient = useQueryClient()
  return useMutation<unknown, Error, { id: number; attachmentUrl: string }>({
    mutationFn: async ({ id, attachmentUrl }) => {
      const res = await fetch(apiUrl(`prescriptions/${id}/attachment`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ attachmentUrl })
      })
      return jsonOrThrow(res, 'Failed to attach file')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListPrescriptionsQueryKey() })
    }
  })
}

function readFileAsDataUrl(file: File, cb: (dataUrl: string) => void): void {
  const reader = new FileReader()
  reader.onload = () => cb(reader.result as string)
  reader.readAsDataURL(file)
}

export default function Prescriptions(): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)
  const { data: prescriptions = [], isLoading, isError, refetch } = useListPrescriptions()
  const [createOpen, setCreateOpen] = useState(false)
  const rows = (prescriptions ?? []) as unknown as PrescriptionRow[]

  return (
    <div className="p-7 max-w-6xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 style={{ ...serif, color: theme.text }} className="text-xl font-semibold">
            Prescriptions
          </h1>
          <p style={{ color: theme.muted }} className="text-xs mt-0.5">
            Record and verify patient prescriptions.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          style={{ background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)' }}
          className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-white text-sm font-semibold transition-transform active:scale-[0.98]"
        >
          <Plus size={14} /> New Prescription
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ background: theme.hover }} className="h-48 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div
          style={{ background: theme.card, border: `1px solid ${theme.border}` }}
          className="text-center py-16 rounded-xl"
        >
          <FileText size={44} color={theme.red} strokeWidth={1.4} className="mx-auto mb-4" />
          <h3 style={{ color: theme.red }} className="text-sm font-medium">
            Couldn&apos;t load prescriptions
          </h3>
          <p style={{ color: theme.muted }} className="text-xs mt-1 mb-4">
            Failed to fetch prescriptions from the server.
          </p>
          <button
            onClick={() => refetch()}
            style={{ border: `1px solid ${theme.border}`, color: theme.text }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
          >
            <RefreshCw size={12} /> Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div
          style={{ background: theme.card, border: `1px solid ${theme.border}` }}
          className="text-center py-16 rounded-xl"
        >
          <FileText size={44} color={theme.muted} strokeWidth={1.4} className="mx-auto mb-4" />
          <h3 style={{ color: theme.text }} className="text-sm font-medium">
            No prescriptions recorded
          </h3>
          <p style={{ color: theme.muted }} className="text-xs mt-1">
            Create a new prescription to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {rows.map((rx) => (
            <PrescriptionCard key={rx.id} rx={rx} />
          ))}
        </div>
      )}

      {createOpen && <NewPrescriptionModal onClose={() => setCreateOpen(false)} />}
    </div>
  )
}

// ── New prescription modal ──────────────────────────────────────────────────

function NewPrescriptionModal({ onClose }: { onClose: () => void }): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const queryClient = useQueryClient()

  const [patientName, setPatientName] = useState('')
  const [doctorName, setDoctorName] = useState('')
  const [notes, setNotes] = useState('')
  const [maxRefills, setMaxRefills] = useState(0)
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null)
  const [attachmentName, setAttachmentName] = useState<string | null>(null)

  const createMutation = useCreatePrescription({
    mutation: {
      onSuccess: () => {
        showToast('Prescription recorded')
        queryClient.invalidateQueries({ queryKey: getListPrescriptionsQueryKey() })
        onClose()
      },
      onError: (err: Error) => showToast(err.message || "Couldn't save prescription")
    }
  })

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      showToast('Please choose an image or PDF file')
      return
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      showToast(`File must be under ${MAX_FILE_MB}MB`)
      return
    }
    readFileAsDataUrl(file, (dataUrl) => {
      setAttachmentUrl(dataUrl)
      setAttachmentName(file.name)
    })
  }

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    createMutation.mutate({
      data: {
        patientName: patientName.trim() || undefined,
        doctorName: doctorName.trim() || undefined,
        notes: notes.trim() || undefined,
        maxRefills,
        ...(attachmentUrl ? ({ attachmentUrl } as any) : {})
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
    <Modal title="Record Prescription" onClose={onClose} width={480}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span style={{ color: theme.muted }} className={labelCls}>
            Patient Name
          </span>
          <input value={patientName} onChange={(e) => setPatientName(e.target.value)} placeholder="Patient full name" style={inputStyle} className={inputCls} />
        </label>
        <label className="block">
          <span style={{ color: theme.muted }} className={labelCls}>
            Prescribing Doctor
          </span>
          <input value={doctorName} onChange={(e) => setDoctorName(e.target.value)} placeholder="Dr. Name" style={inputStyle} className={inputCls} />
        </label>
        <label className="block">
          <span style={{ color: theme.muted }} className={labelCls}>
            Prescription Notes
          </span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Medicines, dosage, instructions…" style={inputStyle} className={inputCls} />
        </label>
        <label className="block">
          <span style={{ color: theme.muted }} className={labelCls}>
            Allowed Refills
          </span>
          <input
            type="number"
            min={0}
            max={12}
            value={maxRefills}
            onChange={(e) => setMaxRefills(Math.max(0, parseInt(e.target.value) || 0))}
            style={inputStyle}
            className={inputCls}
          />
          <span style={{ color: theme.muted }} className="text-[11px] mt-1 block">
            {maxRefills === 0
              ? 'Dispense once only — no refills'
              : `Can be filled ${maxRefills + 1} times total (original + ${maxRefills} refill${maxRefills !== 1 ? 's' : ''})`}
          </span>
        </label>

        {/* Attachment */}
        <div>
          <span style={{ color: theme.muted }} className={labelCls}>
            Prescription Image / PDF
          </span>
          {attachmentUrl ? (
            <div style={{ border: `1px solid ${theme.border}` }} className="flex items-center gap-3 rounded-lg p-2">
              {attachmentUrl.startsWith('data:image') ? (
                // eslint-disable-next-line jsx-a11y/alt-text
                <img src={attachmentUrl} alt="Prescription" className="w-12 h-12 object-cover rounded" />
              ) : (
                <FileText size={26} color={theme.muted} />
              )}
              <span style={{ color: theme.muted }} className="text-sm truncate flex-1">
                {attachmentName}
              </span>
              <button
                type="button"
                onClick={() => {
                  setAttachmentUrl(null)
                  setAttachmentName(null)
                }}
                style={{ color: theme.muted }}
                className="text-xs font-medium hover:opacity-70"
              >
                Remove
              </button>
            </div>
          ) : (
            <label
              style={{ border: `1px dashed ${theme.borderStrong}`, color: theme.muted }}
              className="flex items-center justify-center gap-2 rounded-lg p-3.5 cursor-pointer text-sm transition-colors hover:border-emerald-500/50"
            >
              <ImagePlus size={14} />
              Upload prescription image or PDF
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileSelect} />
            </label>
          )}
          <p style={{ color: theme.muted }} className="text-[11px] mt-1.5">
            Required for verification — a pharmacist must see the original before approving it.
          </p>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onClose} style={{ border: `1px solid ${theme.borderStrong}`, color: theme.text }} className="rounded-lg px-4 py-2 text-sm font-medium">
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            style={{ background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)' }}
            className="rounded-lg px-4 py-2 text-white text-sm font-semibold disabled:opacity-60"
          >
            {createMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Prescription card ───────────────────────────────────────────────────────

function PrescriptionCard({ rx }: { rx: PrescriptionRow }): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const queryClient = useQueryClient()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const attachMutation = useAttachPrescriptionFile()

  const handleInlineAttach = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      showToast('Please choose an image or PDF file')
      return
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      showToast(`File must be under ${MAX_FILE_MB}MB`)
      return
    }
    readFileAsDataUrl(file, (dataUrl) => {
      attachMutation.mutate(
        { id: rx.id, attachmentUrl: dataUrl },
        {
          onSuccess: () => showToast('Image attached'),
          onError: (err) => showToast(err.message || "Couldn't attach file")
        }
      )
    })
  }

  const verifyMutation = useVerifyPrescription({
    mutation: {
      onSuccess: () => {
        showToast('Prescription verified — ready to dispense')
        queryClient.invalidateQueries({ queryKey: getListPrescriptionsQueryKey() })
      },
      onError: (err: Error) => showToast(err.message || "Couldn't verify prescription")
    }
  })

  const rejectMutation = useRejectPrescription({
    mutation: {
      onSuccess: () => {
        showToast('Prescription rejected')
        queryClient.invalidateQueries({ queryKey: getListPrescriptionsQueryKey() })
        setRejectOpen(false)
        setRejectReason('')
      },
      onError: (err: Error) => showToast(err.message || "Couldn't reject prescription")
    }
  })

  const statusStyle: Record<string, { bg: string; fg: string }> = {
    pending: { bg: theme.amberBg, fg: theme.amber },
    verified: { bg: theme.greenBg, fg: theme.green },
    rejected: { bg: theme.redBg, fg: theme.red }
  }
  const st = statusStyle[rx.status] ?? { bg: theme.hover, fg: theme.muted }

  const refillsUsed = rx.refillsUsed ?? 0
  const refillsExhausted = rx.maxRefills != null && refillsUsed > rx.maxRefills
  const refillsLast = rx.maxRefills != null && refillsUsed === rx.maxRefills && rx.maxRefills > 0

  return (
    <div
      style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}
      className="rounded-xl p-5 flex flex-col"
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <p style={{ ...mono, color: theme.muted }} className="text-xs">
            RX #{rx.id}
          </p>
          <p style={{ color: theme.text }} className="font-semibold mt-1 flex items-center gap-1.5 text-sm">
            <User size={13} color={theme.muted} />
            {rx.patientName || <span style={{ color: theme.muted }} className="italic font-normal">Unknown patient</span>}
          </p>
        </div>
        <span style={{ background: st.bg, color: st.fg }} className="text-[11px] font-medium px-2 py-0.5 rounded-full capitalize">
          {rx.status}
        </span>
      </div>

      <div className="space-y-2 mb-4 flex-1">
        {rx.doctorName && (
          <p style={{ color: theme.muted }} className="text-sm flex items-center gap-2">
            <Stethoscope size={12} />
            <span>Dr. {rx.doctorName}</span>
          </p>
        )}
        <p style={{ color: theme.muted }} className="text-xs">
          Recorded: {new Date(rx.createdAt).toLocaleDateString()}
        </p>
        {rx.maxRefills != null && (
          <div
            className="flex items-center gap-2 text-xs rounded-md px-2 py-1 w-fit"
            style={{
              background: refillsExhausted ? theme.redBg : refillsLast ? theme.amberBg : theme.hover,
              color: refillsExhausted ? theme.red : refillsLast ? theme.amber : theme.muted,
              border: `1px solid ${refillsExhausted ? theme.red : refillsLast ? theme.amber : theme.border}44`
            }}
          >
            <span className="font-medium">Refills:</span>
            <span style={mono}>
              {refillsUsed} / {rx.maxRefills}
            </span>
            {refillsExhausted && <span className="font-semibold">— exhausted</span>}
            {refillsLast && <span>— last fill used</span>}
          </div>
        )}
        {rx.notes && (
          <div style={{ background: theme.hover, border: `1px solid ${theme.border}` }} className="p-2.5 rounded-md text-xs">
            <p style={{ color: theme.muted }} className="mb-1">
              Notes:
            </p>
            <p style={{ color: theme.text }}>{rx.notes}</p>
          </div>
        )}

        {rx.attachmentUrl ? (
          <a
            href={rx.attachmentUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ border: `1px solid ${theme.border}` }}
            className="flex items-center gap-2 rounded-md p-2 transition-colors hover:border-emerald-500/50"
          >
            {rx.attachmentUrl.startsWith('data:image') ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <img src={rx.attachmentUrl} alt="Prescription" className="w-9 h-9 object-cover rounded" />
            ) : (
              <FileText size={22} color={theme.muted} />
            )}
            <span style={{ color: theme.muted }} className="text-xs">
              View attached file
            </span>
          </a>
        ) : rx.status === 'pending' ? (
          <label
            style={{ border: `1px dashed ${theme.amber}88`, background: theme.amberBg, color: theme.amber }}
            className="flex items-center gap-2 rounded-md p-2 cursor-pointer text-xs"
          >
            <Paperclip size={12} />
            {attachMutation.isPending ? 'Uploading…' : 'Attach prescription image (required to verify)'}
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={handleInlineAttach}
            />
          </label>
        ) : null}
      </div>

      {rx.status === 'pending' && (
        <div style={{ borderTop: `1px solid ${theme.border}` }} className="flex flex-col gap-2 mt-auto pt-3">
          {!rx.attachmentUrl && (
            <p style={{ color: theme.muted }} className="text-[11px] flex items-center gap-1">
              <AlertCircle size={11} /> Attach the prescription image before verifying
            </p>
          )}
          <div className="flex gap-2">
            <button
              disabled={verifyMutation.isPending || !rx.attachmentUrl}
              onClick={() => verifyMutation.mutate({ id: rx.id, data: { notes: 'Verified by pharmacist' } })}
              style={{ background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)', opacity: !rx.attachmentUrl ? 0.5 : 1 }}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-white text-xs font-semibold disabled:cursor-not-allowed"
            >
              {verifyMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={13} />} Verify
            </button>
            <button
              onClick={() => setRejectOpen(true)}
              style={{ border: `1px solid ${theme.red}55`, color: theme.red }}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors hover:bg-[color:var(--row-hover)]"
            >
              <XCircle size={13} /> Reject
            </button>
          </div>
        </div>
      )}

      {rejectOpen && (
        <Modal title="Reject Prescription" onClose={() => setRejectOpen(false)} width={400}>
          <div className="space-y-4">
            <label className="block">
              <span style={{ color: theme.muted }} className="text-xs font-medium mb-1.5 block">
                Reason for rejection <span style={{ color: theme.red }}>*</span>
              </span>
              <input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Illegible, expired, missing signature…"
                style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
                className="w-full text-sm rounded-lg px-3 py-2 outline-none placeholder:opacity-50"
              />
            </label>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRejectOpen(false)} style={{ border: `1px solid ${theme.borderStrong}`, color: theme.text }} className="rounded-lg px-3.5 py-2 text-sm font-medium">
                Cancel
              </button>
              <button
                disabled={!rejectReason.trim() || rejectMutation.isPending}
                onClick={() => rejectMutation.mutate({ id: rx.id, data: { notes: rejectReason } })}
                style={{ background: theme.red, color: '#fff' }}
                className="rounded-lg px-3.5 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {rejectMutation.isPending ? 'Rejecting…' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
