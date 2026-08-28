import type { ReactElement } from 'react'
import { useState } from 'react'
import { ClipboardCheck, CheckCircle2, Clock, User, Plus, Loader2, ArrowLeft, AlertTriangle, Search } from 'lucide-react'
import {
  useListStocktakes,
  useStocktakeDetail,
  useCreateStocktake,
  useUpdateStocktakeItem,
  useFinalizeStocktake
} from '../hooks/useExtraQueries'
import { useUiStore } from '../store/uiStore'
import { getTheme, mono, serif } from '../theme'
import Modal from '../components/Modal'
import Field from '../components/Field'

function StartStocktakeModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const createStocktake = useCreateStocktake()
  const [reference, setReference] = useState('')

  const submit = async (): Promise<void> => {
    try {
      const st = await createStocktake.mutateAsync({ reference: reference.trim() || undefined })
      showToast(`Stocktake ${st.reference} started`)
      onCreated(st.id)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to start stocktake')
    }
  }

  return (
    <Modal title="Start stocktake" onClose={onClose}>
      <p style={{ color: theme.muted }} className="text-sm mb-3">
        A snapshot of all medicine quantities will be taken now. Enter a reference name or leave blank to auto-generate one.
      </p>
      <Field label="Reference (optional)" value={reference} onChange={setReference} placeholder="e.g. Q3-2026" />
      <button
        onClick={submit}
        disabled={createStocktake.isPending}
        style={{ background: theme.primary, color: '#fff' }}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
      >
        {createStocktake.isPending && <Loader2 size={14} className="animate-spin" />}
        {createStocktake.isPending ? 'Starting…' : 'Start counting'}
      </button>
    </Modal>
  )
}

function StocktakeDetailView({ id, onBack }: { id: number; onBack: () => void }): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const { data: detail, isLoading } = useStocktakeDetail(id)
  const updateItem = useUpdateStocktakeItem()
  const finalize = useFinalizeStocktake()
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState<Record<number, string>>({})
  const [savingId, setSavingId] = useState<number | null>(null)
  const [confirmFinalize, setConfirmFinalize] = useState(false)

  if (isLoading || !detail) {
    return (
      <p style={{ color: theme.muted }} className="text-sm">
        Loading stocktakeâ€¦
      </p>
    )
  }

  const finalized = detail.status === 'finalized'
  const items = detail.items.filter((i) => !search || i.medicineName.toLowerCase().includes(search.toLowerCase()))
  const uncounted = detail.items.filter((i) => i.countedQuantity == null).length
  const discrepancies = detail.items.filter((i) => i.countedQuantity != null && i.countedQuantity !== i.systemQuantity).length

  const saveCount = async (itemId: number, raw: string): Promise<void> => {
    const parsed = raw.trim() === '' ? null : parseInt(raw, 10)
    if (parsed !== null && (isNaN(parsed) || parsed < 0)) return
    setSavingId(itemId)
    try {
      await updateItem.mutateAsync({ stocktakeId: id, itemId, countedQuantity: parsed })
      setPending((prev) => {
        const copy = { ...prev }
        delete copy[itemId]
        return copy
      })
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save count')
    } finally {
      setSavingId(null)
    }
  }

  const doFinalize = async (): Promise<void> => {
    try {
      const result = await finalize.mutateAsync({ id })
      showToast(`Finalized â€” ${result.adjustments} adjustment${result.adjustments !== 1 ? 's' : ''} applied`)
      setConfirmFinalize(false)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to finalize')
    }
  }

  return (
    <div>
      <button onClick={onBack} style={{ color: theme.muted }} className="flex items-center gap-1.5 text-xs mb-4 hover:opacity-70">
        <ArrowLeft size={13} />
        Back to stocktakes
      </button>

      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2.5">
          <span style={{ ...mono, color: theme.text }} className="text-lg font-semibold">
            {detail.reference}
          </span>
          <span
            style={{
              background: finalized ? theme.greenBg : theme.amberBg,
              color: finalized ? theme.green : theme.amber
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
          >
            {finalized ? <CheckCircle2 size={11} /> : <Clock size={11} />}
            {finalized ? 'Finalized' : 'In progress'}
          </span>
        </div>
        {!finalized && (
          <button
            onClick={() => setConfirmFinalize(true)}
            style={{ background: theme.primary, color: '#fff' }}
            className="px-3.5 py-2 rounded-lg text-sm font-medium"
          >
            Finalize stocktake
          </button>
        )}
      </div>
      <div className="flex items-center gap-4 text-xs mb-4" style={{ color: theme.muted }}>
        <span>{detail.items.length} medicines</span>
        {!finalized && uncounted > 0 && (
          <span style={{ color: theme.amber }} className="flex items-center gap-1">
            <AlertTriangle size={11} />
            {uncounted} uncounted
          </span>
        )}
        {discrepancies > 0 && (
          <span style={{ color: theme.red }}>{discrepancies} discrepanc{discrepancies === 1 ? 'y' : 'ies'}</span>
        )}
      </div>

      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg mb-3 w-72"
        style={{ background: theme.card, border: `1px solid ${theme.border}` }}
      >
        <Search size={13} color={theme.muted} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter medicinesâ€¦"
          style={{ color: theme.text, background: 'transparent' }}
          className="w-full text-sm outline-none placeholder:opacity-50"
        />
      </div>

      <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: theme.muted, borderBottom: `1px solid ${theme.border}` }} className="text-left text-xs uppercase tracking-wide">
              <th className="py-2.5 px-4 font-medium">Medicine</th>
              <th className="py-2.5 px-4 font-medium text-right">System Qty</th>
              <th className="py-2.5 px-4 font-medium text-right">{finalized ? 'Counted Qty' : 'Count (physical)'}</th>
              <th className="py-2.5 px-4 font-medium text-right">Variance</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 px-4 text-center text-sm" style={{ color: theme.muted }}>
                  No medicines found.
                </td>
              </tr>
            ) : (
              items.map((item, idx) => {
                const value = item.id in pending ? pending[item.id] : (item.countedQuantity ?? '').toString()
                const variance = item.countedQuantity != null ? item.countedQuantity - item.systemQuantity : null
                return (
                  <tr key={item.id} style={{ borderTop: idx ? `1px solid ${theme.border}` : 'none' }}>
                    <td className="py-2 px-4" style={{ color: theme.text }}>
                      {item.medicineName}
                    </td>
                    <td className="py-2 px-4 text-right" style={{ ...mono, color: theme.muted }}>
                      {item.systemQuantity}
                    </td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        min={0}
                        disabled={finalized}
                        value={value}
                        onChange={(e) => setPending((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        onBlur={(e) => {
                          if (item.id in pending) saveCount(item.id, e.target.value)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            ;(e.target as HTMLInputElement).blur()
                          }
                        }}
                        placeholder="—"
                        style={{ ...mono, background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
                        className="w-20 ml-auto text-sm rounded px-2 py-1 text-right outline-none disabled:opacity-60"
                      />
                      {savingId === item.id && <Loader2 size={12} className="inline-block ml-2 animate-spin" color={theme.muted} />}
                    </td>
                    <td
                      className="py-2 px-4 text-right"
                      style={{ ...mono, color: variance == null ? theme.muted : variance === 0 ? theme.green : theme.red }}
                    >
                      {variance == null ? '—' : variance > 0 ? `+${variance}` : variance}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {confirmFinalize && (
        <Modal title="Finalize stocktake?" onClose={() => setConfirmFinalize(false)}>
          <p style={{ color: theme.muted }} className="text-sm mb-4">
            This applies stock adjustments for every counted medicine and cannot be undone.
            {uncounted > 0 && ` ${uncounted} medicine${uncounted === 1 ? '' : 's'} still uncounted will be skipped.`}
          </p>
          <button
            onClick={doFinalize}
            disabled={finalize.isPending}
            style={{ background: theme.primary, color: '#fff' }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
          >
            {finalize.isPending && <Loader2 size={14} className="animate-spin" />}
            {finalize.isPending ? 'Finalizingâ€¦' : 'Confirm finalize'}
          </button>
        </Modal>
      )}
    </div>
  )
}

export default function Stocktake(): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)
  const { data: stocktakes = [], isLoading, isError } = useListStocktakes()
  const [showStart, setShowStart] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)

  if (openId !== null) {
    return (
      <div className="p-7">
        <StocktakeDetailView id={openId} onBack={() => setOpenId(null)} />
      </div>
    )
  }

  return (
    <div className="p-7">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 style={{ ...serif, color: theme.text }} className="text-xl font-semibold">
            Stocktake
          </h1>
          <p style={{ color: theme.muted }} className="text-sm mt-0.5">
            Physical count sessions and reconciliation
          </p>
        </div>
        <button
          onClick={() => setShowStart(true)}
          style={{ background: theme.primary, color: '#fff' }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={14} />
          Start stocktake
        </button>
      </div>

      {isLoading ? (
        <p style={{ color: theme.muted }} className="text-sm">
          Loading stocktakesâ€¦
        </p>
      ) : isError ? (
        <p style={{ color: theme.red }} className="text-sm">
          Couldn&apos;t load stocktakes.
        </p>
      ) : stocktakes.length === 0 ? (
        <div
          style={{ background: theme.card, border: `1px dashed ${theme.border}` }}
          className="rounded-2xl p-10 text-center"
        >
          <ClipboardCheck size={22} color={theme.muted} className="mx-auto mb-2" />
          <p style={{ color: theme.muted }} className="text-sm">
            No stocktake sessions yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {stocktakes.map((s) => {
            const finalized = s.status === 'finalized'
            return (
              <button
                key={s.id}
                onClick={() => setOpenId(s.id)}
                style={{ background: theme.card, border: `1px solid ${theme.border}` }}
                className="rounded-2xl p-4 relative overflow-hidden text-left hover:opacity-90"
              >
                <div
                  style={{ background: finalized ? theme.green : theme.amber }}
                  className="absolute top-0 left-0 right-0 h-1"
                />
                <div className="flex items-start justify-between mb-3">
                  <div style={{ ...mono, color: theme.text }} className="text-sm font-semibold">
                    {s.reference}
                  </div>
                  <span
                    style={{
                      background: finalized ? theme.greenBg : theme.amberBg,
                      color: finalized ? theme.green : theme.amber
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                  >
                    {finalized ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                    {finalized ? 'Finalized' : 'In progress'}
                  </span>
                </div>
                {s.notes && (
                  <p style={{ color: theme.muted }} className="text-xs mb-3 line-clamp-2">
                    {s.notes}
                  </p>
                )}
                <div style={{ borderTop: `1px solid ${theme.border}` }} className="pt-3 flex items-center justify-between text-xs">
                  <span style={{ color: theme.muted }} className="flex items-center gap-1">
                    <User size={11} />
                    {s.createdByName ?? 'Unknown'}
                  </span>
                  <span style={{ ...mono, color: theme.muted }}>
                    {new Date(finalized && s.finalizedAt ? s.finalizedAt : s.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {showStart && (
        <StartStocktakeModal
          onClose={() => setShowStart(false)}
          onCreated={(id) => {
            setShowStart(false)
            setOpenId(id)
          }}
        />
      )}
    </div>
  )
}
