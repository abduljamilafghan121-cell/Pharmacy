import type { ReactElement } from 'react'
import { useState, useMemo } from 'react'
import { Plus, Loader2, X, RefreshCw } from 'lucide-react'
import { useListOrders } from '@workspace/api-client-react'
import type { Order } from '@workspace/api-client-react'
import { useListInsuranceClaims, useCreateInsuranceClaim, useUpdateInsuranceClaim } from '../hooks/useExtraQueries'
import { useUiStore } from '../store/uiStore'
import { getTheme, mono, serif } from '../theme'
import Loading from '../components/Loading'
import { usePharmacySettings, formatCurrency } from '../hooks/usePharmacySettings'
import { useAuth } from '../hooks/useAuth'
import Modal from '../components/Modal'
import Field from '../components/Field'

// The generated Order type hasn't caught up with the API yet — the server
// does return patientName (see artifacts/api-server/src/routes/orders.ts).
type OrderRow = Order & { patientName?: string | null }

const CLAIM_STATUSES = ['submitted', 'approved', 'rejected', 'paid'] as const

const STATUS_COLOR: Record<string, 'ok' | 'low' | 'expiring'> = {
  approved: 'ok',
  paid: 'ok',
  submitted: 'low',
  rejected: 'expiring'
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

function SubmitClaimModal({ onClose }: { onClose: () => void }): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const { data: orders = [] } = useListOrders()
  const createClaim = useCreateInsuranceClaim()
  const [orderId, setOrderId] = useState<number | ''>('')
  const [providerName, setProviderName] = useState('')
  const [policyNumber, setPolicyNumber] = useState('')
  const [claimAmount, setClaimAmount] = useState('')
  const [notes, setNotes] = useState('')

  const submit = async (): Promise<void> => {
    if (!orderId || !providerName.trim() || !claimAmount.trim()) {
      showToast('Order, provider, and amount are required')
      return
    }
    try {
      await createClaim.mutateAsync({
        orderId,
        providerName: providerName.trim(),
        policyNumber: policyNumber.trim() || undefined,
        claimAmount: parseFloat(claimAmount),
        notes: notes.trim() || undefined
      })
      showToast('Claim submitted')
      onClose()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to submit claim')
    }
  }

  return (
    <Modal title="Submit insurance claim" onClose={onClose}>
      <label className="block mb-3">
        <span style={{ color: theme.muted }} className="text-xs mb-1.5 block">
          Order <span style={{ color: theme.red }}>*</span>
        </span>
        <select
          value={orderId}
          onChange={(e) => setOrderId(e.target.value ? Number(e.target.value) : '')}
          style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
          className="w-full text-sm rounded-lg px-3 py-2 outline-none"
        >
          <option value="">Select an order…</option>
          {(orders as OrderRow[]).map((o) => (
            <option key={o.id} value={o.id}>
              #{o.id} — {o.patientName ?? 'Walk-in'} — {o.total}
            </option>
          ))}
        </select>
      </label>
      <Field label="Insurance provider" value={providerName} onChange={setProviderName} placeholder="e.g. BlueCross" required />
      <Field label="Policy number" value={policyNumber} onChange={setPolicyNumber} placeholder="Optional" />
      <Field label="Claim amount" value={claimAmount} onChange={setClaimAmount} placeholder="0.00" type="number" required />
      <Field label="Notes" value={notes} onChange={setNotes} placeholder="Optional" textarea />
      <button
        onClick={submit}
        disabled={createClaim.isPending}
        style={{ background: theme.primary, color: '#fff' }}
        className="w-full mt-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
      >
        {createClaim.isPending && <Loader2 size={14} className="animate-spin" />}
        {createClaim.isPending ? 'Submitting…' : 'Submit claim'}
      </button>
    </Modal>
  )
}

export default function InsuranceClaims(): ReactElement {
  const { dark, showToast, setPendingSaleDetailId, setScreen } = useUiStore()
  const theme = getTheme(dark)
  const { data: settings } = usePharmacySettings()
  const { user } = useAuth()
  const { data: claims = [], isLoading, isError, refetch } = useListInsuranceClaims()
  const updateClaim = useUpdateInsuranceClaim()
  const [showSubmit, setShowSubmit] = useState(false)
  const [actingId, setActingId] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')

  const canManage = user?.role === 'admin' || user?.role === 'pharmacist'

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return claims
    return claims.filter((c) => c.status === statusFilter)
  }, [claims, statusFilter])

  const act = async (id: number, status: string): Promise<void> => {
    setActingId(id)
    try {
      await updateClaim.mutateAsync({ id, status: status as 'approved' | 'rejected' | 'paid' })
      showToast(`Claim set to ${status}`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update claim')
    } finally {
      setActingId(null)
    }
  }

  const openSale = (id: number): void => {
    setPendingSaleDetailId(id)
    setScreen('sales')
  }

  return (
    <div className="p-7">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 style={{ ...serif, color: theme.text }} className="text-xl font-semibold">
            Insurance Claims
          </h1>
          <p style={{ color: theme.muted }} className="text-sm mt-0.5">
            Track claims filed with insurers for insurance-paid sales.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowSubmit(true)}
            style={{ background: theme.primary, color: '#fff' }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
          >
            <Plus size={14} />
            Submit claim
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
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="paid">Paid</option>
        </select>
        {statusFilter !== 'all' && (
          <button onClick={() => setStatusFilter('all')} style={{ color: theme.muted }} className="flex items-center gap-1 text-xs px-2 py-1.5 hover:opacity-70">
            <X size={12} /> Clear
          </button>
        )}
        {!isLoading && (
          <span style={{ color: theme.muted }} className="text-xs ml-auto">
            {filtered.length} claim{filtered.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-xl overflow-hidden">
        {isLoading ? (
          <Loading label="Loading claims…" />
        ) : isError ? (
          <div className="p-4 text-center">
            <p style={{ color: theme.red }} className="text-sm mb-2">Couldn&apos;t load insurance claims.</p>
            <button onClick={() => refetch()} style={{ border: `1px solid ${theme.border}`, color: theme.text }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs">
              <RefreshCw size={12} /> Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p style={{ color: theme.muted }} className="p-4 text-sm">
            {claims.length === 0 ? 'No insurance claims found.' : 'No claims match this filter.'}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: theme.muted, borderBottom: `1px solid ${theme.border}` }} className="text-left text-xs uppercase tracking-wide">
                <th className="py-2.5 px-4 font-medium">Claim</th>
                <th className="py-2.5 px-4 font-medium">Order</th>
                <th className="py-2.5 px-4 font-medium">Provider</th>
                <th className="py-2.5 px-4 font-medium">Policy #</th>
                <th className="py-2.5 px-4 font-medium">Amount</th>
                <th className="py-2.5 px-4 font-medium">Submitted</th>
                <th className="py-2.5 px-4 font-medium">Status</th>
                <th className="py-2.5 px-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, idx) => (
                <tr key={c.id} style={{ borderTop: idx ? `1px solid ${theme.border}` : 'none' }}>
                  <td className="py-2.5 px-4" style={{ ...mono, color: theme.text }}>#{c.id}</td>
                  <td className="py-2.5 px-4">
                    <button
                      onClick={() => openSale(c.orderId)}
                      className="inline-flex items-center gap-1 transition-opacity hover:opacity-70"
                      style={{ ...mono, color: theme.primary }}
                    >
                      #{c.orderId}
                    </button>
                  </td>
                  <td className="py-2.5 px-4" style={{ color: theme.text }}>{c.providerName}</td>
                  <td className="py-2.5 px-4" style={{ ...mono, color: theme.muted }}>{c.policyNumber ?? '—'}</td>
                  <td className="py-2.5 px-4" style={{ ...mono, color: theme.text }}>
                    {formatCurrency(parseFloat(String(c.claimAmount)), settings)}
                  </td>
                  <td className="py-2.5 px-4" style={{ ...mono, color: theme.muted }}>
                    {new Date(c.submittedAt).toLocaleDateString()}
                  </td>
                  <td className="py-2.5 px-4"><StatusPill status={c.status} theme={theme} /></td>
                  <td className="py-2.5 px-4">
                    {canManage && c.status !== 'paid' && (
                      <div className="flex items-center gap-1.5">
                        <select
                          value={c.status}
                          disabled={actingId === c.id}
                          onChange={(e) => act(c.id, e.target.value)}
                          style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
                          className="text-xs rounded-md px-2 py-1.5 outline-none disabled:opacity-50"
                        >
                          {CLAIM_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s.charAt(0).toUpperCase() + s.slice(1)}
                            </option>
                          ))}
                        </select>
                        {actingId === c.id && <Loader2 size={13} className="animate-spin" color={theme.muted} />}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showSubmit && <SubmitClaimModal onClose={() => setShowSubmit(false)} />}
    </div>
  )
}
