import { useGetSalesReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from "@/lib/utils";

export default function Reports() {
  const { data: sales, isLoading } = useGetSalesReport();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Reports</h1>
        <p className="text-muted-foreground mt-1">Analytics and performance metrics.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-primary">
              {sales ? formatCurrency(sales.totalRevenue) : "$0.00"}
            </div>
            <p className="text-sm text-muted-foreground mt-2">Across {sales?.totalOrders || 0} orders</p>
          </CardContent>
        </Card>
      </div>

      <Card className="pt-6">
        <CardHeader>
          <CardTitle>Sales Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] w-full mt-4">
            {isLoading ? (
              <div className="w-full h-full bg-muted/20 animate-pulse rounded-md" />
            ) : sales?.byDay && sales.byDay.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sales.byDay}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{fontSize: 12}} tickMargin={10} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(val) => `$${val}`} tick={{fontSize: 12}} axisLine={false} tickLine={false} />
                  <Tooltip 
                    cursor={{fill: 'hsl(var(--muted))'}}
                    contentStyle={{borderRadius: '8px', border: '1px solid hsl(var(--border))'}}
                    formatter={(value: any) => [formatCurrency(value), "Revenue"]}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                No sales data available for chart.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
