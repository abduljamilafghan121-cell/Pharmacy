import type { ReactElement } from 'react'
import { ArrowUp, ArrowDown } from 'lucide-react'
import { useUiStore } from '../store/uiStore'
import { getTheme, mono } from '../theme'

interface Props {
  label: string
  value: string
  trend?: string
  trendUp?: boolean
  tone?: string
}

export default function StatCard({ label, value, trend, trendUp, tone }: Props): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)
  return (
    <div
      style={{
        background: theme.card,
        border: `1px solid ${theme.border}`,
        boxShadow: theme.shadow
      }}
      className="card-lift hover:border-emerald-500/25 rounded-xl p-4 flex-1 relative overflow-hidden"
    >
      <div
        aria-hidden
        style={{
          background:
            'linear-gradient(135deg, rgba(47,191,143,0.10) 0%, transparent 55%)'
        }}
        className="absolute inset-0 pointer-events-none"
      />
      <div style={{ color: theme.muted }} className="text-[11px] font-medium uppercase tracking-[0.08em] mb-2.5 relative">
        {label}
      </div>
      <div className="flex items-end justify-between relative">
        <div style={{ ...mono, color: tone ?? theme.text }} className="text-[26px] font-bold leading-none tracking-tight">
          {value}
        </div>
        {trend && (
          <div
            className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full"
            style={{
              color: trendUp ? theme.green : theme.red,
              background: trendUp ? theme.greenBg : theme.redBg
            }}
          >
            {trendUp ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
            {trend}
          </div>
        )}
      </div>
    </div>
  )
}
