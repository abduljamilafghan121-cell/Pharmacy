import { useMemo, useState } from "react";
import { useGetSalesReport } from "@workspace/api-client-react";
import { useGetProfitReport, useTopMedicinesRanged, useStaffProductivity, useReorderSuggestions } from "@/hooks/use-reports-extra";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ErrorState } from "@/components/ui/error-state";
import { getErrorMessage } from "@/lib/errors";
import { formatCurrency } from "@/lib/utils";
import { Download, TrendingUp, Info, Users2, TrendingDown } from "lucide-react";

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(row => row.map(cell => {
    const s = String(cell ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const today = toISODate(new Date());
  const thirtyDaysAgo = toISODate(new Date(Date.now() - 29 * 86400000));
  const [fromDate, setFromDate] = useState(thirtyDaysAgo);
  const [toDate, setToDate] = useState(today);

  const { data: sales, isLoading, isError, error, refetch } = useGetSalesReport({ from: fromDate, to: toDate });
  const { data: profit, isLoading: profitLoading } = useGetProfitReport(fromDate, toDate);
  const { data: topMedicines, isLoading: topLoading } = useTopMedicinesRanged(fromDate, toDate);
  const { data: staffData, isLoading: staffLoading } = useStaffProductivity(fromDate, toDate);
  const { data: reorderData, isLoading: reorderLoading } = useReorderSuggestions();

  const quickRanges = [
    { label: "7 days", days: 6 },
    { label: "30 days", days: 29 },
    { label: "90 days", days: 89 },
  ];

  function applyQuickRange(days: number) {
    setFromDate(toISODate(new Date(Date.now() - days * 86400000)));
    setToDate(today);
  }

  function exportSalesCsv() {
    if (!sales?.byDay) return;
    downloadCsv(`sales-report-${fromDate}-to-${toDate}.csv`, [
      ["Date", "Orders", "Revenue"],
      ...sales.byDay.map((d: any) => [d.date, d.orders, d.revenue]),
    ]);
  }

  function exportTopMedicinesCsv() {
    if (!topMedicines) return;
    downloadCsv(`top-medicines-${fromDate}-to-${toDate}.csv`, [
      ["Medicine", "Units Sold", "Revenue"],
      ...topMedicines.map(m => [m.medicineName ?? `#${m.medicineId}`, m.totalSold, m.revenue]),
    ]);
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Reports</h1>
          <p className="text-muted-foreground mt-1">Analytics and performance metrics.</p>
        </div>
        <Button variant="outline" onClick={exportSalesCsv} disabled={!sales?.byDay?.length}>
          <Download className="w-4 h-4 mr-2" /> Export sales CSV
        </Button>
      </div>

      {/* Date range controls */}
      <Card>
        <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
          <div className="flex items-center gap-2">
            <Label htmlFor="report-from" className="text-sm text-muted-foreground shrink-0">From</Label>
            <Input id="report-from" type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)} className="w-[160px]" />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="report-to" className="text-sm text-muted-foreground shrink-0">To</Label>
            <Input id="report-to" type="date" value={toDate} min={fromDate} max={today} onChange={(e) => setToDate(e.target.value)} className="w-[160px]" />
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            {quickRanges.map(r => (
              <Button key={r.label} variant="ghost" size="sm" onClick={() => applyQuickRange(r.days)}>
                Last {r.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {isError ? (
        <ErrorState
          title="Failed to load report data"
          message={getErrorMessage(error)}
          onRetry={() => refetch()}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-primary">
                  {isLoading ? <div className="h-10 w-32 bg-muted/50 animate-pulse rounded" /> : formatCurrency(sales?.totalRevenue ?? 0)}
                </div>
                <p className="text-sm text-muted-foreground mt-2">Across {sales?.totalOrders ?? 0} orders</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Gross Profit</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-emerald-600">
                  {profitLoading ? <div className="h-10 w-32 bg-muted/50 animate-pulse rounded" /> : formatCurrency(profit?.profit ?? 0)}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {profitLoading ? "…" : `${profit?.marginPct ?? 0}% margin`} · Cost {profitLoading ? "…" : formatCurrency(profit?.cost ?? 0)}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-muted/30">
              <CardContent className="p-5 flex gap-2 items-start text-xs text-muted-foreground h-full">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{profit?.note ?? "Profit reflects cost only for stock received after batch cost tracking was added. Older stock shows $0 cost, which can understate true cost."}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="pt-6">
            <CardHeader>
              <CardTitle>Sales Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[350px] w-full mt-4">
                {isLoading ? (
                  <div className="w-full h-full bg-muted/20 animate-pulse rounded-md" />
                ) : sales?.byDay && sales.byDay.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sales.byDay}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} tickMargin={10} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(val) => `$${val}`} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        cursor={{ fill: 'hsl(var(--muted))' }}
                        contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                        formatter={(value: any) => [formatCurrency(value), "Revenue"]}
                      />
                      <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    No sales data in this date range.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Top Medicines</CardTitle>
                <CardDescription>Best sellers by units, in the selected date range.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={exportTopMedicinesCsv} disabled={!topMedicines?.length}>
                <Download className="w-4 h-4 mr-2" /> Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {topLoading ? (
                  Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted/30 animate-pulse" />)
                ) : topMedicines && topMedicines.length > 0 ? (
                  topMedicines.map((med, idx) => (
                    <div key={med.medicineId} className="flex items-center justify-between py-2.5 border-b last:border-0 border-border">
                      <div className="flex items-center gap-3">
                        <span className="w-6 text-sm text-muted-foreground font-medium">#{idx + 1}</span>
                        <span className="font-medium">{med.medicineName ?? `Medicine #${med.medicineId}`}</span>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{med.totalSold} units</p>
                        <p className="text-xs text-muted-foreground">{formatCurrency(med.revenue)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-sm py-6 text-center">No sales data in this date range.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Staff Productivity */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base"><Users2 className="w-4 h-4" /> Staff Productivity</CardTitle>
                <CardDescription className="mt-0.5">Sales, orders, and items dispensed per staff member in the selected period.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {staffLoading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted/30 animate-pulse" />)}</div>
              ) : staffData && staffData.length > 0 ? (
                <div className="divide-y divide-border">
                  {staffData.map((row, idx) => (
                    <div key={row.userId ?? idx} className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="w-6 text-sm text-muted-foreground font-medium">#{idx + 1}</span>
                        <span className="font-medium">{row.userName ?? "Unassigned"}</span>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{formatCurrency(parseFloat(row.totalRevenue))}</p>
                        <p className="text-xs text-muted-foreground">{row.totalOrders} orders · {row.totalItems} items</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm py-6 text-center">No sales with assigned staff in this period.</p>
              )}
            </CardContent>
          </Card>

          {/* Smart Reorder Suggestions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base"><TrendingDown className="w-4 h-4 text-destructive" /> Smart Reorder Suggestions</CardTitle>
              <CardDescription>Medicines below or near reorder level — suggested quantities based on 30-day sales velocity.</CardDescription>
            </CardHeader>
            <CardContent>
              {reorderLoading ? (
                <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted/30 animate-pulse" />)}</div>
              ) : reorderData && reorderData.length > 0 ? (
                <div className="space-y-0.5">
                  {reorderData.map((item) => (
                    <div key={item.medicineId} className="flex items-center justify-between py-2 border-b last:border-0 border-border gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{item.medicineName}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                            item.urgency === 'critical' ? 'bg-destructive/10 text-destructive' :
                            item.urgency === 'high' ? 'bg-amber-500/10 text-amber-600' :
                            'bg-muted text-muted-foreground'
                          }`}>{item.urgency}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Stock: {item.currentStock} · Reorder at: {item.reorderLevel} · Sold 30d: {item.sold30Days} ({item.dailyRate}/day)
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-primary">Order {item.suggestedReorderQty}</p>
                        <p className="text-xs text-muted-foreground">units suggested</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm py-6 text-center">All medicines are adequately stocked.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
