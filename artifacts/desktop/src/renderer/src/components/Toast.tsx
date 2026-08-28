import type { ReactElement } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { useUiStore } from '../store/uiStore'
import { getTheme } from '../theme'

export default function Toast(): ReactElement | null {
  const { toast, dark } = useUiStore()
  const theme = getTheme(dark)
  if (!toast) return null
  return (
    <div
      style={{
        background: theme.card,
        border: `1px solid ${theme.borderStrong}`,
        color: theme.text,
        boxShadow: theme.shadowLg
      }}
      className="absolute bottom-5 right-5 flex items-center gap-3 px-4 py-3 rounded-xl text-sm z-50 animate-toast-in"
    >
      <span style={{ background: theme.greenBg, color: theme.green }} className="p-1 rounded-full shrink-0">
        <CheckCircle2 size={14} />
      </span>
      <span className="font-medium">{toast}</span>
    </div>
  )
}
