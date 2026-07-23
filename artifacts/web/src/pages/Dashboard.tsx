import { useAuth } from "@/hooks/use-auth";
import { useGetInventoryReport, useGetSalesReport, useGetTopMedicines, useListOrders } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Package, AlertCircle, Clock, DollarSign, TrendingUp, ShoppingBag } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { user } = useAuth();

  if (user?.role === "customer") {
    return <CustomerDashboard />;
  }

  return <StaffDashboard />;
}

function StaffDashboard() {
  const { data: inventory } = useGetInventoryReport();
  const { data: sales } = useGetSalesReport();
  const { data: topMedicines } = useGetTopMedicines();
  const { data: recentOrders } = useListOrders();

  const todayStr = new Date().toISOString().split('T')[0];
  const todaySales = sales?.byDay.find(d => d.date.startsWith(todayStr));

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Overview</h1>
        <p className="text-muted-foreground mt-1">Snapshot of your pharmacy operations today.</p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard 
          title="Today's Revenue" 
          value={formatCurrency(todaySales?.revenue || 0)}
          subtitle={`${todaySales?.orders || 0} orders today`}
          icon={DollarSign}
          intent="primary"
        />
        <MetricCard 
          title="Total Inventory" 
          value={inventory?.totalStock?.toString() || "0"}
          subtitle={`${inventory?.totalMedicines || 0} unique medicines`}
          icon={Package}
          intent="neutral"
        />
        <MetricCard 
          title="Low Stock Alerts" 
          value={inventory?.lowStockCount?.toString() || "0"}
          subtitle={`${inventory?.outOfStockCount || 0} out of stock`}
          icon={AlertCircle}
          intent="warning"
        />
        <MetricCard 
          title="Expiring Soon" 
          value={inventory?.expiringCount?.toString() || "0"}
          subtitle="Within next 30 days"
          icon={Clock}
          intent="danger"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Selling */}
        <Card className="col-span-1 lg:col-span-2 flex flex-col">
          <CardHeader>
            <CardTitle>Top Selling Medicines</CardTitle>
            <CardDescription>Highest revenue generators this period.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="space-y-4">
              {(topMedicines as any)?.slice(0, 5).map((item: any) => (
                <div key={item.medicineId} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                      <TrendingUp size={18} />
                    </div>
                    <div>
                      <p className="font-medium">{item.medicineName}</p>
                      <p className="text-sm text-muted-foreground">{item.totalSold} units sold</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-foreground">{formatCurrency(item.revenue)}</p>
                  </div>
                </div>
              ))}
              {!topMedicines?.length && (
                <div className="text-center py-8 text-muted-foreground">No sales data available.</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Orders */}
        <Card className="col-span-1 flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="space-y-1">
              <CardTitle>Recent Orders</CardTitle>
              <CardDescription>Latest customer orders.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/orders">View All</Link>
            </Button>
          </CardHeader>
          <CardContent className="flex-1 pt-4">
            <div className="space-y-4">
              {recentOrders?.slice(0, 5).map((order) => (
                <div key={order.id} className="flex items-center justify-between border-b border-border pb-4 last:border-0 last:pb-0">
                  <div>
                    <p className="font-medium text-sm">Order #{order.id}</p>
                    <p className="text-xs text-muted-foreground">{order.customerName}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-sm">{formatCurrency(order.total)}</p>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                      {order.status}
                    </span>
                  </div>
                </div>
              ))}
              {!recentOrders?.length && (
                <div className="text-center py-8 text-muted-foreground">No recent orders.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CustomerDashboard() {
  const { user } = useAuth();
  const { data: orders } = useListOrders();
  const pendingOrders = orders?.filter(o => o.status === 'pending' || o.status === 'processing');

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Welcome, {user?.name.split(' ')[0]}</h1>
        <p className="text-muted-foreground mt-1">Manage your health and prescriptions.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-primary text-primary-foreground border-transparent">
          <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
              <Package size={32} />
            </div>
            <div>
              <h3 className="text-xl font-bold">Browse Catalog</h3>
              <p className="text-primary-foreground/80 text-sm mt-1">Find the medicines you need</p>
            </div>
            <Button variant="secondary" className="w-full mt-2" asChild>
              <Link href="/medicines">Shop Now</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-accent/20 text-accent flex items-center justify-center">
              <ShoppingBag size={32} />
            </div>
            <div>
              <h3 className="text-xl font-bold">Active Orders</h3>
              <p className="text-muted-foreground text-sm mt-1">You have {pendingOrders?.length || 0} active orders</p>
            </div>
            <Button variant="outline" className="w-full mt-2" asChild>
              <Link href="/orders">View Orders</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-blue-500/20 text-blue-600 flex items-center justify-center">
              <Clock size={32} />
            </div>
            <div>
              <h3 className="text-xl font-bold">Prescriptions</h3>
              <p className="text-muted-foreground text-sm mt-1">Upload and manage prescriptions</p>
            </div>
            <Button variant="outline" className="w-full mt-2" asChild>
              <Link href="/prescriptions">Manage</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ title, value, subtitle, icon: Icon, intent = "neutral" }: any) {
  const colors = {
    primary: "text-primary bg-primary/10",
    warning: "text-amber-600 bg-amber-500/10",
    danger: "text-destructive bg-destructive/10",
    neutral: "text-muted-foreground bg-muted",
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold tracking-tight text-foreground">{value}</p>
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colors[intent as keyof typeof colors]}`}>
            <Icon size={24} />
          </div>
        </div>
        <div className="mt-4 text-sm text-muted-foreground">
          {subtitle}
        </div>
      </CardContent>
    </Card>
  );
}
