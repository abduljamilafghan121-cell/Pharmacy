import type { ReactElement } from 'react'
import { useState } from 'react'
import { Lock, Unlock, Clock, CheckCircle2, AlertTriangle, DollarSign } from 'lucide-react'
import { useUiStore } from '../store/uiStore'
import { getTheme, mono } from '../theme'
import { usePharmacySettings, formatCurrency } from '../hooks/usePharmacySettings'
import {
  useCurrentCashShift,
  useCashShiftHistory,
  useOpenCashShift,
  useCloseCashShift
} from '../hooks/useCashShifts'

export default function CashRegister(): ReactElement {
  const { dark, showToast } = useUiStore()
  const theme = getTheme(dark)
  const { data: settings } = usePharmacySettings()

  const { data: currentShift, isLoading } = useCurrentCashShift()
  const { data: history } = useCashShiftHistory()
  const openShift = useOpenCashShift()
  const closeShift = useCloseCashShift()

  const [openingFloat, setOpeningFloat] = useState('')
  const [closingCash, setClosingCash] = useState('')
  const [manualCashOut, setManualCashOut] = useState('')
  const [notes, setNotes] = useState('')
  const [closeResult, setCloseResult] = useState<any>(null)

  const handleOpen = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    try {
      await openShift.mutateAsync({ openingFloat: parseFloat(openingFloat) || 0 })
      showToast('Register opened')
      setOpeningFloat('')
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't open register")
    }
  }

  const handleClose = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!currentShift) return
    try {
      const result = await closeShift.mutateAsync({
        id: currentShift.id,
        closingCountedCash: parseFloat(closingCash) || 0,
        manualCashOut: parseFloat(manualCashOut) || 0,
        notes: notes.trim() || undefined
      })
      setCloseResult(result)
      setClosingCash('')
      setManualCashOut('')
      setNotes('')
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't close register")
    }
  }

  const cardStyle = { background: theme.card, border: `1px solid ${theme.border}` }

  return (
    <div className="p-6 max-w-3xl mx-auto flex flex-col gap-5">
      <div>
        <h1 style={{ color: theme.text }} className="text-lg font-medium">
          Cash Register
        </h1>
        <p style={{ color: theme.muted }} className="text-sm">
          Open the till at the start of your shift, close and reconcile at the end.
        </p>
      </div>

      {isLoading ? (
        <div style={{ color: theme.muted }} className="text-sm">
          Loading…
        </div>
      ) : closeResult ? (
        /* ── Reconciliation summary (mirrors web's closeResult card) ── */
        <div style={cardStyle} className="rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            {Math.abs(parseFloat(closeResult.variance ?? '0')) < 0.01 ? (
              <span style={{ background: theme.greenBg, color: theme.green }} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full">
                <CheckCircle2 size={11} /> Balanced
              </span>
            ) : (
              <span style={{ background: theme.redBg, color: theme.red }} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full">
                <AlertTriangle size={11} /> Variance
              </span>
            )}
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span style={{ color: theme.muted }} className="text-sm">Expected cash</span>
              <span style={{ ...mono, color: theme.text }} className="text-sm font-medium">
                {formatCurrency(parseFloat(closeResult.expectedCash ?? '0'), settings)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span style={{ color: theme.muted }} className="text-sm">Counted cash in drawer</span>
              <span style={{ ...mono, color: theme.text }} className="text-sm font-medium">
                {formatCurrency(parseFloat(closeResult.closingCountedCash ?? '0'), settings)}
              </span>
            </div>
            <div className={`flex justify-between items-center pt-2 border-t ${Math.abs(parseFloat(closeResult.variance ?? '0')) < 0.01 ? 'border-green-500/30' : 'border-red-500/30'}`}>
              <span style={{ color: theme.muted }} className="text-sm font-medium">Variance</span>
              <span style={{ ...mono, color: Math.abs(parseFloat(closeResult.variance ?? '0')) < 0.01 ? theme.green : theme.red }} className="text-lg font-bold">
                {parseFloat(closeResult.variance ?? '0') > 0 ? '+' : ''}{formatCurrency(parseFloat(closeResult.variance ?? '0'), settings)}
              </span>
            </div>
          </div>
          {closeResult.notes && (
            <div className="mt-2">
              <span style={{ color: theme.muted }} className="text-xs block mb-1">Notes</span>
              <div style={{ background: theme.hover, color: theme.text }} className="rounded-lg p-3 text-sm">
                {closeResult.notes}
              </div>
            </div>
          )}
          <button
            onClick={() => setCloseResult(null)}
            style={{ border: `1px solid ${theme.borderStrong}`, color: theme.text }}
            className="self-start rounded-lg px-4 py-2 text-sm font-medium mt-2"
          >
            Done
          </button>
        </div>
      ) : currentShift ? (
        /* ── Open shift — close form ── */
        <div style={cardStyle} className="rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span style={{ background: theme.greenBg, color: theme.green }} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full">
                <Unlock size={11} /> Open
              </span>
              <span style={{ color: theme.muted }} className="text-xs flex items-center gap-1">
                <Clock size={11} /> since{' '}
                {new Date(currentShift.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="text-right">
              <div style={{ color: theme.muted }} className="text-xs">
                Opening float
              </div>
              <div style={{ ...mono, color: theme.text }} className="text-sm font-medium">
                {formatCurrency(parseFloat(currentShift.openingFloat), settings)}
              </div>
            </div>
          </div>

          <form onSubmit={handleClose} className="flex flex-col gap-3 pt-3" style={{ borderTop: `1px solid ${theme.border}` }}>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span style={{ color: theme.muted }} className="text-xs">Counted cash in drawer *</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={closingCash}
                  onChange={(e) => setClosingCash(e.target.value)}
                  placeholder="0.00"
                  style={{ ...mono, color: theme.text, background: theme.cardAlt, border: `1px solid ${theme.border}` }}
                  className="rounded-lg px-3 py-1.5 outline-none text-sm"
                  required
                />
              </label>
              <label className="flex flex-col gap-1">
                <span style={{ color: theme.muted }} className="text-xs">Cash given out during shift (refunds, etc. — optional)</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={manualCashOut}
                  onChange={(e) => setManualCashOut(e.target.value)}
                  placeholder="0.00"
                  style={{ ...mono, color: theme.text, background: theme.cardAlt, border: `1px solid ${theme.border}` }}
                  className="rounded-lg px-3 py-1.5 outline-none text-sm"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span style={{ color: theme.muted }} className="text-xs">Notes (optional) — any discrepancy explanation</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                style={{ color: theme.text, background: theme.cardAlt, border: `1px solid ${theme.border}` }}
                className="rounded-lg px-3 py-1.5 outline-none text-sm resize-none"
              />
            </label>
            <button
              type="submit"
              disabled={closeShift.isPending}
              style={{ background: theme.red, opacity: closeShift.isPending ? 0.6 : 1 }}
              className="self-start rounded-lg px-4 py-2 text-white text-sm font-medium flex items-center gap-2"
            >
              <Lock size={14} /> {closeShift.isPending ? 'Closing…' : 'Close register'}
            </button>
          </form>
        </div>
      ) : (
        /* ── Closed — open form ── */
        <div style={cardStyle} className="rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span style={{ background: theme.redBg, color: theme.red }} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full">
              <Lock size={11} /> Closed
            </span>
          </div>
          <form onSubmit={handleOpen} className="flex items-end gap-3">
            <label className="flex flex-col gap-1 flex-1">
              <span style={{ color: theme.muted }} className="text-xs">Opening cash float *</span>
              <div
                style={{ background: theme.cardAlt, border: `1px solid ${theme.border}` }}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5"
              >
                <DollarSign size={13} color={theme.muted} />
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={openingFloat}
                  onChange={(e) => setOpeningFloat(e.target.value)}
                  placeholder="e.g. 100.00"
                  style={{ ...mono, color: theme.text, background: 'transparent' }}
                  className="flex-1 outline-none text-sm"
                  required
                />
              </div>
            </label>
            <button
              type="submit"
              disabled={openShift.isPending}
              style={{ background: theme.primary, opacity: openShift.isPending ? 0.6 : 1 }}
              className="rounded-lg px-4 py-2 text-white text-sm font-medium flex items-center gap-2"
            >
              <Unlock size={14} /> {openShift.isPending ? 'Opening…' : 'Open register'}
            </button>
          </form>
        </div>
      )}

      {/* ── Shift history ── */}
      {history && history.length > 0 && (
        <div style={cardStyle} className="rounded-xl overflow-hidden">
          <div style={{ borderBottom: `1px solid ${theme.border}` }} className="px-4 py-3">
            <h2 style={{ color: theme.text }} className="text-sm font-medium flex items-center gap-2">
              <Clock size={13} /> Recent shifts
            </h2>
          </div>
          <div className="divide-y" style={{ borderColor: theme.border }}>
            {history.slice(0, 10).map((shift) => {
              const variance = shift.variance != null ? parseFloat(shift.variance) : null
              const isBalanced = variance != null && Math.abs(variance) < 0.01
              return (
                <div key={shift.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <p style={{ color: theme.text }} className="font-medium">{shift.openedByName ?? '—'}</p>
                    <p style={{ color: theme.muted }} className="text-xs">
                      {new Date(shift.openedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {shift.status === 'closed' && variance != null && (
                      <span style={{ color: isBalanced ? theme.green : theme.red }} className="flex items-center gap-1">
                        {isBalanced ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                        <span style={mono} className="text-xs font-medium">
                          {variance > 0 ? '+' : ''}{formatCurrency(variance, settings)}
                        </span>
                      </span>
                    )}
                    <span
                      style={
                        shift.status === 'open'
                          ? { background: theme.greenBg, color: theme.green }
                          : { background: theme.cardAlt, color: theme.muted }
                      }
                      className="text-xs px-2 py-0.5 rounded-full capitalize"
                    >
                      {shift.status}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
