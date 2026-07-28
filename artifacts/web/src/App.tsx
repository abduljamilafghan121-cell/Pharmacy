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

import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Dashboard from '@/pages/Dashboard';
import NewSale from '@/pages/NewSale';
import Sales from '@/pages/Orders';
import SaleDetail from '@/pages/OrderDetail';
import Prescriptions from '@/pages/Prescriptions';
import Medicines from '@/pages/Medicines';
import MedicineDetail from '@/pages/MedicineDetail';
import Patients from '@/pages/Patients';
import Suppliers from '@/pages/Suppliers';
import PurchaseOrders from '@/pages/PurchaseOrders';
import Reports from '@/pages/Reports';
import Settings from '@/pages/Settings';
import Users from '@/pages/Users';
import SupplierLedger from '@/pages/SupplierLedger';
import AuditLog from '@/pages/AuditLog';
import CashRegister from '@/pages/CashRegister';
import InsuranceClaims from '@/pages/InsuranceClaims';
import SupplierReturns from '@/pages/SupplierReturns';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    }
  }
});

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

function Router() {
  const { user } = useAuth();

  return (
    <SetupGate>
      <Switch>
        <Route path="/setup" component={Register} />
        <Route path="/login">
          {user ? <Redirect to="/dashboard" /> : <Login />}
        </Route>
        <Route path="/forgot-password">
          {user ? <Redirect to="/dashboard" /> : <ForgotPassword />}
        </Route>
        <Route path="/reset-password">
          {user ? <Redirect to="/dashboard" /> : <ResetPassword />}
        </Route>
        <Route path="/">
          <Redirect to="/dashboard" />
        </Route>
        <Route path="/dashboard">
          <ProtectedRoute component={Dashboard} />
        </Route>
        <Route path="/new-sale">
          <ProtectedRoute component={NewSale} roles={['admin', 'pharmacist', 'cashier']} />
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
          <ProtectedRoute component={Medicines} roles={['admin', 'pharmacist', 'viewer']} />
        </Route>
        <Route path="/medicines/:id">
          <ProtectedRoute component={MedicineDetail} roles={['admin', 'pharmacist', 'viewer']} />
        </Route>
        <Route path="/patients">
          <ProtectedRoute component={Patients} />
        </Route>
        <Route path="/suppliers">
          <ProtectedRoute component={Suppliers} roles={['admin', 'pharmacist', 'viewer']} />
        </Route>
        <Route path="/supplier-ledger">
          <ProtectedRoute component={SupplierLedger} roles={['admin', 'viewer']} />
        </Route>
        <Route path="/audit-log">
          <ProtectedRoute component={AuditLog} roles={['admin']} />
        </Route>
        <Route path="/cash-register">
          <ProtectedRoute component={CashRegister} roles={['admin', 'pharmacist', 'cashier']} />
        </Route>
        <Route path="/insurance-claims">
          <ProtectedRoute component={InsuranceClaims} roles={['admin', 'pharmacist', 'viewer']} />
        </Route>
        <Route path="/supplier-returns">
          <ProtectedRoute component={SupplierReturns} roles={['admin', 'pharmacist', 'viewer']} />
        </Route>
        <Route path="/purchase-orders">
          <ProtectedRoute component={PurchaseOrders} roles={['admin', 'pharmacist', 'viewer']} />
        </Route>
        <Route path="/reports">
          <ProtectedRoute component={Reports} roles={['admin', 'pharmacist', 'viewer']} />
        </Route>
        <Route path="/settings">
          <ProtectedRoute component={Settings} />
        </Route>
        <Route path="/users">
          <ProtectedRoute component={Users} roles={['admin']} />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </SetupGate>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AuthProvider>
            <Router />
            <Toaster />
          </AuthProvider>
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
