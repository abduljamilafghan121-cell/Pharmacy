import type { ReactElement, ReactNode } from 'react'
import { X } from 'lucide-react'
import { useUiStore } from '../store/uiStore'
import { getTheme } from '../theme'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  width?: number
}

export default function Modal({ title, onClose, children, width = 440 }: Props): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)

  return (
    <div
      onClick={onClose}
      style={{ background: theme.glassOverlay, backdropFilter: 'blur(6px)' }}
      className="absolute inset-0 flex items-start justify-center pt-24 z-50 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.card,
          border: `1px solid ${theme.borderStrong}`,
          boxShadow: theme.shadowLg,
          width
        }}
        className="rounded-2xl overflow-hidden max-h-[75vh] flex flex-col animate-scale-in"
      >
        <div
          style={{ borderBottom: `1px solid ${theme.border}` }}
          className="flex items-center justify-between px-5 py-4 shrink-0"
        >
          <h2 style={{ color: theme.text }} className="text-sm font-semibold tracking-tight">
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{ color: theme.muted, background: theme.hover }}
            className="p-1 rounded-md transition-colors hover:opacity-80"
          >
            <X size={14} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
