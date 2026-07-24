import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, Redirect, useLocation } from 'wouter';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { useSetupCheck } from '@/hooks/use-setup-check';
import { Loader2 } from 'lucide-react';

import Login from '@/pages/Login';
import Register from '@/pages/Register';
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
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
      <Component />
    </AppLayout>
  );
}

/**
 * Checks setup status on every page load.
 * If no users exist yet, forces the user to /setup regardless of the current route.
 */
function SetupGate({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useSetupCheck();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin w-8 h-8 text-primary" />
      </div>
    );
  }

  // No users yet — send to setup unless already there
  if (data && !data.hasUsers && location !== '/setup') {
    return <Redirect to="/setup" />;
  }

  // Users exist — don't allow accessing setup page
  if (data?.hasUsers && location === '/setup') {
    return <Redirect to="/login" />;
  }

  return <>{children}</>;
}

function Router() {
  const { user } = useAuth();

  return (
    <SetupGate>
      <Switch>
        {/* First-run setup */}
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
          <ProtectedRoute component={Suppliers} roles={['admin']} />
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
