import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { History, Pill, ShoppingCart, FileText, Users, Truck, Settings as SettingsIcon, RefreshCw, X, Search } from 'lucide-react'
import { useAuditLog } from '../hooks/useExtraQueries'
import { useUiStore } from '../store/uiStore'
import { getTheme, mono, serif } from '../theme'

const ENTITY_TYPES = [
  { value: 'medicine', label: 'Medicine' },
  { value: 'order', label: 'Order' },
  { value: 'prescription', label: 'Prescription' },
  { value: 'purchase_order', label: 'Purchase order' },
  { value: 'user', label: 'User' },
  { value: 'pharmacy_settings', label: 'Pharmacy settings' }
] as const

const ENTITY_ICONS: Record<string, typeof Pill> = {
  medicine: Pill,
  order: ShoppingCart,
  prescription: FileText,
  purchase_order: Truck,
  user: Users,
  pharmacy_settings: SettingsIcon
}

// Mirrors web's SEOUL_ACTION_COLORS — create/verify/receive are success,
// destructive actions are red, etc.
const ACTION_COLORS: Record<string, 'ok' | 'low' | 'expiring'> = {
  create: 'ok',
  verify: 'ok',
  receive: 'ok',
  approve: 'ok',
  login: 'low',
  logout: 'low',
  update: 'ok',
  delete: 'expiring',
  deactivate: 'expiring',
  reject: 'expiring',
  reset_password: 'low',
  finalize: 'ok'
}

function actionKind(action: string): 'ok' | 'low' | 'expiring' {
  const norm = action.toLowerCase()
  if (norm.includes('delete') || norm.includes('deactiv') || norm.includes('reject') || norm.includes('cancel')) return 'expiring'
  if (ACTION_COLORS[norm]) return ACTION_COLORS[norm]
  return 'ok'
}

function ActionBadge({ action, theme }: { action: string; theme: ReturnType<typeof getTheme> }): ReactElement {
  const kind = actionKind(action)
  const bg = kind === 'ok' ? theme.greenBg : kind === 'low' ? theme.amberBg : theme.redBg
  const fg = kind === 'ok' ? theme.green : kind === 'low' ? theme.amber : theme.red
  return (
    <span style={{ background: bg, color: fg }} className="inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize">
      {action.replace(/_/g, ' ')}
    </span>
  )
}

export default function AuditLog(): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)
  const [entityFilter, setEntityFilter] = useState('all')
  const { data, isLoading, isError, refetch } = useAuditLog(entityFilter === 'all' ? undefined : entityFilter)
  const entries = data?.entries ?? []
  const total = data?.total ?? 0

  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entries.filter((e) => {
      if (actionFilter !== 'all' && e.action.toLowerCase() !== actionFilter.toLowerCase()) return false
      const day = e.createdAt?.slice(0, 10)
      if (fromDate && day < fromDate) return false
      if (toDate && day > toDate) return false
      if (q) {
        const haystack = `${e.userName ?? ''} ${e.description ?? ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [entries, search, actionFilter, fromDate, toDate])

  const hasActiveFilters = !!(search || actionFilter !== 'all' || fromDate || toDate)

  const clearClientFilters = (): void => {
    setSearch('')
    setActionFilter('all')
    setFromDate('')
    setToDate('')
  }

  const clearAll = (): void => {
    clearClientFilters()
    setEntityFilter('all')
  }

  return (
    <div className="p-7">
      <div className="flex items-center justify-between mb-1">
        <h1 style={{ ...serif, color: theme.text }} className="text-xl font-semibold flex items-center gap-2">
          <History size={18} color={theme.muted} />
          Audit Log
        </h1>
      </div>
      <p style={{ color: theme.muted }} className="text-sm mb-4">
        A record of sensitive actions — who did what, and when.
      </p>

      <div
        style={{ background: theme.card, border: `1px solid ${theme.border}` }}
        className="rounded-xl p-3 mb-4 flex flex-wrap items-center gap-2"
      >
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg flex-1 min-w-[200px]"
          style={{ background: theme.cardAlt, border: `1px solid ${theme.border}` }}
        >
          <Search size={13} color={theme.muted} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by user or description…"
            style={{ color: theme.text, background: 'transparent' }}
            className="field-inbox w-full text-sm placeholder:opacity-50"
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ color: theme.muted }} className="hover:opacity-70">
              <X size={13} />
            </button>
          )}
        </div>
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
          className="text-sm rounded-lg px-3 py-2 outline-none"
        >
          <option value="all">All entities</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
          className="text-sm rounded-lg px-3 py-2 outline-none"
        >
          <option value="all">All actions</option>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
          <option value="verify">Verify</option>
          <option value="receive">Receive</option>
          <option value="login">Login</option>
          <option value="logout">Logout</option>
          <option value="finalize">Finalize</option>
        </select>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
          className="text-sm rounded-lg px-2.5 py-2 outline-none"
        />
        <span style={{ color: theme.muted }} className="text-xs">
          to
        </span>
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          style={{ background: theme.cardAlt, border: `1px solid ${theme.border}`, color: theme.text }}
          className="text-sm rounded-lg px-2.5 py-2 outline-none"
        />
        {(hasActiveFilters || entityFilter !== 'all') && (
          <button onClick={clearAll} style={{ color: theme.muted }} className="flex items-center gap-1 text-xs px-2 py-1.5 hover:opacity-70">
            <X size={12} /> Clear
          </button>
        )}
        {!isLoading && (
          <span style={{ color: theme.muted }} className="text-xs ml-auto">
            {hasActiveFilters || entityFilter !== 'all' ? `${filteredEntries.length} of ${total} entries` : `${total} entries`}
          </span>
        )}
      </div>

      <div style={{ background: theme.card, border: `1px solid ${theme.border}` }} className="rounded-xl overflow-hidden">
        {isLoading ? (
          <p style={{ color: theme.muted }} className="p-4 text-sm">
            Loading audit log…
          </p>
        ) : isError ? (
          <div className="p-4 text-center">
            <p style={{ color: theme.red }} className="text-sm mb-2">Couldn&apos;t load the audit log.</p>
            <button onClick={() => refetch()} style={{ border: `1px solid ${theme.border}`, color: theme.text }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs">
              <RefreshCw size={12} /> Try again
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
            <div style={{ background: theme.hover, color: theme.muted }} className="w-11 h-11 rounded-lg flex items-center justify-center mb-2.5">
              <History size={20} />
            </div>
            <p style={{ color: theme.text }} className="text-sm font-medium">No audit entries</p>
            <p style={{ color: theme.muted }} className="text-xs mt-0.5">
              Actions across medicines, orders, prescriptions and more will be logged here.
            </p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
            <div style={{ background: theme.hover, color: theme.muted }} className="w-11 h-11 rounded-lg flex items-center justify-center mb-2.5">
              <Search size={20} />
            </div>
            <p style={{ color: theme.text }} className="text-sm font-medium">No matching entries</p>
            <p style={{ color: theme.muted }} className="text-xs mt-0.5">
              Try adjusting your search or filters.
            </p>
            <button
              onClick={clearAll}
              style={{ color: theme.primaryText, background: theme.primarySoft, marginTop: 12 }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
            >
              <X size={14} /> Clear filters
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr
                style={{ color: theme.muted, borderBottom: `1px solid ${theme.border}` }}
                className="text-left text-xs uppercase tracking-wide"
              >
                <th className="py-2.5 px-4 font-medium">When</th>
                <th className="py-2.5 px-4 font-medium">User</th>
                <th className="py-2.5 px-4 font-medium">Action</th>
                <th className="py-2.5 px-4 font-medium">Entity</th>
                <th className="py-2.5 px-4 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((e, idx) => {
                const Icon = ENTITY_ICONS[e.entityType] ?? History
                return (
                  <tr key={e.id} style={{ borderTop: idx ? `1px solid ${theme.border}` : 'none' }}>
                    <td className="py-2.5 px-4" style={{ ...mono, color: theme.muted }}>
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4" style={{ color: theme.text }}>
                      {e.userName ?? 'System'}
                    </td>
                    <td className="py-2.5 px-4">
                      <ActionBadge action={e.action} theme={theme} />
                    </td>
                    <td className="py-2.5 px-4">
                      <span style={{ color: theme.muted }} className="flex items-center gap-1.5">
                        <Icon size={13} />
                        <span className="capitalize">{e.entityType}</span>
                        {e.entityId != null && <span style={mono}>#{e.entityId}</span>}
                      </span>
                    </td>
                    <td className="py-2.5 px-4" style={{ color: theme.muted }}>
                      {e.description}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
