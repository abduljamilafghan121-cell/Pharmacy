import type { MouseEvent as ReactMouseEvent, ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Search, Sun, Moon, Minus, X } from 'lucide-react'
import { useUiStore } from '../store/uiStore'
import { getTheme, serif } from '../theme'
import Kbd from './Kbd'
import NotificationBell from './NotificationBell'
import appIcon from '../assets/icon.png'

const dragStyle = { WebkitAppRegion: 'drag' } as React.CSSProperties
const noDragStyle = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

// Windows-style maximize/restore glyphs drawn with CSS so they scale crisply
// and swap instantly with window state.
function MaxIcon({ color }: { color: string }): ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke={color} strokeWidth="1.1" />
    </svg>
  )
}

function RestoreIcon({ color }: { color: string }): ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <rect x="0.5" y="2" width="7.5" height="7.5" fill="none" stroke={color} strokeWidth="1.1" />
      <path
        d="M2.5 2 V0.5 H9.5 V7.5 H8"
        fill="none"
        stroke={color}
        strokeWidth="1.1"
      />
    </svg>
  )
}

export default function TitleBar(): ReactElement {
  const { dark, toggleDark, setPaletteOpen } = useUiStore()
  const theme = getTheme(dark)

  // Reflects the real Electron window state so the maximize/restore button
  // glyph always matches (normal ▯ vs maximized ❐).
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    setMaximized(window.api?.window?.isMaximized?.() ?? false)
    return window.api?.window?.onMaximizedChange?.((m) => setMaximized(m))
  }, [])

  // Double-clicking the draggable title-bar region toggles maximize/restore,
  // matching native Windows behavior. Double-clicks on the window-control
  // buttons are ignored.
  const handleDoubleClick = (e: ReactMouseEvent<HTMLDivElement>): void => {
    const target = e.target as HTMLElement | null
    if (target && target.closest('[data-window-controls]')) return
    window.api?.window?.maximize()
  }

  // Chrome hover states flip between light/dark surfaces.
  const chromeHover = dark ? 'hover:bg-white/10' : 'hover:bg-black/[0.06]'
  const chipBg = dark ? 'rgba(255,255,255,0.05)' : 'rgba(15,31,27,0.04)'
  const chipBorder = dark ? 'rgba(255,255,255,0.07)' : theme.border
  const iconColor = theme.onSidebarMuted

  return (
    <div
      onDoubleClick={handleDoubleClick}
      style={{
        background: theme.sidebar,
        height: 46,
        borderBottom: `1px solid ${theme.sidebarBorder}`,
        ...dragStyle
      }}
      className="flex items-center justify-between pl-4 flex-shrink-0 select-none"
    >
      <div className="flex items-center gap-2.5">
        <img
          src={appIcon}
          alt=""
          draggable={false}
          className="w-5 h-5 rounded-md shadow-sm select-none"
        />
        <span style={{ ...serif, color: theme.onSidebar }} className="text-[13px] font-semibold tracking-tight">
          PharmaCore
        </span>
      </div>

      <button
        onClick={() => setPaletteOpen(true)}
        style={{
          ...noDragStyle,
          background: chipBg,
          border: `1px solid ${chipBorder}`,
          color: theme.onSidebarMuted
        }}
        className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg transition-colors ${chromeHover}`}
      >
        <Search size={12} /> Search or run a command <Kbd>⌘K</Kbd>
      </button>

      <div className="flex items-center gap-2">
        <div style={noDragStyle} className="flex items-center gap-2 pr-2">
          <NotificationBell />
          <button
            onClick={toggleDark}
            title={dark ? 'Light mode' : 'Dark mode'}
            className={`p-1.5 rounded-lg transition-colors ${chromeHover}`}
            style={{ background: chipBg, border: `1px solid ${chipBorder}` }}
          >
            {dark ? <Sun size={13} color={theme.onSidebarMuted} /> : <Moon size={13} color={theme.onSidebarMuted} />}
          </button>
          <span
            className="flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full"
            style={{
              background: dark ? theme.sidebarActive : 'rgba(14,138,100,0.10)',
              color: dark ? '#7BE3BC' : '#0E8A64',
              border: `1px solid ${dark ? 'rgba(47,191,143,0.25)' : 'rgba(14,138,100,0.22)'}`
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full pulse-dot"
              style={{ background: dark ? '#34D399' : '#0E8A64' }}
            />
            Online
          </span>
        </div>

        {/* Window controls — proper desktop chrome controls. Equal width,
            full titlebar height, icons centered, no borders, aligned flush to
            the top-right corner. */}
        <div
          style={noDragStyle}
          className="window-controls ml-1"
          data-window-controls
        >
          <button
            data-window-control
            onClick={() => window.api.window.minimize()}
            className="window-control"
            title="Minimize"
            aria-label="Minimize"
          >
            <Minus size={13} color={iconColor} />
          </button>
          <button
            data-window-control
            onClick={() => window.api.window.maximize()}
            className="window-control"
            title={maximized ? 'Restore' : 'Maximize'}
            aria-label={maximized ? 'Restore' : 'Maximize'}
          >
            {maximized ? <RestoreIcon color={iconColor} /> : <MaxIcon color={iconColor} />}
          </button>
          <button
            data-window-control
            onClick={() => window.api.window.close()}
            className="window-control window-control--close"
            title="Close"
            aria-label="Close"
          >
            <X size={13} color={iconColor} />
          </button>
        </div>
      </div>
    </div>
  )
}
