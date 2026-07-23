import { useGetInventoryReport, useGetSalesReport, useGetTopMedicines, useListOrders } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Package, AlertCircle, Clock, DollarSign, TrendingUp, Receipt } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Overview</h1>
          <p className="text-muted-foreground mt-1">Pharmacy operations snapshot for today.</p>
        </div>
        <Button asChild>
          <Link href="/new-sale">+ New Sale</Link>
        </Button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Today's Revenue"
          value={formatCurrency(todaySales?.revenue || 0)}
          subtitle={`${todaySales?.orders || 0} sales today`}
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
                <p className="text-muted-foreground text-sm py-4 text-center">No sales data yet.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick actions */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                <Receipt size={32} />
              </div>
              <div>
                <h3 className="text-lg font-bold">New Sale</h3>
                <p className="text-muted-foreground text-sm mt-1">Process a counter sale</p>
              </div>
              <Button className="w-full mt-2" asChild>
                <Link href="/new-sale">Open POS</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-blue-500/20 text-blue-600 flex items-center justify-center">
                <Clock size={32} />
              </div>
              <div>
                <h3 className="text-lg font-bold">Prescriptions</h3>
                <p className="text-muted-foreground text-sm mt-1">Record and verify prescriptions</p>
              </div>
              <Button variant="outline" className="w-full mt-2" asChild>
                <Link href="/prescriptions">Manage</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Sales */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Sales</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {recentOrders?.slice(0, 5).map((order: any) => (
              <Link key={order.id} href={`/sales/${order.id}`} className="block hover:bg-muted/30 rounded-lg p-3 transition-colors border border-transparent hover:border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Sale #{order.id?.toString().padStart(4, '0')}</p>
                    <p className="text-sm text-muted-foreground">{order.patientName || "Walk-in"}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{formatCurrency(order.total)}</p>
                    <Badge variant={order.paymentStatus === 'paid' ? 'default' : 'secondary'} className="capitalize text-xs">
                      {order.paymentStatus}
                    </Badge>
                  </div>
                </div>
              </Link>
            ))}
            {!recentOrders?.length && (
              <p className="text-muted-foreground text-sm py-4 text-center">No sales yet today.</p>
            )}
          </div>
        </CardContent>
      </Card>
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
