import type { ReactElement } from 'react'
import { useState, useMemo } from 'react'
import { Plus, Loader2, Check, X as XIcon, Search, RefreshCw, Pencil, X } from 'lucide-react'
import { useListMedicines, useListPatients } from '@workspace/api-client-react'
import type { Medicine } from '@workspace/api-client-react'
import { useListPreAuths, useCreatePreAuth, useUpdatePreAuth } from '../hooks/useExtraQueries'
import { useUiStore } from '../store/uiStore'
import { getTheme, mono, serif } from '../theme'
import { useAuth } from '../hooks/useAuth'
import Modal from '../components/Modal'
import Field from '../components/Field'

const STATUS_COLOR: Record<string, 'ok' | 'low' | 'expiring'> = {
  approved: 'ok',
  pending: 'low',
  denied: 'expiring',
  expired: 'expiring'
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

function SubmitPreAuthModal({ onClose }: { onClose: () => void }): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const { data: patients = [] } = useListPatients()
  const createPreAuth = useCreatePreAuth()
  const [patientId, setPatientId] = useState<number | ''>('')
  const [medicineSearch, setMedicineSearch] = useState('')
  const [medicine, setMedicine] = useState<Medicine | null>(null)
  const { data: medResults = [] } = useListMedicines(medicineSearch.trim() ? { search: medicineSearch.trim() } : undefined)
  const [insurerName, setInsurerName] = useState('')
  const [policyNumber, setPolicyNumber] = useState('')
  const [diagnosisCode, setDiagnosisCode] = useState('')
  const [notes, setNotes] = useState('')

  const submit = async (): Promise<void> => {
    if (!medicine || !insurerName.trim()) {
      showToast('Medicine and insurer are required')
      return
    }
    try {
      await createPreAuth.mutateAsync({
        medicineId: medicine.id,
        patientId: patientId || undefined,
        insurerName: insurerName.trim(),
        policyNumber: policyNumber.trim() || undefined,
        diagnosisCode: diagnosisCode.trim() || undefined,
        notes: notes.trim() || undefined
      })
      showToast('Pre-authorization submitted')
      onClose()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to submit pre-authorization')
    }
  }

  return (
    <Modal title="Submit pre-authorization" onClose={onClose}>
      <label className="block mb-3">
        <span style={{ color: theme.muted }} className="text-xs mb-1.5 block">
          Patient (optional)
        </span>
        <select
          value={patientId}
          onChange={(e) => setPatientId(e.target.value ? Number(e.target.value) : '')}
          style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
          className="w-full text-sm rounded-lg px-3 py-2 outline-none"
        >
          <option value="">Walk-in / unspecified</option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block mb-3 relative">
        <span style={{ color: theme.muted }} className="text-xs mb-1.5 block">
          Medicine <span style={{ color: theme.red }}>*</span>
        </span>
        {medicine ? (
          <div
            style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
            className="w-full text-sm rounded-lg px-3 py-2 flex items-center justify-between"
          >
            {medicine.name}
            <button onClick={() => setMedicine(null)} style={{ color: theme.muted }}>
              <XIcon size={13} />
            </button>
          </div>
        ) : (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: theme.cardAlt, border: `1px solid ${theme.border}` }}
          >
            <Search size={13} color={theme.muted} />
            <input
              value={medicineSearch}
              onChange={(e) => setMedicineSearch(e.target.value)}
              placeholder="Search medicine name…"
              style={{ color: theme.text, background: 'transparent' }}
              className="w-full text-sm outline-none placeholder:opacity-50"
            />
          </div>
        )}
        {!medicine && medicineSearch.trim() && medResults.length > 0 && (
          <div
            style={{ background: theme.card, border: `1px solid ${theme.border}` }}
            className="absolute z-10 left-0 right-0 mt-1 rounded-lg overflow-hidden shadow-xl max-h-36 overflow-y-auto"
          >
            {medResults.slice(0, 8).map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setMedicine(m)
                  setMedicineSearch('')
                }}
                style={{ color: theme.text }}
                className="w-full text-left px-3 py-2 text-sm hover:opacity-70"
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
      </label>

      <Field label="Insurer" value={insurerName} onChange={setInsurerName} placeholder="e.g. Aetna" required />
      <Field label="Policy number" value={policyNumber} onChange={setPolicyNumber} placeholder="Optional" />
      <Field label="Diagnosis code" value={diagnosisCode} onChange={setDiagnosisCode} placeholder="e.g. ICD-10 code" />
      <Field label="Notes" value={notes} onChange={setNotes} placeholder="Optional" textarea />
      <button
        onClick={submit}
        disabled={createPreAuth.isPending}
        style={{ background: theme.primary, color: '#fff' }}
        className="w-full mt-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
      >
        {createPreAuth.isPending && <Loader2 size={14} className="animate-spin" />}
        {createPreAuth.isPending ? 'Submitting…' : 'Submit pre-authorization'}
      </button>
    </Modal>
  )
}

function EditRefModal({ id, currentRef, onClose }: { id: number; currentRef: string | null; onClose: () => void }): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const updatePreAuth = useUpdatePreAuth()
  const [ref, setRef] = useState(currentRef ?? '')

  const save = async (): Promise<void> => {
    try {
      await updatePreAuth.mutateAsync({ id, referenceNumber: ref.trim() || null })
      showToast('Reference number updated')
      onClose()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update reference number')
    }
  }

  return (
    <Modal title="Reference number" onClose={onClose} width={400}>
      <Field
        label="Authorization reference #"
        value={ref}
        onChange={setRef}
        placeholder="e.g. AUTH-002345"
      />
      <button
        onClick={save}
        disabled={updatePreAuth.isPending}
        style={{ background: theme.primary, color: '#fff' }}
        className="w-full mt-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
      >
        {updatePreAuth.isPending ? 'Saving…' : 'Save'}
      </button>
    </Modal>
  )
}

const TARGET_STATUSES = ['pending', 'approved', 'denied', 'expired'] as const

export default function PreAuthorizations(): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const { user } = useAuth()
  const { data: preAuths = [], isLoading, isError, refetch } = useListPreAuths()
  const updatePreAuth = useUpdatePreAuth()
  const [showSubmit, setShowSubmit] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [editRefId, setEditRefId] = useState<number | null>(null)

  const canManage = user?.role === 'admin' || user?.role === 'pharmacist'

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return preAuths
    return preAuths.filter((p) => p.status === statusFilter)
  }, [preAuths, statusFilter])

  const act = async (id: number, status: string): Promise<void> => {
    try {
      await updatePreAuth.mutateAsync({ id, status })
      showToast(`Pre-authorization ${status}`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update pre-authorization')
    }
  }

  return (
    <div className="p-7">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 style={{ ...serif, color: theme.text }} className="text-xl font-semibold">
            Pre-Authorizations
          </h1>
          <p style={{ color: theme.muted }} className="text-sm mt-0.5">
            Request insurer approval before dispensing expensive or restricted medicines.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowSubmit(true)}
            style={{ background: theme.primary, color: '#fff' }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
          >
            <Plus size={14} />
            Submit request
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
          className="text-sm rounded-lg px-3 py-2 outline-none"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="denied">Denied</option>
          <option value="expired">Expired</option>
        </select>
        {statusFilter !== 'all' && (
          <button onClick={() => setStatusFilter('all')} style={{ color: theme.muted }} className="flex items-center gap-1 text-xs px-2 py-1.5 hover:opacity-70">
            <X size={12} /> Clear
          </button>
        )}
        {!isLoading && (
          <span style={{ color: theme.muted }} className="text-xs ml-auto">
            {filtered.length} request{filtered.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-xl overflow-hidden">
        {isLoading ? (
          <p style={{ color: theme.muted }} className="p-4 text-sm">
            Loading pre-authorizations…
          </p>
        ) : isError ? (
          <div className="p-4 text-center">
            <p style={{ color: theme.red }} className="text-sm mb-2">Couldn&apos;t load pre-authorizations.</p>
            <button onClick={() => refetch()} style={{ border: `1px solid ${theme.border}`, color: theme.text }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs">
              <RefreshCw size={12} /> Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p style={{ color: theme.muted }} className="p-4 text-sm">
            {preAuths.length === 0 ? 'No pre-authorizations found.' : 'No requests match this filter.'}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: theme.muted, borderBottom: `1px solid ${theme.border}` }} className="text-left text-xs uppercase tracking-wide">
                <th className="py-2.5 px-4 font-medium">Ref</th>
                <th className="py-2.5 px-4 font-medium">Patient</th>
                <th className="py-2.5 px-4 font-medium">Medicine</th>
                <th className="py-2.5 px-4 font-medium">Insurer</th>
                <th className="py-2.5 px-4 font-medium">Policy #</th>
                <th className="py-2.5 px-4 font-medium">Notes</th>
                <th className="py-2.5 px-4 font-medium">Submitted</th>
                <th className="py-2.5 px-4 font-medium">Resolved</th>
                <th className="py-2.5 px-4 font-medium">Status</th>
                <th className="py-2.5 px-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, idx) => (
                <tr key={p.id} style={{ borderTop: idx ? `1px solid ${theme.border}` : 'none' }} className="align-top">
                  <td className="py-2.5 px-4" style={{ ...mono, color: theme.text }}>
                    {p.referenceNumber ?? `#${p.id}`}
                    {canManage && (
                      <button
                        onClick={() => setEditRefId(p.id)}
                        title="Edit reference number"
                        style={{ color: theme.muted }}
                        className="ml-1.5 align-middle hover:opacity-70"
                      >
                        <Pencil size={11} />
                      </button>
                    )}
                  </td>
                  <td className="py-2.5 px-4" style={{ color: theme.text }}>
                    {p.patientName ?? '—'}
                    {p.patientId != null && <span style={{ color: theme.muted }} className="text-xs"> #{p.patientId}</span>}
                  </td>
                  <td className="py-2.5 px-4" style={{ color: theme.muted }}>
                    <div>{p.medicineName ?? '—'}</div>
                    {p.diagnosisCode && (
                      <div style={{ ...mono, color: theme.muted }} className="text-xs mt-0.5">
                        DX: {p.diagnosisCode}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-4" style={{ color: theme.muted }}>{p.insurerName}</td>
                  <td className="py-2.5 px-4" style={{ ...mono, color: theme.muted }}>{p.policyNumber ?? '—'}</td>
                  <td className="py-2.5 px-4" style={{ color: theme.muted }}>
                    {p.notes ? (
                      <span className="italic line-clamp-2" title={p.notes}>{p.notes}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2.5 px-4" style={{ ...mono, color: theme.muted }}>
                    {new Date(p.submittedAt).toLocaleDateString()}
                  </td>
                  <td className="py-2.5 px-4" style={{ ...mono, color: theme.muted }}>
                    {p.resolvedAt ? new Date(p.resolvedAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="py-2.5 px-4"><StatusPill status={p.status} theme={theme} /></td>
                  <td className="py-2.5 px-4">
                    {canManage && p.status === 'pending' && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => act(p.id, 'approved')}
                          style={{ background: theme.greenBg, color: theme.green }}
                          className="p-1.5 rounded-md"
                          title="Approve"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          onClick={() => act(p.id, 'denied')}
                          style={{ background: theme.redBg, color: theme.red }}
                          className="p-1.5 rounded-md"
                          title="Deny"
                        >
                          <XIcon size={13} />
                        </button>
                        <button
                          onClick={() => act(p.id, 'expired')}
                          style={{ background: theme.amberBg, color: theme.amber }}
                          className="p-1.5 rounded-md"
                          title="Mark expired"
                        >
                          <RefreshCw size={12} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showSubmit && <SubmitPreAuthModal onClose={() => setShowSubmit(false)} />}
      {editRefId !== null && (
        <EditRefModal
          id={editRefId}
          currentRef={preAuths.find((p) => p.id === editRefId)?.referenceNumber ?? null}
          onClose={() => setEditRefId(null)}
        />
      )}
    </div>
  )
}
