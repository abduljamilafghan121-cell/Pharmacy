import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { AlertOctagon, ShieldAlert, ShieldQuestion, Info, Search, Plus, Trash2, Loader2, RefreshCw, Zap } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useListMedicines } from '@workspace/api-client-react'
import type { Medicine } from '@workspace/api-client-react'
import { useListDrugInteractions, type DrugInteraction } from '../hooks/useExtraQueries'
import { useUiStore } from '../store/uiStore'
import Loading from '../components/Loading'
import { getTheme, mono, serif } from '../theme'
import { apiUrl, authHeaders, jsonOrThrow } from '../lib/apiClient'
import Modal from '../components/Modal'

const SEVERITY: Record<
  string,
  { kind: 'ok' | 'low' | 'expiring' | 'critical'; icon: typeof Info; label: string }
> = {
  minor: { kind: 'ok', icon: Info, label: 'Minor' },
  moderate: { kind: 'low', icon: ShieldQuestion, label: 'Moderate' },
  major: { kind: 'expiring', icon: ShieldAlert, label: 'Major' },
  contraindicated: { kind: 'critical', icon: AlertOctagon, label: 'Contraindicated' }
}

const SEVERITY_ORDER = ['contraindicated', 'major', 'moderate', 'minor'] as const

function SeverityBadge({ severity, theme }: { severity: string; theme: ReturnType<typeof getTheme> }): ReactElement {
  const cfg = SEVERITY[severity] ?? SEVERITY.minor
  const Icon = cfg.icon
  const bg = cfg.kind === 'ok' ? theme.greenBg : cfg.kind === 'low' ? theme.amberBg : theme.redBg
  const fg = cfg.kind === 'ok' ? theme.green : cfg.kind === 'low' ? theme.amber : theme.red
  return (
    <span
      style={{ background: cfg.kind === 'critical' ? theme.red : bg, color: cfg.kind === 'critical' ? '#fff' : fg }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
    >
      <Icon size={12} />
      {cfg.label}
    </span>
  )
}

function AddInteractionModal({ onClose }: { onClose: () => void }): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const queryClient = useQueryClient()
  const { data: medicines = [] } = useListMedicines()
  const [med1, setMed1] = useState<number | ''>('')
  const [med2, setMed2] = useState<number | ''>('')
  const [severity, setSeverity] = useState<'minor' | 'moderate' | 'major' | 'contraindicated'>('moderate')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const selfConflict = med1 !== '' && med1 === med2
  const canSave = med1 !== '' && med2 !== '' && !selfConflict

  const save = async (): Promise<void> => {
    if (med1 === '' || med2 === '' || selfConflict) return
    setSaving(true)
    try {
      await fetch(apiUrl('drug-interactions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ medicine1Id: med1, medicine2Id: med2, severity, description: description.trim() || undefined })
      }).then((res) => jsonOrThrow(res, 'Failed to add interaction'))
      showToast('Interaction rule added')
      queryClient.invalidateQueries({ queryKey: ['drug-interactions'] })
      onClose()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add interaction')
    } finally {
      setSaving(false)
    }
  }

  const selectStyle = { background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }

  return (
    <Modal title="Add drug interaction rule" onClose={onClose} width={460}>
      <label className="block mb-3">
        <span style={{ color: theme.muted }} className="text-xs mb-1.5 block">
          Medicine 1 <span style={{ color: theme.red }}>*</span>
        </span>
        <select value={med1} onChange={(e) => setMed1(e.target.value ? Number(e.target.value) : '')} style={selectStyle} className="w-full text-sm rounded-lg px-3 py-2 outline-none">
          <option value="">Select medicine…</option>
          {medicines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.genericName ? ` (${m.genericName})` : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="block mb-3">
        <span style={{ color: theme.muted }} className="text-xs mb-1.5 block">
          Medicine 2 <span style={{ color: theme.red }}>*</span>
        </span>
        <select value={med2} onChange={(e) => setMed2(e.target.value ? Number(e.target.value) : '')} style={selectStyle} className="w-full text-sm rounded-lg px-3 py-2 outline-none">
          <option value="">Select medicine…</option>
          {medicines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.genericName ? ` (${m.genericName})` : ''}
            </option>
          ))}
        </select>
      </label>
      {selfConflict && (
        <p style={{ color: theme.red }} className="text-xs mb-3">
          A medicine cannot interact with itself.
        </p>
      )}
      <label className="block mb-3">
        <span style={{ color: theme.muted }} className="text-xs mb-1.5 block">
          Severity <span style={{ color: theme.red }}>*</span>
        </span>
        <select value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)} style={selectStyle} className="w-full text-sm rounded-lg px-3 py-2 outline-none">
          <option value="minor">Minor</option>
          <option value="moderate">Moderate</option>
          <option value="major">Major</option>
          <option value="contraindicated">Contraindicated</option>
        </select>
      </label>
      <label className="block mb-3">
        <span style={{ color: theme.muted }} className="text-xs mb-1.5 block">
          Clinical description
        </span>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Increases bleeding risk"
          style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
          className="w-full text-sm rounded-lg px-3 py-2 outline-none placeholder:opacity-50"
        />
      </label>
      <div className="flex gap-2">
        <button
          onClick={onClose}
          style={{ border: `1px solid ${theme.borderStrong}`, color: theme.text }}
          className="flex-1 rounded-lg py-2.5 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={!canSave || saving}
          style={{ background: theme.primary, color: '#fff' }}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}

export default function DrugInteractions(): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const queryClient = useQueryClient()
  const { data: interactions = [], isLoading, isError, refetch } = useListDrugInteractions()
  const { data: medicines = [] } = useListMedicines()
  const [filterQuery, setFilterQuery] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const nameFor = useMemo(() => {
    const map = new Map(medicines.map((m) => [m.id, m.name]))
    return (id: number): string => {
      const m = medicines.find((mm) => mm.id === id)
      return m?.genericName ? `${m.name} (${m.genericName})` : (map.get(id) ?? `Medicine #${id}`)
    }
  }, [medicines])

  const sorted = useMemo(() => {
    const order: Record<string, number> = { contraindicated: 0, major: 1, moderate: 2, minor: 3 }
    return [...interactions].sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9))
  }, [interactions])

  const filtered = useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((i) => {
      return (
        nameFor(i.medicine1Id).toLowerCase().includes(q) ||
        nameFor(i.medicine2Id).toLowerCase().includes(q) ||
        i.severity.toLowerCase().includes(q) ||
        (i.description ?? '').toLowerCase().includes(q)
      )
    })
  }, [sorted, filterQuery, nameFor])

  const counts = useMemo(() => {
    const c: Record<string, number> = { minor: 0, moderate: 0, major: 0, contraindicated: 0 }
    for (const i of interactions) c[i.severity] = (c[i.severity] ?? 0) + 1
    return c
  }, [interactions])

  const handleDelete = async (id: number): Promise<void> => {
    setDeletingId(id)
    try {
      await fetch(apiUrl(`drug-interactions/${id}`), {
        method: 'DELETE',
        headers: authHeaders()
      }).then((res) => jsonOrThrow(res, 'Failed to remove interaction'))
      showToast('Interaction rule removed')
      queryClient.invalidateQueries({ queryKey: ['drug-interactions'] })
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to remove interaction')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="p-7 max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 style={{ ...serif, color: theme.text }} className="text-xl font-semibold">
            Drug Interactions
          </h1>
          <p style={{ color: theme.muted }} className="text-sm mt-0.5">
            Manage known interaction rules between medicines — checked at the point of sale.
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          style={{ background: theme.primary, color: '#fff' }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={14} />
          Add interaction
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        {SEVERITY_ORDER.map((s) => {
          const cfg = SEVERITY[s]
          const Icon = cfg.icon
          return (
            <div key={s} style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-xl p-3 flex items-center justify-between">
              <span style={{ color: theme.muted }} className="text-sm font-medium capitalize flex items-center gap-2">
                <Icon size={14} style={{ color: s === 'contraindicated' ? theme.red : s === 'major' ? theme.red : theme.amber }} />
                {cfg.label}
              </span>
              <span style={{ ...mono, color: theme.text }} className="text-sm font-bold">
                {counts[s] ?? 0}
              </span>
            </div>
          )
        })}
      </div>

      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg mb-4 max-w-sm"
        style={{ background: theme.card, border: `1px solid ${theme.border}` }}
      >
        <Search size={13} color={theme.muted} />
        <input
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder="Filter by medicine or severity…"
          style={{ color: theme.text, background: 'transparent' }}
          className="field-inbox w-full text-sm placeholder:opacity-50"
        />
      </div>

      {isLoading ? (
        <Loading label="Loading interactions…" />
      ) : isError ? (
        <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="text-center py-16 rounded-xl">
          <p style={{ color: theme.red }} className="text-sm mb-3">Couldn&apos;t load drug interactions.</p>
          <button onClick={() => refetch()} style={{ border: `1px solid ${theme.border}`, color: theme.text }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs">
            <RefreshCw size={12} /> Try again
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="text-center py-16 rounded-xl">
          <Zap size={36} color={theme.muted} className="mx-auto mb-3 opacity-30" />
          <p style={{ color: theme.muted }} className="text-sm">
            {interactions.length === 0
              ? 'No interaction rules defined yet. Add one to get started.'
              : 'No interactions match your filter.'}
          </p>
        </div>
      ) : (
        <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderColor: theme.border }} className="rounded-xl divide-y">
          {filtered.map((i) => {
            const critical = i.severity === 'contraindicated'
            return (
              <div key={i.id} style={{ background: critical ? theme.redBg : 'transparent' }} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <AlertOctagon size={15} color={critical || i.severity === 'major' ? theme.red : i.severity === 'moderate' ? theme.amber : theme.primary} />
                  <div className="min-w-0">
                    <p style={{ color: theme.text }} className="text-sm font-medium leading-tight">
                      {nameFor(i.medicine1Id)}
                      <span style={{ color: theme.muted }} className="font-normal mx-1.5">+</span>
                      {nameFor(i.medicine2Id)}
                    </p>
                    {i.description && (
                      <p style={{ color: theme.muted }} className="text-xs mt-0.5 truncate max-w-md">{i.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  <SeverityBadge severity={i.severity} theme={theme} />
                  <button
                    onClick={() => handleDelete(i.id)}
                    disabled={deletingId === i.id}
                    style={{ color: theme.muted }}
                    className="p-1.5 hover:text-red disabled:opacity-50"
                    title="Remove rule"
                  >
                    {deletingId === i.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {addOpen && <AddInteractionModal onClose={() => setAddOpen(false)} />}
    </div>
  )
}
