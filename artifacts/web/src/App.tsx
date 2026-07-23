import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, Redirect } from 'wouter';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { AppLayout } from '@/components/layout/AppLayout';

import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Dashboard from '@/pages/Dashboard';
import Medicines from '@/pages/Medicines';
import MedicineDetail from '@/pages/MedicineDetail';
import Cart from '@/pages/Cart';
import Orders from '@/pages/Orders';
import OrderDetail from '@/pages/OrderDetail';
import Prescriptions from '@/pages/Prescriptions';
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

  if (isLoading) return <div className="flex-1 flex items-center justify-center min-h-screen">Loading...</div>;
  
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

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute component={Dashboard} />
      </Route>
      <Route path="/medicines">
        <ProtectedRoute component={Medicines} />
      </Route>
      <Route path="/medicines/:id">
        <ProtectedRoute component={MedicineDetail} />
      </Route>
      <Route path="/cart">
        <ProtectedRoute component={Cart} roles={['customer']} />
      </Route>
      <Route path="/orders">
        <ProtectedRoute component={Orders} />
      </Route>
      <Route path="/orders/:id">
        <ProtectedRoute component={OrderDetail} />
      </Route>
      <Route path="/prescriptions">
        <ProtectedRoute component={Prescriptions} />
      </Route>
      <Route path="/suppliers">
        <ProtectedRoute component={Suppliers} roles={['admin', 'pharmacist']} />
      </Route>
      <Route path="/purchase-orders">
        <ProtectedRoute component={PurchaseOrders} roles={['admin', 'pharmacist']} />
      </Route>
      <Route path="/reports">
        <ProtectedRoute component={Reports} roles={['admin', 'pharmacist']} />
      </Route>
      <Route path="/settings">
        <ProtectedRoute component={Settings} />
      </Route>
      <Route component={NotFound} />
    </Switch>
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
