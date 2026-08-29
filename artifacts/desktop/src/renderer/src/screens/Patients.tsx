import type { ReactElement } from 'react'
import { useState, useEffect } from 'react'
import { Search, Plus, Loader2, Phone, ShieldAlert, Activity, ClipboardList, Trash2, AlertTriangle, ChevronLeft, ChevronRight, Printer, RefreshCw, UserPlus } from 'lucide-react'
import {
  useListPatientsExtended,
  useCreatePatientExtended,
  usePatientAllergies,
  useAddPatientAllergy,
  useDeletePatientAllergy,
  usePatientConditions,
  useAddPatientCondition,
  useDeletePatientCondition,
  usePatientDispensingHistory,
  type PatientExtended,
  type DispensingHistoryItem
} from '../hooks/useExtraQueries'
import { apiUrl, authHeaders, jsonOrThrow } from '../lib/apiClient'
import { useUiStore } from '../store/uiStore'
import { getTheme, mono, serif } from '../theme'
import Modal from '../components/Modal'
import Field from '../components/Field'

const SEVERITY_COLOR: Record<string, 'ok' | 'low' | 'expiring'> = {
  mild: 'ok',
  moderate: 'low',
  severe: 'expiring'
}

function Pill({ label, kind, theme }: { label: string; kind: 'ok' | 'low' | 'expiring'; theme: ReturnType<typeof getTheme> }): ReactElement {
  const bg = kind === 'ok' ? theme.greenBg : kind === 'low' ? theme.amberBg : theme.redBg
  const fg = kind === 'ok' ? theme.green : kind === 'low' ? theme.amber : theme.red
  return (
    <span style={{ background: bg, color: fg }} className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold capitalize">
      {label}
    </span>
  )
}

function AddPatientModal({ onClose }: { onClose: () => void }): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const createPatient = useCreatePatientExtended()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [dob, setDob] = useState('')
  const [gender, setGender] = useState('')
  const [notes, setNotes] = useState('')

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      showToast('Patient name is required')
      return
    }
    try {
      await createPatient.mutateAsync({
        name: name.trim(),
        phone: phone.trim() || undefined,
        dateOfBirth: dob || undefined,
        gender: gender || undefined,
        notes: notes.trim() || undefined
      })
      showToast(`Registered ${name.trim()}`)
      onClose()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to register patient')
    }
  }

  return (
    <Modal title="Register patient" onClose={onClose}>
      <Field label="Full name" value={name} onChange={setName} placeholder="John Doe" required />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone" value={phone} onChange={setPhone} placeholder="+1 000 000 0000" />
        <label className="block mb-3">
          <span style={{ color: theme.muted }} className="text-xs mb-1.5 block">
            Gender
          </span>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
            className="w-full text-sm rounded-lg px-3 py-2 outline-none transition-all duration-150 focus:border-transparent focus:ring-2 focus:ring-emerald-500/40"
          >
            <option value="">Select…</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>
      <Field label="Date of birth" value={dob} onChange={setDob} type="date" />
      <Field label="Notes" value={notes} onChange={setNotes} placeholder="General notes…" textarea />
      <div className="flex items-center gap-2 mt-1">
        <button
          onClick={onClose}
          style={{ border: `1px solid ${theme.borderStrong}`, color: theme.text }}
          className="flex-1 rounded-lg py-2.5 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={createPatient.isPending}
          style={{ background: theme.primary, color: '#fff' }}
          className="flex-1 rounded-lg py-2.5 flex items-center justify-center gap-2 text-sm font-medium disabled:opacity-60"
        >
          {createPatient.isPending && <Loader2 size={14} className="animate-spin" />}
          {createPatient.isPending ? 'Registering�' : 'Register patient'}
        </button>
      </div>
    </Modal>
  )
}

type Tab = 'allergies' | 'conditions' | 'history'

function PatientDetailModal({ patient, onClose }: { patient: PatientExtended; onClose: () => void }): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const [tab, setTab] = useState<Tab>('allergies')

  const { data: allergies = [], isLoading: loadingA } = usePatientAllergies(patient.id)
  const addAllergy = useAddPatientAllergy(patient.id)
  const deleteAllergy = useDeletePatientAllergy(patient.id)
  const [allergen, setAllergen] = useState('')
  const [severity, setSeverity] = useState<'mild' | 'moderate' | 'severe'>('moderate')
  const [reaction, setReaction] = useState('')

  const { data: conditions = [], isLoading: loadingC } = usePatientConditions(patient.id)
  const addCondition = useAddPatientCondition(patient.id)
  const deleteCondition = useDeletePatientCondition(patient.id)
  const [conditionName, setConditionName] = useState('')
  const [condNotes, setCondNotes] = useState('')

  const [historyPage, setHistoryPage] = useState(1)
  const HISTORY_LIMIT = 20
  const { data: historyData, isLoading: loadingH } = usePatientDispensingHistory(patient.id, historyPage, HISTORY_LIMIT)
  const history = historyData?.data ?? []
  const historyTotal = historyData?.total ?? 0
  const [printData, setPrintData] = useState<DispensingHistoryItem[] | null>(null)
  const [printLoading, setPrintLoading] = useState(false)

  const submitAllergy = async (): Promise<void> => {
    if (!allergen.trim()) return
    try {
      await addAllergy.mutateAsync({ allergen: allergen.trim(), severity, reaction: reaction.trim() || undefined })
      setAllergen('')
      setReaction('')
      showToast('Allergy recorded')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save allergy')
    }
  }

  const submitCondition = async (): Promise<void> => {
    if (!conditionName.trim()) return
    try {
      await addCondition.mutateAsync({ condition: conditionName.trim(), notes: condNotes.trim() || undefined })
      setConditionName('')
      setCondNotes('')
      showToast('Condition recorded')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save condition')
    }
  }

  const printHistory = async (): Promise<void> => {
    if (printLoading) return
    setPrintLoading(true)
    try {
      const res = await fetch(apiUrl(`patients/${patient.id}/dispensing-history?page=1&limit=500`), {
        headers: authHeaders()
      })
      const data = await jsonOrThrow(res, 'Failed to load history for printing') as { data: DispensingHistoryItem[] }
      setPrintData(data.data)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load history for printing')
    } finally {
      setPrintLoading(false)
    }
  }

  useEffect(() => {
    if (printData !== null) {
      const t = window.setTimeout(() => window.print(), 50)
      return () => window.clearTimeout(t)
    }
  }, [printData])

  const tabs: { key: Tab; label: string; icon: typeof ShieldAlert; count: number }[] = [
    { key: 'allergies', label: 'Allergies', icon: ShieldAlert, count: allergies.length },
    { key: 'conditions', label: 'Conditions', icon: Activity, count: conditions.length },
    { key: 'history', label: 'History', icon: ClipboardList, count: historyTotal }
  ]

  return (
    <Modal title={`${patient.name} #${patient.id}`} onClose={onClose} width={640}>
      <div style={{ color: theme.muted }} className="text-xs space-y-0.5 mb-3">
        {patient.phone && (
          <p className="flex items-center gap-1.5">
            <Phone size={11} /> {patient.phone}
          </p>
        )}
        {patient.dateOfBirth && <p>DOB: {new Date(`${patient.dateOfBirth}T00:00:00`).toLocaleDateString()}</p>}
        {patient.gender && <p className="capitalize">Gender: {patient.gender}</p>}
      </div>

      <div style={{ borderBottom: `1px solid ${theme.border}` }} className="flex gap-1 mb-4">
        {tabs.map((t) => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                color: active ? theme.primary : theme.muted,
                borderBottom: active ? `2px solid ${theme.primary}` : '2px solid transparent'
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium -mb-px"
            >
              <t.icon size={13} />
              {t.label}
              {t.count > 0 && (
                <span style={{ background: theme.cardAlt, color: theme.muted }} className="px-1.5 rounded-full text-[10px]">
                  {t.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {tab === 'allergies' && (
        <div>
          {loadingA ? (
            <p style={{ color: theme.muted }} className="text-sm">
              Loading…
            </p>
          ) : allergies.length === 0 ? (
            <p style={{ color: theme.muted }} className="text-sm italic mb-4">
              No allergies recorded.
            </p>
          ) : (
            <div className="space-y-2 mb-4">
              {allergies.map((a) => (
                <div
                  key={a.id}
                  style={{ background: theme.cardAlt, border: `1px solid ${theme.border}` }}
                  className="flex items-center justify-between rounded-lg p-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span style={{ color: theme.text }} className="text-sm font-medium">
                        {a.allergen}
                      </span>
                      <Pill label={a.severity} kind={SEVERITY_COLOR[a.severity] ?? 'ok'} theme={theme} />
                    </div>
                    {a.reaction && (
                      <p style={{ color: theme.muted }} className="text-xs mt-0.5">
                        Reaction: {a.reaction}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => deleteAllergy.mutate({ id: a.id })}
                    style={{ color: theme.muted }}
                    className="p-1.5 hover:opacity-70"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div style={{ borderTop: `1px solid ${theme.border}` }} className="pt-4">
            <p style={{ color: theme.text }} className="text-sm font-medium mb-2">
              Add allergy
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Allergen" value={allergen} onChange={setAllergen} placeholder="e.g. Penicillin, Sulfa" required />
              <label className="block mb-3">
                <span style={{ color: theme.muted }} className="text-xs mb-1.5 block">
                  Severity
                </span>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as 'mild' | 'moderate' | 'severe')}
                  style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
                  className="w-full text-sm rounded-lg px-3 py-2 outline-none transition-all duration-150 focus:border-transparent focus:ring-2 focus:ring-emerald-500/40"
                >
                  <option value="mild">Mild</option>
                  <option value="moderate">Moderate</option>
                  <option value="severe">Severe</option>
                </select>
              </label>
            </div>
            <Field label="Reaction description" value={reaction} onChange={setReaction} placeholder="e.g. hives, anaphylaxis" />
            <button
              onClick={submitAllergy}
              disabled={addAllergy.isPending || !allergen.trim()}
              style={{ background: theme.primary, color: '#fff' }}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
            >
              {addAllergy.isPending && <Loader2 size={13} className="animate-spin" />}
              Add allergy
            </button>
          </div>
        </div>
      )}

      {tab === 'conditions' && (
        <div>
          {loadingC ? (
            <p style={{ color: theme.muted }} className="text-sm">
              Loading…
            </p>
          ) : conditions.length === 0 ? (
            <p style={{ color: theme.muted }} className="text-sm italic mb-4">
              No conditions recorded.
            </p>
          ) : (
            <div className="space-y-2 mb-4">
              {conditions.map((c) => (
                <div
                  key={c.id}
                  style={{ background: theme.cardAlt, border: `1px solid ${theme.border}` }}
                  className="flex items-center justify-between rounded-lg p-3"
                >
                  <div>
                    <p style={{ color: theme.text }} className="text-sm font-medium">
                      {c.condition}
                    </p>
                    {c.notes && (
                      <p style={{ color: theme.muted }} className="text-xs mt-0.5">
                        {c.notes}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => deleteCondition.mutate({ id: c.id })}
                    style={{ color: theme.muted }}
                    className="p-1.5 hover:opacity-70"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div style={{ borderTop: `1px solid ${theme.border}` }} className="pt-4">
            <p style={{ color: theme.text }} className="text-sm font-medium mb-2">
              Add condition
            </p>
            <Field label="Condition" value={conditionName} onChange={setConditionName} placeholder="e.g. Type 2 Diabetes" required />
            <Field label="Notes" value={condNotes} onChange={setCondNotes} placeholder="Additional context…" />
            <button
              onClick={submitCondition}
              disabled={addCondition.isPending || !conditionName.trim()}
              style={{ background: theme.primary, color: '#fff' }}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
            >
              {addCondition.isPending && <Loader2 size={13} className="animate-spin" />}
              Add condition
            </button>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p style={{ color: theme.muted }} className="text-xs">
              {historyTotal > 0 ? `${historyTotal} dispensing record${historyTotal === 1 ? '' : 's'}` : ''}
            </p>
            <button
              onClick={printHistory}
              disabled={printLoading}
              style={{ background: theme.cardAlt, color: theme.text, border: `1px solid ${theme.border}` }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs disabled:opacity-60"
            >
              <Printer size={12} />
              {printLoading ? 'Preparing�' : 'Print'}
            </button>
          </div>
          {loadingH ? (
            <p style={{ color: theme.muted }} className="text-sm">
              Loading history…
            </p>
          ) : history.length === 0 ? (
            <p style={{ color: theme.muted }} className="text-sm italic">
              No dispensing history found for this patient.
            </p>
          ) : (
            <div style={{ border: `1px solid ${theme.border}` }} className="rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: theme.cardAlt, color: theme.muted }} className="text-left text-xs">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Order #</th>
                    <th className="px-3 py-2 font-medium">Medicine</th>
                    <th className="px-3 py-2 font-medium text-right">Qty</th>
                    <th className="px-3 py-2 font-medium">Pharmacist</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.itemId} style={{ borderTop: `1px solid ${theme.border}` }}>
                      <td className="px-3 py-2" style={{ ...mono, color: theme.muted }}>
                        {new Date(row.orderDate).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2" style={{ color: theme.text }}>
                        #{row.orderId}
                        {row.orderStatus === 'cancelled' && (
                          <span style={{ color: theme.red }} className="ml-1 text-[10px] font-semibold">
                            (void)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2" style={{ color: theme.text }}>
                        {row.medicineName ?? '—'}
                        {row.medicineStrength && (
                          <span style={{ color: theme.muted }} className="ml-1 text-xs">
                            {row.medicineStrength}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right" style={{ ...mono, color: theme.text }}>
                        {row.quantity}
                        {row.unitName ? ` ${row.unitName}` : ''}
                        {(row.returnedQuantity ?? 0) > 0 && (
                          <span style={{ color: theme.amber }} className="ml-1 text-xs">
                            ({row.returnedQuantity} returned)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs" style={{ color: theme.muted }}>
                        {row.servedByName ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {historyTotal > HISTORY_LIMIT && (
            <div className="flex items-center justify-between mt-3 text-xs" style={{ color: theme.muted }}>
              <span>
                Page {historyPage} of {Math.ceil(historyTotal / HISTORY_LIMIT)}
              </span>
              <div className="flex gap-1">
                <button
                  disabled={historyPage <= 1 || loadingH}
                  onClick={() => setHistoryPage((p) => p - 1)}
                  style={{ background: theme.cardAlt, border: `1px solid ${theme.border}` }}
                  className="p-1.5 rounded-md disabled:opacity-40"
                >
                  <ChevronLeft size={13} />
                </button>
                <button
                  disabled={historyPage >= Math.ceil(historyTotal / HISTORY_LIMIT) || loadingH}
                  onClick={() => setHistoryPage((p) => p + 1)}
                  style={{ background: theme.cardAlt, border: `1px solid ${theme.border}` }}
                  className="p-1.5 rounded-md disabled:opacity-40"
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {printData !== null && (
        <div className="hidden print:block" style={{ fontFamily: 'sans-serif', color: '#111' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>
            Dispensing History � {patient.name}
          </h2>
          <p style={{ fontSize: '12px', color: '#444', marginBottom: '2px' }}>
            {patient.phone ? `Phone: ${patient.phone}` : ''}
          </p>
          <p style={{ fontSize: '12px', color: '#444', marginBottom: '12px' }}>
            {patient.dateOfBirth ? `DOB: ${new Date(`${patient.dateOfBirth}T00:00:00`).toLocaleDateString()}` : ''}
            {'  �  '}Printed: {new Date().toLocaleDateString()}
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr>
                <th style={{ borderBottom: '1px solid #999', textAlign: 'left', padding: '4px 8px' }}>Date</th>
                <th style={{ borderBottom: '1px solid #999', textAlign: 'left', padding: '4px 8px' }}>Order</th>
                <th style={{ borderBottom: '1px solid #999', textAlign: 'left', padding: '4px 8px' }}>Medicine</th>
                <th style={{ borderBottom: '1px solid #999', textAlign: 'right', padding: '4px 8px' }}>Qty</th>
                <th style={{ borderBottom: '1px solid #999', textAlign: 'left', padding: '4px 8px' }}>Pharmacist</th>
              </tr>
            </thead>
            <tbody>
              {printData.map((row) => (
                <tr key={row.itemId}>
                  <td style={{ borderBottom: '1px solid #ddd', padding: '4px 8px' }}>
                    {new Date(row.orderDate).toLocaleDateString()}
                  </td>
                  <td style={{ borderBottom: '1px solid #ddd', padding: '4px 8px' }}>
                    #{row.orderId}
                    {row.orderStatus === 'cancelled' ? ' (void)' : ''}
                  </td>
                  <td style={{ borderBottom: '1px solid #ddd', padding: '4px 8px' }}>
                    {row.medicineName ?? '�'}
                    {row.medicineStrength ? ` ${row.medicineStrength}` : ''}
                  </td>
                  <td style={{ borderBottom: '1px solid #ddd', padding: '4px 8px', textAlign: 'right' }}>
                    {row.quantity}
                    {row.unitName ? ` ${row.unitName}` : ''}
                    {(row.returnedQuantity ?? 0) > 0 ? ` (${row.returnedQuantity} returned)` : ''}
                  </td>
                  <td style={{ borderBottom: '1px solid #ddd', padding: '4px 8px' }}>
                    {row.servedByName ?? '�'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

export default function Patients(): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState<PatientExtended | null>(null)
  const { data: patients = [], isLoading, isError, refetch } = useListPatientsExtended(search.trim() || undefined)

  return (
    <div className="p-7">
      <div className="flex items-center justify-between mb-4">
        <h1 style={{ ...serif, color: theme.text }} className="text-xl font-semibold">
          Patients
        </h1>
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: theme.card, border: `1px solid ${theme.border}` }}
          >
            <Search size={14} color={theme.muted} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              style={{ ...mono, color: theme.text, background: 'transparent' }}
              className="field-inbox text-sm placeholder:opacity-60 w-56"
            />
          </div>
          <button
            onClick={() => setShowAdd(true)}
            style={{ background: theme.primary, color: '#fff' }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
          >
            <Plus size={14} />
            Add patient
          </button>
        </div>
      </div>
      <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-xl overflow-hidden">
        {isLoading ? (
          <p style={{ color: theme.muted }} className="p-4 text-sm">
            Loading patients�
          </p>
        ) : isError ? (
          <div className="p-4 text-center">
            <p style={{ color: theme.red }} className="text-sm mb-2">Couldn&apos;t load patients.</p>
            <button
              onClick={() => refetch()}
              style={{ border: `1px solid ${theme.border}`, color: theme.text }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
            >
              <RefreshCw size={12} /> Try again
            </button>
          </div>
        ) : patients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div style={{ background: theme.primarySoft, color: theme.primaryText }} className="w-12 h-12 rounded-xl flex items-center justify-center mb-3">
              <UserPlus size={22} />
            </div>
            <p style={{ ...serif, color: theme.text }} className="text-base font-medium">
              No patients yet
            </p>
            <p style={{ color: theme.muted }} className="text-sm mt-1 mb-4 max-w-sm">
              Register a patient to record allergies, conditions, prescriptions and dispensing history against them.
            </p>
            <button
              onClick={() => setShowAdd(true)}
              style={{ background: theme.primary, color: '#fff' }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
            >
              <Plus size={14} /> Add patient
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr
                style={{ color: theme.muted, borderBottom: `1px solid ${theme.border}` }}
                className="text-left text-xs uppercase tracking-wide"
              >
                <th className="py-2.5 px-4 font-medium">Name</th>
                <th className="py-2.5 px-4 font-medium">Phone</th>
                <th className="py-2.5 px-4 font-medium">DOB / Gender</th>
                <th className="py-2.5 px-4 font-medium">Allergies</th>
                <th className="py-2.5 px-4 font-medium">Notes</th>
                <th className="py-2.5 px-4 font-medium">Registered</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p, idx) => (
                <tr
                  key={p.id}
                  onClick={() => setSelected(p)}
                  style={{ borderTop: idx ? `1px solid ${theme.border}` : 'none', '--row-hover': theme.hover } as React.CSSProperties}
                  className="cursor-pointer transition-colors hover:bg-[color:var(--row-hover)]"
                >
                  <td className="py-2.5 px-4" style={{ color: theme.text }}>
                    {p.name}
                  </td>
                  <td className="py-2.5 px-4" style={{ ...mono, color: theme.muted }}>
                    {p.phone ?? '—'}
                  </td>
                  <td className="py-2.5 px-4" style={{ color: theme.muted }}>
                    {p.dateOfBirth ? new Date(`${p.dateOfBirth}T00:00:00`).toLocaleDateString() : '—'}
                    {p.gender && <span className="ml-1 capitalize">({p.gender})</span>}
                  </td>
                  <td className="py-2.5 px-4">
                    {(p.allergyCount ?? 0) > 0 ? (
                      <span
                        style={{ background: theme.redBg, color: theme.red }}
                        className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                      >
                        <AlertTriangle size={10} />
                        {p.allergyCount} allerg{p.allergyCount === 1 ? 'y' : 'ies'}
                      </span>
                    ) : (
                      <span style={{ color: theme.muted }}>—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 max-w-xs truncate" style={{ color: theme.muted }}>
                    {p.notes ?? '—'}
                  </td>
                  <td className="py-2.5 px-4" style={{ ...mono, color: theme.muted }}>
                    {new Date(p.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showAdd && <AddPatientModal onClose={() => setShowAdd(false)} />}
      {selected && <PatientDetailModal key={selected.id} patient={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
