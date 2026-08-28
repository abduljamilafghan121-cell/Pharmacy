import type { ReactElement } from 'react'
import { Search, Sun, Moon, Minus, Square, X } from 'lucide-react'
import { useUiStore } from '../store/uiStore'
import { getTheme, serif } from '../theme'
import Kbd from './Kbd'
import NotificationBell from './NotificationBell'
import appIcon from '../assets/icon.png'

const dragStyle = { WebkitAppRegion: 'drag' } as React.CSSProperties
const noDragStyle = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

export default function TitleBar(): ReactElement {
  const { dark, toggleDark, setPaletteOpen } = useUiStore()
  const theme = getTheme(dark)

  // Chrome hover states can't be one static Tailwind class — the chrome
  // flips between light and dark surfaces, so derive it from the mode.
  const chromeHover = dark ? 'hover:bg-white/10' : 'hover:bg-black/[0.06]'
  const chipBg = dark ? 'rgba(255,255,255,0.05)' : 'rgba(15,31,27,0.04)'
  const chipBorder = dark ? 'rgba(255,255,255,0.07)' : theme.border

  return (
    <div
      style={{
        background: theme.sidebar,
        height: 44,
        borderBottom: `1px solid ${theme.sidebarBorder}`,
        ...dragStyle
      }}
      className="flex items-center justify-between pl-4 pr-2 flex-shrink-0 select-none"
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

      <div style={noDragStyle} className="flex items-center gap-2">
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
        <div className="flex items-center ml-1">
          <button onClick={() => window.api.window.minimize()} className={`p-1.5 rounded-md transition-colors ${chromeHover}`}>
            <Minus size={13} color={theme.onSidebarMuted} />
          </button>
          <button onClick={() => window.api.window.maximize()} className={`p-1.5 rounded-md transition-colors ${chromeHover}`}>
            <Square size={11} color={theme.onSidebarMuted} />
          </button>
          <button onClick={() => window.api.window.close()} className="p-1.5 rounded-md transition-colors hover:bg-red-500/90 group">
            <X size={13} color={theme.onSidebarMuted} className="group-hover:text-white transition-colors" />
          </button>
        </div>
      </div>
    </div>
  )
}
