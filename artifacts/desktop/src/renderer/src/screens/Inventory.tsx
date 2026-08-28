import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { Search, PackageSearch } from 'lucide-react'
import { useUiStore } from '../store/uiStore'
import { getTheme, mono, serif } from '../theme'
import { useInventory } from '../hooks/useInventory'
import Badge from '../components/Badge'

export default function Inventory(): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)
  const { data: inventory = [], isLoading } = useInventory()
  const [query, setQuery] = useState('')

  // Client-side filter across drug name, SKU and batch — instant feedback
  // without waiting on the API round-trip.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return inventory
    return inventory.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.sku.toLowerCase().includes(q) ||
        i.batch.toLowerCase().includes(q)
    )
  }, [inventory, query])

  const counts = useMemo(
    () => ({
      total: inventory.length,
      low: inventory.filter((i) => i.status === 'low').length,
      expiring: inventory.filter((i) => i.status === 'expiring').length
    }),
    [inventory]
  )

  return (
    <div className="p-7 max-w-6xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 style={{ ...serif, color: theme.text }} className="text-xl font-semibold">
            Inventory
          </h1>
          <p style={{ color: theme.muted }} className="text-xs mt-0.5">
            {counts.total} batches tracked ·{' '}
            <span style={{ color: theme.amber }}>{counts.low} low</span> ·{' '}
            <span style={{ color: theme.red }}>{counts.expiring} expiring</span>
          </p>
        </div>
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg w-72 transition-all duration-150 focus-within:border-transparent focus-within:ring-2 focus-within:ring-emerald-500/40"
          style={{
            background: theme.card,
            border: `1px solid ${theme.border}`,
            boxShadow: theme.shadow
          }}
        >
          <Search size={14} color={theme.muted} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search drug, SKU, batch…"
            style={{ color: theme.text, background: 'transparent' }}
            className="flex-1 text-sm outline-none placeholder:opacity-60"
          />
        </div>
      </div>

      <div
        style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.shadow }}
        className="rounded-xl overflow-hidden"
      >
        {isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((n) => (
              <div key={n} style={{ background: theme.hover }} className="h-8 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <PackageSearch size={28} color={theme.muted} strokeWidth={1.6} />
            <p style={{ color: theme.text }} className="text-sm font-medium">
              No matching batches
            </p>
            <p style={{ color: theme.muted }} className="text-xs">
              Try a different drug name, SKU or batch number.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr
                style={{
                  color: theme.muted,
                  borderBottom: `1px solid ${theme.border}`,
                  background: theme.cardAlt
                }}
                className="text-left text-[11px] uppercase tracking-[0.08em]"
              >
                <th className="py-3 px-4 font-medium">Drug</th>
                <th className="py-3 px-4 font-medium">SKU</th>
                <th className="py-3 px-4 font-medium">Batch</th>
                <th className="py-3 px-4 font-medium">Expiry</th>
                <th className="py-3 px-4 font-medium text-right">Qty</th>
                <th className="py-3 px-4 font-medium text-right">Price</th>
                <th className="py-3 px-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id} className="transition-colors hover:bg-[color:var(--row-hover)]" style={{ '--row-hover': theme.hover } as React.CSSProperties}>
                  <td className="py-3 px-4 font-medium" style={{ color: theme.text }}>
                    {i.name}
                  </td>
                  <td className="py-3 px-4" style={{ ...mono, color: theme.muted }}>
                    {i.sku}
                  </td>
                  <td className="py-3 px-4" style={{ ...mono, color: theme.muted }}>
                    {i.batch}
                  </td>
                  <td className="py-3 px-4" style={{ ...mono, color: theme.muted }}>
                    {i.expiry}
                  </td>
                  <td className="py-3 px-4 text-right" style={{ ...mono, color: theme.text }}>
                    {i.qty}
                  </td>
                  <td className="py-3 px-4 text-right" style={{ ...mono, color: theme.text }}>
                    ${i.price.toFixed(2)}
                  </td>
                  <td className="py-3 px-4">
                    <Badge status={i.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
