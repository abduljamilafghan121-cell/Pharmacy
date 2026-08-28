import type { ReactElement } from 'react'
import { useUiStore } from '../store/uiStore'
import { getTheme } from '../theme'
import type { InventoryItem } from '../hooks/useInventory'

export default function Badge({ status }: { status: InventoryItem['status'] }): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)
  const map = {
    ok: { bg: theme.greenBg, fg: theme.green, label: 'In stock' },
    low: { bg: theme.amberBg, fg: theme.amber, label: 'Low stock' },
    expiring: { bg: theme.redBg, fg: theme.red, label: 'Expiring soon' }
  } as const
  const s = map[status]
  return (
    <span
      style={{ background: s.bg, color: s.fg }}
      className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full"
    >
      <span style={{ background: s.fg }} className="w-1.5 h-1.5 rounded-full" />
      {s.label}
    </span>
  )
}
