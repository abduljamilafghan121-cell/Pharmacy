import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Loader2, Trash2, Plus } from 'lucide-react'
import { useUiStore } from '../store/uiStore'
import { getTheme } from '../theme'
import { apiUrl, authHeaders, jsonOrThrow } from '../lib/apiClient'

interface Contraindication {
  id: number
  contraindicationType: 'condition' | 'min_age' | 'max_age' | 'gender'
  value: string
  severity: 'warn' | 'block'
  description: string
}

const CI_TYPE_LABEL: Record<string, string> = {
  condition: 'Medical Condition',
  min_age: 'Minimum Age (years)',
  max_age: 'Maximum Age (years)',
  gender: 'Gender'
}

export default function ContraindicationsPanel({ medicineId }: { medicineId: number }): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)

  const [contraindications, setContraindications] = useState<Contraindication[]>([])
  const [ciLoading, setCiLoading] = useState(false)
  const [ciType, setCiType] = useState<Contraindication['contraindicationType']>('condition')
  const [ciValue, setCiValue] = useState('')
  const [ciSeverity, setCiSeverity] = useState<'warn' | 'block'>('warn')
  const [ciDescription, setCiDescription] = useState('')
  const [ciSaving, setCiSaving] = useState(false)

  const safetyFetch = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(apiUrl(path), {
      ...init,
      headers: { 'Content-Type': 'application/json', ...authHeaders(), ...init?.headers }
    })
    return jsonOrThrow(res, `Request failed (${res.status})`) as T
  }, [])

  const loadContraindications = useCallback(
    async (medId: number): Promise<void> => {
      setCiLoading(true)
      try {
        const rows = await safetyFetch<Contraindication[]>(`medicines/${medId}/contraindications`)
        setContraindications(rows)
      } catch {
        /* no DB yet — silently skip, same as web */
      } finally {
        setCiLoading(false)
      }
    },
    [safetyFetch]
  )

  useEffect(() => {
    if (medicineId) loadContraindications(medicineId)
  }, [medicineId, loadContraindications])

  const addContraindication = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!ciValue.trim() || !ciDescription.trim()) return
    setCiSaving(true)
    try {
      const row = await safetyFetch<Contraindication>(`medicines/${medicineId}/contraindications`, {
        method: 'POST',
        body: JSON.stringify({
          contraindicationType: ciType,
          value: ciValue.trim(),
          severity: ciSeverity,
          description: ciDescription.trim()
        })
      })
      setContraindications((prev) => [...prev, row])
      setCiValue('')
      setCiDescription('')
      showToast('Contraindication saved')
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't save contraindication")
    } finally {
      setCiSaving(false)
    }
  }

  const deleteContraindication = async (cid: number): Promise<void> => {
    try {
      await safetyFetch(`medicines/${medicineId}/contraindications/${cid}`, { method: 'DELETE' })
      setContraindications((prev) => prev.filter((c) => c.id !== cid))
      showToast('Contraindication removed')
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't remove contraindication")
    }
  }

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
        <AlertCircle size={15} color={theme.amber} />
        Drug-Patient Contraindications
        {contraindications.length > 0 && (
          <span style={{ color: theme.muted }} className="ml-auto text-xs font-normal">
            {contraindications.length} rule{contraindications.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="p-5 space-y-4">
        <p style={{ color: theme.muted }} className="text-sm">
          Define patient characteristics that trigger a warning or hard block at the point of sale — e.g. a specific
          medical condition, age range, or gender.
        </p>

        {/* Existing rules */}
        {ciLoading ? (
          <div style={{ color: theme.muted }} className="flex items-center gap-2 text-sm">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : contraindications.length === 0 ? (
          <p style={{ color: theme.muted }} className="text-sm italic">
            No contraindications defined.
          </p>
        ) : (
          <div className="space-y-2">
            {contraindications.map((ci) => {
              const block = ci.severity === 'block'
              return (
                <div
                  key={ci.id}
                  className="flex items-start justify-between rounded-lg p-3 gap-3"
                  style={{
                    border: `1px solid ${block ? theme.red : theme.amber}44`,
                    background: block ? theme.redBg : theme.amberBg
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        style={{
                          background: block ? theme.red : theme.amber,
                          color: theme.card
                        }}
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      >
                        {block ? 'BLOCK' : 'WARN'}
                      </span>
                      <span style={{ color: theme.muted }} className="text-xs">
                        {CI_TYPE_LABEL[ci.contraindicationType] ?? ci.contraindicationType}:
                      </span>
                      <span style={{ color: theme.text }} className="text-sm font-medium">
                        {ci.value}
                      </span>
                    </div>
                    <p style={{ color: theme.muted }} className="text-xs mt-1">
                      {ci.description}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteContraindication(ci.id)}
                    title="Remove rule"
                    style={{ color: theme.muted }}
                    className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors hover:bg-[color:var(--row-hover)]"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Add form */}
        <form onSubmit={addContraindication} style={{ borderTop: `1px solid ${theme.border}` }} className="pt-4 space-y-3">
          <p style={{ color: theme.text }} className="text-sm font-medium">
            Add contraindication rule
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span style={{ color: theme.muted }} className="text-xs font-medium mb-1.5 block">
                Type
              </span>
              <select
                value={ciType}
                onChange={(e) => {
                  setCiType(e.target.value as Contraindication['contraindicationType'])
                  setCiValue('')
                }}
                style={inputStyle}
                className="w-full text-sm rounded-lg px-3 py-2 outline-none"
              >
                <option value="condition">Medical Condition</option>
                <option value="min_age">Minimum Age (years)</option>
                <option value="max_age">Maximum Age (years)</option>
                <option value="gender">Gender</option>
              </select>
            </label>
            <label className="block">
              <span style={{ color: theme.muted }} className="text-xs font-medium mb-1.5 block">
                {ciType === 'condition' ? 'Condition name' : ciType === 'gender' ? 'Gender' : 'Age limit'}
              </span>
              {ciType === 'gender' ? (
                <select
                  value={ciValue}
                  onChange={(e) => setCiValue(e.target.value)}
                  style={inputStyle}
                  className="w-full text-sm rounded-lg px-3 py-2 outline-none"
                >
                  <option value="">Select…</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              ) : (
                <input
                  value={ciValue}
                  onChange={(e) => setCiValue(e.target.value)}
                  placeholder={ciType === 'condition' ? 'e.g. Renal Impairment' : 'e.g. 18'}
                  type={ciType === 'min_age' || ciType === 'max_age' ? 'number' : 'text'}
                  style={inputStyle}
                  className="w-full text-sm rounded-lg px-3 py-2 outline-none placeholder:opacity-50"
                />
              )}
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span style={{ color: theme.muted }} className="text-xs font-medium mb-1.5 block">
                Severity
              </span>
              <select
                value={ciSeverity}
                onChange={(e) => setCiSeverity(e.target.value as 'warn' | 'block')}
                style={inputStyle}
                className="w-full text-sm rounded-lg px-3 py-2 outline-none"
              >
                <option value="warn">Warn (can override)</option>
                <option value="block">Block (hard stop)</option>
              </select>
            </label>
            <label className="block">
              <span style={{ color: theme.muted }} className="text-xs font-medium mb-1.5 block">
                Description <span style={{ color: theme.red }}>*</span>
              </span>
              <input
                value={ciDescription}
                onChange={(e) => setCiDescription(e.target.value)}
                placeholder="e.g. Contraindicated in renal failure — risk of toxicity"
                style={inputStyle}
                className="w-full text-sm rounded-lg px-3 py-2 outline-none placeholder:opacity-50"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={ciSaving || !ciValue.trim() || !ciDescription.trim()}
              style={{ background: 'linear-gradient(135deg, #22B57F 0%, #0E8A64 100%)' }}
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-white text-sm font-semibold transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              {ciSaving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Add Rule
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
