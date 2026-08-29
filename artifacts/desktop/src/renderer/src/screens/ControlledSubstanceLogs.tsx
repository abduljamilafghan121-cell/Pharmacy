import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { Lock, Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { useControlledSubstanceLogs } from '../hooks/useExtraQueries'
import { useUiStore } from '../store/uiStore'
import { getTheme, mono, serif } from '../theme'

const SCHEDULES = ['II', 'III', 'IV', 'V'] as const
const PAGE_SIZE = 50

function scheduleStyle(schedule: string, theme: ReturnType<typeof getTheme>): { bg: string; fg: string } {
  switch (schedule) {
    case 'II':
      return { bg: theme.redBg, fg: theme.red }
    case 'III':
      return { bg: theme.amberBg, fg: theme.amber }
    case 'IV':
      return { bg: theme.amberBg, fg: theme.amber }
    default:
      return { bg: theme.primarySoft, fg: theme.primary }
  }
}

export default function ControlledSubstanceLogs(): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)
  const [offset, setOffset] = useState(0)
  const { data: logs = [], isLoading, isError, refetch } = useControlledSubstanceLogs(PAGE_SIZE, offset)
  const [scheduleFilter, setScheduleFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return logs.filter((l) => {
      if (scheduleFilter !== 'all' && l.scheduleAtDispensing !== scheduleFilter) return false
      if (q) {
        const haystack = `${l.medicineName ?? ''} ${l.patientName ?? ''} ${l.dispensedByName ?? ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [logs, scheduleFilter, search])

  return (
    <div className="p-7">
      <div className="flex items-center gap-2.5 mb-1">
        <div
          style={{ background: theme.redBg, color: theme.red }}
          className="w-7 h-7 rounded-lg flex items-center justify-center"
        >
          <Lock size={14} />
        </div>
        <h1 style={{ ...serif, color: theme.text }} className="text-xl font-semibold">
          Controlled Substances
        </h1>
      </div>
      <p style={{ color: theme.muted }} className="text-sm mb-5 ml-[38px]">
        Schedule II–V dispensing log, most recent first
      </p>

      <div className="flex items-center gap-2 mb-3">
        <div className="flex gap-1">
          <button
            onClick={() => setScheduleFilter('all')}
            style={
              scheduleFilter === 'all'
                ? { background: theme.primarySoft, color: theme.primaryText }
                : { background: theme.cardAlt, color: theme.muted, border: `1px solid ${theme.border}` }
            }
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
          >
            All
          </button>
          {SCHEDULES.map((s) => (
            <button
              key={s}
              onClick={() => setScheduleFilter(scheduleFilter === s ? 'all' : s)}
              style={
                scheduleFilter === s
                  ? { background: theme.primarySoft, color: theme.primaryText }
                  : { background: theme.cardAlt, color: theme.muted, border: `1px solid ${theme.border}` }
              }
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
            >
              {s}
            </button>
          ))}
        </div>
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg flex-1 max-w-xs ml-2"
          style={{ background: theme.card, border: `1px solid ${theme.border}` }}
        >
          <Search size={13} color={theme.muted} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search medicine, patient, staff…"
            style={{ color: theme.text, background: 'transparent' }}
            className="field-inbox w-full text-sm placeholder:opacity-50"
          />
        </div>
        {!isLoading && (
          <span style={{ color: theme.muted }} className="text-xs ml-auto">
            {filtered.length} entries
          </span>
        )}
      </div>

      <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-xl overflow-hidden">
        {isLoading ? (
          <p style={{ color: theme.muted }} className="p-4 text-sm">
            Loading dispensing log…
          </p>
        ) : isError ? (
          <div className="p-4 text-center">
            <p style={{ color: theme.red }} className="text-sm mb-2">Couldn&apos;t load the controlled substance log.</p>
            <button onClick={() => refetch()} style={{ border: `1px solid ${theme.border}`, color: theme.text }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs">
              <RefreshCw size={12} /> Try again
            </button>
          </div>
        ) : logs.length === 0 ? (
          <p style={{ color: theme.muted }} className="p-4 text-sm">
            No controlled substance dispensing events recorded yet.
          </p>
        ) : filtered.length === 0 ? (
          <p style={{ color: theme.muted }} className="p-4 text-sm">
            No entries match your filters.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr
                style={{ color: theme.muted, borderBottom: `1px solid ${theme.border}` }}
                className="text-left text-xs uppercase tracking-wide"
              >
                <th className="py-2.5 px-4 font-medium">Schedule</th>
                <th className="py-2.5 px-4 font-medium">Medicine</th>
                <th className="py-2.5 px-4 font-medium">Qty</th>
                <th className="py-2.5 px-4 font-medium">Patient</th>
                <th className="py-2.5 px-4 font-medium">Rx #</th>
                <th className="py-2.5 px-4 font-medium">Order #</th>
                <th className="py-2.5 px-4 font-medium">Dispensed By</th>
                <th className="py-2.5 px-4 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l, idx) => {
                const style = scheduleStyle(l.scheduleAtDispensing, theme)
                return (
                  <tr key={l.id} style={{ borderTop: idx ? `1px solid ${theme.border}` : 'none' }}>
                    <td className="py-2.5 px-4">
                      <span
                        style={{ background: style.bg, color: style.fg }}
                        className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
                      >
                        Schedule {l.scheduleAtDispensing}
                      </span>
                    </td>
                    <td className="py-2.5 px-4" style={{ color: theme.text }}>
                      {l.medicineName ?? `#${l.medicineId}`}
                    </td>
                    <td className="py-2.5 px-4" style={{ ...mono, color: theme.text }}>
                      {l.quantityDispensed}
                    </td>
                    <td className="py-2.5 px-4" style={{ color: theme.muted }}>
                      {l.patientName ?? '—'}
                      {l.patientId != null && <span className="text-xs"> #{l.patientId}</span>}
                    </td>
                    <td className="py-2.5 px-4" style={{ ...mono, color: theme.muted }}>
                      {l.prescriptionId ? `#${l.prescriptionId}` : '—'}
                    </td>
                    <td className="py-2.5 px-4" style={{ ...mono, color: theme.muted }}>
                      {l.orderId ? `#${l.orderId}` : '—'}
                    </td>
                    <td className="py-2.5 px-4" style={{ color: theme.muted }}>
                      {l.dispensedByName ?? '—'}
                    </td>
                    <td className="py-2.5 px-4" style={{ ...mono, color: theme.muted }}>
                      {new Date(l.createdAt).toLocaleString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {!isLoading && logs.length > 0 && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            disabled={offset === 0}
            style={{ border: `1px solid ${theme.border}`, color: theme.text }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40"
          >
            <ChevronLeft size={14} /> Previous
          </button>
          <span style={{ color: theme.muted }} className="text-xs">
            Showing {offset + 1}–{offset + logs.length}
          </span>
          <button
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
            disabled={logs.length < PAGE_SIZE}
            style={{ border: `1px solid ${theme.border}`, color: theme.text }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40"
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
