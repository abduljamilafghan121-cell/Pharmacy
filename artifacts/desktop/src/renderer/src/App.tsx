import type { ReactElement } from 'react'
import { useEffect } from 'react'
import { useUiStore, canAccessScreen } from './store/uiStore'
import { getTheme } from './theme'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { useSetupCheck } from './hooks/useSetupCheck'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import CommandPalette from './components/CommandPalette'
import Toast from './components/Toast'
import Loading from './components/Loading'
import Login from './screens/Login'
import Setup from './screens/Setup'
import Dashboard from './screens/Dashboard'
import Inventory from './screens/Inventory'
import NewSale from './screens/NewSale'
import Sales from './screens/Sales'
import Medicines from './screens/Medicines'
import Patients from './screens/Patients'
import Suppliers from './screens/Suppliers'
import Prescriptions from './screens/Prescriptions'
import PurchaseOrders from './screens/PurchaseOrders'
import SupplierLedger from './screens/SupplierLedger'
import SupplierReturns from './screens/SupplierReturns'
import InsuranceClaims from './screens/InsuranceClaims'
import PreAuthorizations from './screens/PreAuthorizations'
import AuditLog from './screens/AuditLog'
import Reports from './screens/Reports'
import Stocktake from './screens/Stocktake'
import DrugInteractions from './screens/DrugInteractions'
import ControlledSubstanceLogs from './screens/ControlledSubstanceLogs'
import UsersScreen from './screens/Users'
import CashRegister from './screens/CashRegister'
import Hardware from './screens/Hardware'
import SettingsScreen from './screens/Settings'
import MedicineDetail from './screens/MedicineDetail'

const SCREENS = {
  dashboard: Dashboard,
  inventory: Inventory,
  'new-sale': NewSale,
  sales: Sales,
  medicines: Medicines,
  patients: Patients,
  suppliers: Suppliers,
  prescriptions: Prescriptions,
  'purchase-orders': PurchaseOrders,
  'supplier-ledger': SupplierLedger,
  'supplier-returns': SupplierReturns,
  'insurance-claims': InsuranceClaims,
  'pre-authorizations': PreAuthorizations,
  'audit-log': AuditLog,
  reports: Reports,
  stocktake: Stocktake,
  'drug-interactions': DrugInteractions,
  'controlled-substances': ControlledSubstanceLogs,
  users: UsersScreen,
  'cash-register': CashRegister,
  hardware: Hardware,
  settings: SettingsScreen,
  'medicine-detail': MedicineDetail
}

function AuthedApp(): ReactElement {
  const { screen, setScreen, dark, setPaletteOpen } = useUiStore()
  const theme = getTheme(dark)
  const { user } = useAuth()
  const ActiveScreen = SCREENS[screen]

  // Route-level role gate — desktop's equivalent of web's ProtectedRoute
  // redirect. If the active screen isn't allowed for this role (e.g. after
  // logout/login as a different user, or a stale pending screen), fall back
  // to the dashboard, which every role can see.
  const screenAllowed = canAccessScreen(screen, user?.role)
  useEffect(() => {
    if (user && !screenAllowed) setScreen('dashboard')
  }, [user, screenAllowed, setScreen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      }
      if (e.key === 'Escape') setPaletteOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPaletteOpen])

  return (
    <div style={{ background: theme.bg }} className="h-screen flex flex-col overflow-hidden relative">
      <TitleBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <div className="flex-1 overflow-y-auto">{screenAllowed ? <ActiveScreen /> : null}</div>
      </div>
      <CommandPalette />
      <Toast />
    </div>
  )
}

function Gate(): ReactElement {
  const { dark } = useUiStore()
  const theme = getTheme(dark)
  const { isAuthenticated, isLoading } = useAuth()
  // First-run detection — mirrors web's SetupGate. Checked once per app
  // launch; when the database has no user accounts yet, the login form is
  // replaced by the admin setup screen.
  const {
    data: setupStatus,
    isLoading: setupLoading,
    isError: setupError
  } = useSetupCheck()

  // Keep the html/body and native Electron window background in sync with
  // the active theme — without this, the OS-level window surface stays the
  // dark startup color and bleeds through on resize or after switching to
  // light mode.
  useEffect(() => {
    document.documentElement.style.background = theme.bg
    document.body.style.background = theme.bg
    try {
      window.api?.window.setBackgroundColor(theme.bg)
    } catch {
      // api bridge unavailable (e.g. plain browser) — body sync is enough
    }
  }, [theme.bg])

  if (isLoading || (setupLoading && !setupError)) {
    return (
      <div style={{ background: theme.bg }} className="h-screen flex items-center justify-center">
        <Loading label="Loading…" size="lg" />
      </div>
    )
  }

  if (!isAuthenticated) {
    const needsSetup = !setupError && setupStatus != null && !setupStatus.hasUsers
    return (
      <div style={{ background: theme.bg }} className="h-screen">
        <TitleBar />
        <div style={{ height: 'calc(100% - 46px)' }}>{needsSetup ? <Setup /> : <Login />}</div>
      </div>
    )
  }

  return <AuthedApp />
}

export default function App(): ReactElement {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
