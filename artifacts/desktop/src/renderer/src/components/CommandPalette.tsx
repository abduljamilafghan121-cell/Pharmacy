import type { ReactElement } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, LayoutDashboard, Package, ShoppingCart, Settings, Cog, Sun, Moon, DollarSign, Receipt, Pill, Users, Truck, FileText, ClipboardList, BookOpen, UserCog, Undo2, ShieldCheck, FileCheck, History, BarChart3, ClipboardCheck, Zap, Lock, CornerDownLeft } from 'lucide-react'
import { useUiStore, canAccessScreen, type Screen } from '../store/uiStore'
import { getTheme } from '../theme'
import { useAuth } from '../hooks/useAuth'
import Kbd from './Kbd'

export default function CommandPalette(): ReactElement | null {
  const { paletteOpen, setPaletteOpen, setScreen, dark, toggleDark } = useUiStore()
  const theme = getTheme(dark)
  const { user } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)

  useEffect(() => {
    if (paletteOpen) {
      setQuery('')
      setCursor(0)
      inputRef.current?.focus()
    }
  }, [paletteOpen])

  const actions = useMemo(
    () => [
      { label: 'Go to Dashboard', icon: LayoutDashboard, screen: 'dashboard' as Screen, run: () => setScreen('dashboard') },
      { label: 'Start new sale', icon: ShoppingCart, screen: 'new-sale' as Screen, run: () => setScreen('new-sale') },
      { label: 'Go to Sales', icon: Receipt, screen: 'sales' as Screen, run: () => setScreen('sales') },
      { label: 'Go to Inventory', icon: Package, screen: 'inventory' as Screen, run: () => setScreen('inventory') },
      { label: 'Go to Medicines', icon: Pill, screen: 'medicines' as Screen, run: () => setScreen('medicines') },
      { label: 'Go to Prescriptions', icon: FileText, screen: 'prescriptions' as Screen, run: () => setScreen('prescriptions') },
      { label: 'Go to Patients', icon: Users, screen: 'patients' as Screen, run: () => setScreen('patients') },
      { label: 'Go to Suppliers', icon: Truck, screen: 'suppliers' as Screen, run: () => setScreen('suppliers') },
      { label: 'Go to Purchase Orders', icon: ClipboardList, screen: 'purchase-orders' as Screen, run: () => setScreen('purchase-orders') },
      { label: 'Go to Supplier Ledger', icon: BookOpen, screen: 'supplier-ledger' as Screen, run: () => setScreen('supplier-ledger') },
      { label: 'Go to Supplier Returns', icon: Undo2, screen: 'supplier-returns' as Screen, run: () => setScreen('supplier-returns') },
      { label: 'Go to Insurance Claims', icon: ShieldCheck, screen: 'insurance-claims' as Screen, run: () => setScreen('insurance-claims') },
      { label: 'Go to Pre-Authorizations', icon: FileCheck, screen: 'pre-authorizations' as Screen, run: () => setScreen('pre-authorizations') },
      { label: 'Cash register', icon: DollarSign, screen: 'cash-register' as Screen, run: () => setScreen('cash-register') },
      { label: 'Go to Reports', icon: BarChart3, screen: 'reports' as Screen, run: () => setScreen('reports') },
      { label: 'Go to Stocktake', icon: ClipboardCheck, screen: 'stocktake' as Screen, run: () => setScreen('stocktake') },
      { label: 'Go to Drug Interactions', icon: Zap, screen: 'drug-interactions' as Screen, run: () => setScreen('drug-interactions') },
      { label: 'Go to Controlled Substances', icon: Lock, screen: 'controlled-substances' as Screen, run: () => setScreen('controlled-substances') },
      { label: 'Go to Audit Log', icon: History, screen: 'audit-log' as Screen, run: () => setScreen('audit-log') },
      { label: 'Go to User Management', icon: UserCog, screen: 'users' as Screen, run: () => setScreen('users') },
      { label: 'Hardware settings', icon: Settings, screen: 'hardware' as Screen, run: () => setScreen('hardware') },
      { label: 'Open Settings', icon: Cog, screen: 'settings' as Screen, run: () => setScreen('settings') },
      {
        label: dark ? 'Switch to light mode' : 'Switch to dark mode',
        icon: dark ? Sun : Moon,
        screen: null,
        run: toggleDark
      }
      // Same gate as the sidebar and the AuthedApp redirect — one map.
    ].filter((a) => a.screen === null || canAccessScreen(a.screen, user?.role)),
    [dark, setScreen, toggleDark, user?.role]
  )

  if (!paletteOpen) return null

  const filtered = actions.filter((a) => a.label.toLowerCase().includes(query.trim().toLowerCase()))
  const activeIndex = Math.min(cursor, Math.max(filtered.length - 1, 0))

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => (filtered.length ? (c + 1) % filtered.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => (filtered.length ? (c - 1 + filtered.length) % filtered.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const action = filtered[activeIndex]
      if (action) {
        action.run()
        setPaletteOpen(false)
      }
    }
  }

  return (
    <div
      onClick={() => setPaletteOpen(false)}
      style={{ background: theme.glassOverlay, backdropFilter: 'blur(6px)' }}
      className="absolute inset-0 flex items-start justify-center pt-[16vh] z-50 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        style={{
          background: theme.card,
          border: `1px solid ${theme.borderStrong}`,
          boxShadow: theme.shadowLg,
          borderRadius: 14
        }}
        className="w-[480px] overflow-hidden animate-scale-in"
      >
        <div className="flex items-center gap-2.5 px-4 py-3.5" style={{ borderBottom: `1px solid ${theme.border}` }}>
          <Search size={15} color={theme.muted} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setCursor(0)
            }}
            placeholder="Type a command or search…"
            style={{ color: theme.text, background: 'transparent' }}
            className="field-inbox flex-1 text-sm"
          />
          <Kbd>ESC</Kbd>
        </div>
        <div className="p-1.5 max-h-80 overflow-y-auto">
          {filtered.length === 0 && (
            <p style={{ color: theme.muted }} className="text-sm px-3 py-6 text-center">
              No matching commands.
            </p>
          )}
          {filtered.map((a, idx) => (
            <button
              key={a.label}
              onMouseEnter={() => setCursor(idx)}
              onClick={() => {
                a.run()
                setPaletteOpen(false)
              }}
              style={{
                background: idx === activeIndex ? theme.primarySoft : 'transparent',
                color: theme.text
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left"
            >
              <span
                style={{
                  background: idx === activeIndex ? theme.sidebarActive : theme.hover,
                  color: idx === activeIndex ? theme.primaryText : theme.muted
                }}
                className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
              >
                <a.icon size={13} />
              </span>
              <span className="flex-1">{a.label}</span>
              {idx === activeIndex && (
                <span style={{ color: theme.muted }} className="flex items-center gap-1 opacity-80">
                  <CornerDownLeft size={11} />
                  <Kbd>↵</Kbd>
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
