import type { ReactNode, ReactElement } from 'react'
import { useUiStore } from '../store/uiStore'
import { getTheme, mono } from '../theme'

// Context-neutral so it reads on cards, canvas and the dark title bar alike.
export default function Kbd({ children }: { children: ReactNode }): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)
  return (
    <span
      style={{
        ...mono,
        background: theme.hover,
        border: `1px solid ${theme.borderStrong}`,
        color: theme.muted,
        boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.18)'
      }}
      className="text-[10px] px-1.5 py-[1px] rounded-md"
    >
      {children}
    </span>
  )
}
