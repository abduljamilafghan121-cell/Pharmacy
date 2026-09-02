import { lazy, Suspense, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, Redirect, useLocation } from 'wouter';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { useSetupCheck } from '@/hooks/use-setup-check';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Loader2 } from 'lucide-react';
import { usePharmacySettings } from '@/hooks/use-pharmacy-settings';
import { setCurrencyDisplay } from '@/lib/utils';

// Pages are lazy-loaded so Vite code-splits the bundle: the browser only
// downloads the chunk for the route the user actually opens, instead of
// shipping every screen (Reports, PurchaseOrders, …) in the first load.
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const NewSale = lazy(() => import('@/pages/NewSale'));
const Sales = lazy(() => import('@/pages/Orders'));
const SaleDetail = lazy(() => import('@/pages/OrderDetail'));
const Prescriptions = lazy(() => import('@/pages/Prescriptions'));
const Medicines = lazy(() => import('@/pages/Medicines'));
const MedicineDetail = lazy(() => import('@/pages/MedicineDetail'));
const Patients = lazy(() => import('@/pages/Patients'));
const Suppliers = lazy(() => import('@/pages/Suppliers'));
const PurchaseOrders = lazy(() => import('@/pages/PurchaseOrders'));
const Reports = lazy(() => import('@/pages/Reports'));
const Settings = lazy(() => import('@/pages/Settings'));
const Users = lazy(() => import('@/pages/Users'));
const SupplierLedger = lazy(() => import('@/pages/SupplierLedger'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const AuditLog = lazy(() => import('@/pages/AuditLog'));
const CashRegister = lazy(() => import('@/pages/CashRegister'));
const InsuranceClaims = lazy(() => import('@/pages/InsuranceClaims'));
const PreAuthorizations = lazy(() => import('@/pages/PreAuthorizations'));
const SupplierReturns = lazy(() => import('@/pages/SupplierReturns'));
const ControlledSubstanceLogs = lazy(() => import('@/pages/ControlledSubstanceLogs'));
const Stocktake = lazy(() => import('@/pages/Stocktake'));
const DrugInteractions = lazy(() => import('@/pages/DrugInteractions'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    }
  }
});

// Pharmacy settings are public (needed on the pre-login Login page too),
// so this can run unconditionally at the app root — it keeps formatCurrency
// in sync with whatever currency label is configured, everywhere in the app.
function CurrencySync() {
  const { data } = usePharmacySettings();
  useEffect(() => {
    if (data) setCurrencyDisplay(data.currencySymbol, data.currencyPosition);
  }, [data?.currencySymbol, data?.currencyPosition]);
  return null;
}

function ProtectedRoute({ component: Component, roles }: { component: React.ElementType, roles?: string[] }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div className="flex-1 flex items-center justify-center min-h-screen"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>;

  if (!user) return <Redirect to="/login" />;

  if (roles && !roles.includes(user.role)) {
    return <Redirect to="/dashboard" />;
  }

  return (
    <AppLayout>
      <ErrorBoundary>
        <Component />
      </ErrorBoundary>
    </AppLayout>
  );
}

function SetupGate({ children }: { children: React.ReactNode }) {
  const { data, isLoading, error } = useSetupCheck();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin w-8 h-8 text-primary" />
      </div>
    );
  }

  if (error || !data) {
    if (location !== '/setup') return <Redirect to="/setup" />;
    return <>{children}</>;
  }

  if (!data.hasUsers && location !== '/setup') {
    return <Redirect to="/setup" />;
  }

  if (data.hasUsers && location === '/setup') {
    return <Redirect to="/login" />;
  }

  return <>{children}</>;
}

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="animate-spin w-8 h-8 text-primary" />
    </div>
  );
}

function Router() {
  const { user } = useAuth();

  return (
    <SetupGate>
      <Suspense fallback={<RouteFallback />}>
        <Switch>
        <Route path="/setup" component={Register} />
        <Route path="/login">
          {user ? <Redirect to="/dashboard" /> : <Login />}
        </Route>
        <Route path="/">
          <Redirect to="/dashboard" />
        </Route>
        <Route path="/dashboard">
          <ProtectedRoute component={Dashboard} />
        </Route>
        <Route path="/new-sale">
          <ProtectedRoute component={NewSale} />
        </Route>
        <Route path="/sales">
          <ProtectedRoute component={Sales} />
        </Route>
        <Route path="/sales/:id">
          <ProtectedRoute component={SaleDetail} />
        </Route>
        <Route path="/prescriptions">
          <ProtectedRoute component={Prescriptions} />
        </Route>
        <Route path="/medicines">
          <ProtectedRoute component={Medicines} />
        </Route>
        <Route path="/medicines/:id">
          <ProtectedRoute component={MedicineDetail} />
        </Route>
        <Route path="/patients">
          <ProtectedRoute component={Patients} />
        </Route>
        <Route path="/suppliers">
          <ProtectedRoute component={Suppliers} />
        </Route>
        <Route path="/supplier-ledger">
          <ProtectedRoute component={SupplierLedger} roles={['admin']} />
        </Route>
        <Route path="/purchase-orders">
          <ProtectedRoute component={PurchaseOrders} />
        </Route>
        <Route path="/reports">
          <ProtectedRoute component={Reports} />
        </Route>
        <Route path="/settings">
          <ProtectedRoute component={Settings} />
        </Route>
        <Route path="/users">
          <ProtectedRoute component={Users} roles={['admin']} />
        </Route>
        <Route path="/audit-log">
          <ProtectedRoute component={AuditLog} roles={['admin']} />
        </Route>
        <Route path="/cash-register">
          <ProtectedRoute component={CashRegister} roles={['admin', 'pharmacist', 'cashier']} />
        </Route>
        <Route path="/insurance-claims">
          <ProtectedRoute component={InsuranceClaims} roles={['admin', 'pharmacist']} />
        </Route>
        <Route path="/pre-authorizations">
          <ProtectedRoute component={PreAuthorizations} roles={['admin', 'pharmacist']} />
        </Route>
        <Route path="/supplier-returns">
          <ProtectedRoute component={SupplierReturns} roles={['admin', 'pharmacist']} />
        </Route>
        <Route path="/controlled-substance-logs">
          <ProtectedRoute component={ControlledSubstanceLogs} roles={['admin', 'pharmacist']} />
        </Route>
        <Route path="/stocktake">
          <ProtectedRoute component={Stocktake} roles={['admin', 'pharmacist']} />
        </Route>
        <Route path="/drug-interactions">
          <ProtectedRoute component={DrugInteractions} roles={['admin', 'pharmacist']} />
        </Route>
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route component={NotFound} />
        </Switch>
      </Suspense>
    </SetupGate>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AuthProvider>
            <CurrencySync />
            <Router />
            <Toaster />
          </AuthProvider>
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
