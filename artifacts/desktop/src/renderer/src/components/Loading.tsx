import type { ReactElement, ReactNode } from 'react'
import { getTheme } from '../theme'
import { useUiStore } from '../store/uiStore'

type Size = 'sm' | 'md' | 'lg'

const SPIN_PX: Record<Size, number> = { sm: 14, md: 22, lg: 32 }

/**
 * Reusable, theme-aware loading indicator that matches the PharmaCore visual
 * identity. Two usage modes:
 *  - `centered` (default): fills the available width, stacked spinner + label,
 *    used for full-panel / screen-level loads.
 *  - inline (`centered={false}`): a compact horizontal spinner + label row,
 *    used inside small widgets.
 * The label is optional — omit it for a bare spinner.
 */
export default function Loading({
  label,
  size = 'md',
  centered = true,
  className = ''
}: {
  label?: ReactNode
  size?: Size
  centered?: boolean
  className?: string
}): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)
  const px = SPIN_PX[size]
  const borderW = Math.max(2, Math.round(px / 7))

  if (!centered) {
    return (
      <div style={{ color: theme.muted }} className={`flex items-center gap-2 ${className}`}>
        <span
          aria-hidden
          className="inline-block animate-spin"
          style={{
            width: px,
            height: px,
            border: `${borderW}px solid ${theme.borderStrong}`,
            borderTopColor: theme.primary,
            borderRadius: 999
          }}
        />
        {label != null && <span className="text-sm">{label}</span>}
      </div>
    )
  }

  return (
    <div
      style={{ color: theme.muted }}
      className={`w-full flex flex-col items-center justify-center gap-3 py-12 ${className}`}
    >
      <span
        aria-hidden
        className="inline-block animate-spin"
        style={{
          width: px,
          height: px,
          border: `${borderW}px solid ${theme.borderStrong}`,
          borderTopColor: theme.primary,
          borderRadius: 999
        }}
      />
      {label != null && <span className="text-sm">{label}</span>}
    </div>
  )
}
