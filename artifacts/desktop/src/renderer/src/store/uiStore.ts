import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Screen =
  | 'dashboard'
  | 'inventory'
  | 'new-sale'
  | 'sales'
  | 'medicines'
  | 'patients'
  | 'suppliers'
  | 'prescriptions'
  | 'purchase-orders'
  | 'supplier-ledger'
  | 'supplier-returns'
  | 'insurance-claims'
  | 'pre-authorizations'
  | 'audit-log'
  | 'reports'
  | 'stocktake'
  | 'drug-interactions'
  | 'controlled-substances'
  | 'users'
  | 'cash-register'
  | 'receipts'
  | 'hardware'
  | 'settings'
  | 'medicine-detail'

interface UiState {
  screen: Screen
  dark: boolean
  paletteOpen: boolean
  toast: string | null
  // Set when a completed sale should be opened in the Sales screen's detail
  // modal — desktop's equivalent of web's /sales/:id deep link.
  pendingSaleDetailId: number | null
  // Medicine whose detail screen should open — desktop's /medicines/:id.
  pendingMedicineDetailId: number | null
  // Medicine to auto-add to the cart when New Sale opens — desktop's
  // /new-sale?medicineId=X deep link.
  pendingCheckoutMedicineId: number | null
  setScreen: (s: Screen) => void
  toggleDark: () => void
  setPaletteOpen: (open: boolean) => void
  showToast: (message: string) => void
  setPendingSaleDetailId: (id: number | null) => void
  setPendingMedicineDetailId: (id: number | null) => void
  setPendingCheckoutMedicineId: (id: number | null) => void
}

// The one authoritative screen-access map, mirroring web's route-level
// guards in artifacts/web/src/App.tsx (ProtectedRoute roles=...). Screens
// absent from the map are open to every role. Sidebar, CommandPalette and
// the AuthedApp redirect all read this same map — there is deliberately no
// second, nav-specific permission list.
export const SCREEN_ROLES: Partial<Record<Screen, string[]>> = {
  'supplier-ledger': ['admin'],
  users: ['admin'],
  'audit-log': ['admin'],
  'cash-register': ['admin', 'pharmacist', 'cashier'],
  'insurance-claims': ['admin', 'pharmacist'],
  'pre-authorizations': ['admin', 'pharmacist'],
  'supplier-returns': ['admin', 'pharmacist'],
  stocktake: ['admin', 'pharmacist'],
  'drug-interactions': ['admin', 'pharmacist'],
  'controlled-substances': ['admin', 'pharmacist'],
  // Desktop-only screen (no web counterpart) — printer/hardware config is
  // an administrator concern, matching its placement in the Admin section.
  hardware: ['admin']
}

export function canAccessScreen(screen: Screen, role?: string | null): boolean {
  const allowed = SCREEN_ROLES[screen]
  if (!allowed) return true
  return !!role && allowed.includes(role)
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      screen: 'new-sale',
      dark: true,
      paletteOpen: false,
      toast: null,
      pendingSaleDetailId: null,
      pendingMedicineDetailId: null,
      pendingCheckoutMedicineId: null,
      setScreen: (screen) => set({ screen }),
      toggleDark: () => set((s) => ({ dark: !s.dark })),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      showToast: (toast) => {
        set({ toast })
        setTimeout(() => set({ toast: null }), 3000)
      },
      setPendingSaleDetailId: (pendingSaleDetailId) => set({ pendingSaleDetailId }),
      setPendingMedicineDetailId: (pendingMedicineDetailId) => set({ pendingMedicineDetailId }),
      setPendingCheckoutMedicineId: (pendingCheckoutMedicineId) => set({ pendingCheckoutMedicineId })
    }),
    {
      name: 'pharmacore-theme',
      // Persist only the user's theme choice — everything else is session
      // state that should reset on a fresh launch.
      partialize: (s) => ({ dark: s.dark })
    }
  )
)
