import type { ReactElement } from 'react'
import { lazy, Suspense, useEffect } from 'react'
import { useUiStore, canAccessScreen } from './store/uiStore'
import { getTheme } from './theme'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { useSetupCheck } from './hooks/useSetupCheck'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import CommandPalette from './components/CommandPalette'
import Toast from './components/Toast'
import SplashScreen from './components/SplashScreen'
import OfflineBanner from './components/OfflineBanner'
import ErrorBoundary from './components/ErrorBoundary'
import { useConnectivity } from './hooks/useConnectivity'

// Screens are lazy-loaded so electron-vite code-splits the renderer bundle —
// the app no longer ships every screen's code in the initial chunk. Chunks
// are tiny local files in Electron, so the brief Suspense fallback is
// imperceptible after first load.
const Login = lazy(() => import('./screens/Login'))
const Setup = lazy(() => import('./screens/Setup'))
const Dashboard = lazy(() => import('./screens/Dashboard'))
const Inventory = lazy(() => import('./screens/Inventory'))
const NewSale = lazy(() => import('./screens/NewSale'))
const Sales = lazy(() => import('./screens/Sales'))
const Medicines = lazy(() => import('./screens/Medicines'))
const Patients = lazy(() => import('./screens/Patients'))
const Suppliers = lazy(() => import('./screens/Suppliers'))
const Prescriptions = lazy(() => import('./screens/Prescriptions'))
const PurchaseOrders = lazy(() => import('./screens/PurchaseOrders'))
const SupplierLedger = lazy(() => import('./screens/SupplierLedger'))
const SupplierReturns = lazy(() => import('./screens/SupplierReturns'))
const InsuranceClaims = lazy(() => import('./screens/InsuranceClaims'))
const PreAuthorizations = lazy(() => import('./screens/PreAuthorizations'))
const AuditLog = lazy(() => import('./screens/AuditLog'))
const Reports = lazy(() => import('./screens/Reports'))
const Stocktake = lazy(() => import('./screens/Stocktake'))
const DrugInteractions = lazy(() => import('./screens/DrugInteractions'))
const ControlledSubstanceLogs = lazy(() => import('./screens/ControlledSubstanceLogs'))
const UsersScreen = lazy(() => import('./screens/Users'))
const CashRegister = lazy(() => import('./screens/CashRegister'))
const Hardware = lazy(() => import('./screens/Hardware'))
const SettingsScreen = lazy(() => import('./screens/Settings'))
const MedicineDetail = lazy(() => import('./screens/MedicineDetail'))

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
        <div className="flex-1 overflow-y-auto">
          {screenAllowed ? (
            <ErrorBoundary>
              <Suspense fallback={null}>
                <ActiveScreen />
              </Suspense>
            </ErrorBoundary>
          ) : null}
        </div>
      </div>
      <CommandPalette />
      <Toast />
      <OfflineBanner />
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

  // Keep app-wide server-reachability tracking alive for the whole session.
  useConnectivity()

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
    return <SplashScreen />
  }

  if (!isAuthenticated) {
    const needsSetup = !setupError && setupStatus != null && !setupStatus.hasUsers
    return (
      <div style={{ background: theme.bg }} className="h-screen">
        <TitleBar />
        <div style={{ height: 'calc(100% - 46px)' }}>
          <Suspense fallback={null}>{needsSetup ? <Setup /> : <Login />}</Suspense>
        </div>
        <OfflineBanner />
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
