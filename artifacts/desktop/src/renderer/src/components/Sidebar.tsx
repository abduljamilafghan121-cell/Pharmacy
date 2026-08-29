import type { ReactElement } from 'react'
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  DollarSign,
  Settings,
  LogOut,
  Receipt,
  Pill,
  Users,
  Truck,
  FileText,
  ClipboardList,
  BookOpen,
  UserCog,
  Undo2,
  ShieldCheck,
  FileCheck,
  History,
  BarChart3,
  ClipboardCheck,
  Zap,
  Lock,
  Wrench
} from 'lucide-react'
import { useUiStore, canAccessScreen, type Screen } from '../store/uiStore'
import { getTheme } from '../theme'
import { useAuth } from '../hooks/useAuth'

interface NavItem {
  key: Screen
  label: string
  icon: typeof LayoutDashboard
}

const SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [{ key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }]
  },
  {
    label: 'Sales',
    items: [
      { key: 'new-sale', label: 'New Sale', icon: ShoppingCart },
      { key: 'sales', label: 'Sales', icon: Receipt },
      { key: 'cash-register', label: 'Cash Register', icon: DollarSign }
    ]
  },
  {
    label: 'Catalog',
    items: [
      { key: 'inventory', label: 'Inventory', icon: Package },
      { key: 'medicines', label: 'Medicines', icon: Pill },
      { key: 'prescriptions', label: 'Prescriptions', icon: FileText },
      { key: 'patients', label: 'Patients', icon: Users }
    ]
  },
  {
    label: 'Suppliers',
    items: [
      { key: 'suppliers', label: 'Suppliers', icon: Truck },
      { key: 'purchase-orders', label: 'Purchase Orders', icon: ClipboardList },
      { key: 'supplier-ledger', label: 'Supplier Ledger', icon: BookOpen },
      { key: 'supplier-returns', label: 'Supplier Returns', icon: Undo2 }
    ]
  },
  {
    label: 'Insurance',
    items: [
      { key: 'insurance-claims', label: 'Insurance Claims', icon: ShieldCheck },
      { key: 'pre-authorizations', label: 'Pre-Authorizations', icon: FileCheck }
    ]
  },
  {
    label: 'Compliance',
    items: [
      { key: 'stocktake', label: 'Stocktake', icon: ClipboardCheck },
      { key: 'drug-interactions', label: 'Drug Interactions', icon: Zap },
      { key: 'controlled-substances', label: 'Controlled Substances', icon: Lock },
      { key: 'audit-log', label: 'Audit Log', icon: History }
    ]
  },
  {
    label: 'Admin',
    items: [
      { key: 'reports', label: 'Reports', icon: BarChart3 },
      { key: 'users', label: 'User Management', icon: UserCog },
      { key: 'hardware', label: 'Hardware', icon: Wrench }
    ]
  }
]

export default function Sidebar(): ReactElement {
  const { screen, setScreen, dark } = useUiStore()
  const theme = getTheme(dark)
  const { user, logout } = useAuth()

  const initial = user?.name?.trim()?.[0]?.toUpperCase() ?? '?'
  const chromeHover = dark ? 'hover:bg-white/[0.055]' : 'hover:bg-black/[0.045]'
  const role = user?.role

  // Same source of truth as the AuthedApp redirect — items the role can't
  // open are hidden outright, and sections left with no visible items
  // disappear too (e.g. Compliance for a cashier).
  const visibleSections = SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((n) => canAccessScreen(n.key, role))
  })).filter((section) => section.items.length > 0)

  return (
    <div
      style={{
        background: theme.sidebar,
        width: 224,
        borderRight: `1px solid ${theme.sidebarBorder}`
      }}
      className="flex-shrink-0 flex flex-col h-full min-h-0"
    >
      <div
        className="sidebar-scroll flex-1 min-h-0 overflow-y-auto px-2.5 pt-4 pb-2"
        style={{ '--scroll-thumb': dark ? 'rgba(255,255,255,0.14)' : 'rgba(15,31,27,0.18)' } as React.CSSProperties}
      >
        {visibleSections.map((section) => (
          <div key={section.label} className="mb-3.5">
            <div
              style={{ color: dark ? theme.onSidebarMuted : '#8A9992' }}
              className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
            >
              {section.label}
            </div>
            <div className="space-y-[1px]">
              {section.items.map((n) => {
                const active = screen === n.key
                return (
                  <button
                    key={n.key}
                    onClick={() => setScreen(n.key)}
                    style={
                      active
                        ? {
                            background: `linear-gradient(90deg, ${theme.sidebarActive}, transparent 130%)`,
                            color: dark ? theme.onSidebar : theme.primaryText,
                            boxShadow: `inset 0 0 0 1px ${dark ? 'rgba(47,191,143,0.18)' : 'rgba(14,138,100,0.16)'}`
                          }
                        : { color: theme.onSidebarMuted }
                    }
                    className={`group w-full flex items-center gap-2.5 pl-3 pr-3 py-[7px] rounded-lg text-[13px] font-medium relative transition-colors ${chromeHover}`}
                  >
                    {active && (
                      <span
                        style={{
                          background: 'linear-gradient(180deg, #4AE3AF, #149E74)',
                          boxShadow: `0 0 8px ${dark ? 'rgba(74,227,175,0.55)' : 'rgba(20,158,116,0.35)'}`
                        }}
                        className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full"
                      />
                    )}
                    <n.icon
                      size={15}
                      className="shrink-0 transition-transform group-hover:scale-110"
                      strokeWidth={active ? 2.2 : 1.9}
                      color={active ? (dark ? '#7BE3BC' : theme.primaryText) : undefined}
                    />
                    <span className="truncate">{n.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      {/* Pinned Settings link — mirrors web's AppLayout footer placement */}
      <div className="shrink-0 px-2.5 pb-1">
        <button
          onClick={() => setScreen('settings')}
          style={
            screen === 'settings'
              ? {
                  background: `linear-gradient(90deg, ${theme.sidebarActive}, transparent 130%)`,
                  color: dark ? theme.onSidebar : theme.primaryText,
                  boxShadow: `inset 0 0 0 1px ${dark ? 'rgba(47,191,143,0.18)' : 'rgba(14,138,100,0.16)'}`
                }
              : { color: theme.onSidebarMuted }
          }
          className={`w-full flex items-center gap-2.5 pl-3 pr-3 py-[7px] rounded-lg text-[13px] font-medium transition-colors ${chromeHover}`}
        >
          <Settings size={15} strokeWidth={screen === 'settings' ? 2.2 : 1.9} color={screen === 'settings' ? (dark ? '#7BE3BC' : theme.primaryText) : undefined} />
          <span className="truncate">Settings</span>
        </button>
      </div>
      <div
        style={{ borderTop: `1px solid ${theme.sidebarBorder}` }}
        className="shrink-0 pt-3 pb-3 px-3 flex items-center gap-2.5"
      >
        <div className="relative shrink-0">
          <div
            style={{ background: 'linear-gradient(135deg, #34D399, #0B6B4F)' }}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
          >
            {initial}
          </div>
          <span
            className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-400"
            style={{ boxShadow: `0 0 0 2px ${theme.sidebar}` }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div style={{ color: theme.onSidebar }} className="text-xs font-medium truncate">
            {user?.name ?? 'Unknown'}
          </div>
          <div style={{ color: theme.onSidebarMuted }} className="text-[10px] capitalize">
            {user?.role ?? ''}
          </div>
        </div>
        <button
          onClick={logout}
          title="Sign out"
          className={`p-1.5 rounded-lg transition-colors ${chromeHover}`}
        >
          <LogOut size={13} color={theme.onSidebarMuted} />
        </button>
      </div>
    </div>
  )
}
