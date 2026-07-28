import { useMemo, useState } from "react";
import { useListOrders } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Receipt, ArrowRight, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Sales() {
  const { data: orders, isLoading } = useListOrders();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const hasActiveFilters = !!(search || statusFilter !== "all" || paymentFilter !== "all" || fromDate || toDate);

  const filteredOrders = useMemo(() => {
    if (!orders) return orders;
    const q = search.trim().toLowerCase();
    return orders.filter((order: any) => {
      if (statusFilter !== "all" && order.status !== statusFilter) return false;
      if (paymentFilter !== "all" && order.paymentStatus !== paymentFilter) return false;
      const orderDate = order.createdAt?.slice(0, 10);
      if (fromDate && orderDate < fromDate) return false;
      if (toDate && orderDate > toDate) return false;
      if (q) {
        const saleNo = `#${order.id.toString().padStart(4, "0")}`.toLowerCase();
        const haystack = `${saleNo} ${order.id} ${order.patientName ?? ""} ${order.servedByName ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [orders, search, statusFilter, paymentFilter, fromDate, toDate]);

  function clearFilters() {
    setSearch(""); setStatusFilter("all"); setPaymentFilter("all"); setFromDate(""); setToDate("");
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Sales</h1>
          <p className="text-muted-foreground mt-1">History of all counter sales and transactions.</p>
        </div>
        <Button asChild>
          <Link href="/new-sale">+ New Sale</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by sale #, patient, or staff…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="dispensed">Dispensed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Payment" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All payments</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-[150px]" aria-label="From date" />
            <span className="text-muted-foreground text-sm">to</span>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-[150px]" aria-label="To date" />
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="w-4 h-4 mr-1" /> Clear
            </Button>
          )}
        </CardContent>
      </Card>

      {hasActiveFilters && !isLoading && (
        <p className="text-sm text-muted-foreground -mt-3">
          Showing {filteredOrders?.length ?? 0} of {orders?.length ?? 0} sales
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[100px]">Sale #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Served By</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading sales…</TableCell>
                </TableRow>
              ) : orders?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <Receipt className="w-12 h-12 text-muted-foreground/50" />
                      <p>No sales yet.</p>
                      <Button asChild size="sm">
                        <Link href="/new-sale">Process First Sale</Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredOrders?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <Search className="w-10 h-10 text-muted-foreground/50" />
                      <p>No sales match your filters.</p>
                      <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrders?.map((order) => (
                  <TableRow key={order.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium text-foreground">
                      <Link href={`/sales/${order.id}`} className="hover:underline">
                        #{order.id.toString().padStart(4, '0')}
                      </Link>
                    </TableCell>
                    <TableCell>{formatDate(order.createdAt)}</TableCell>
                    <TableCell>{(order as any).patientName || <span className="text-muted-foreground/60 text-sm">Walk-in</span>}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{(order as any).servedByName || "—"}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(order.total)}</TableCell>
                    <TableCell><SaleStatusBadge status={order.status} /></TableCell>
                    <TableCell><PaymentStatusBadge status={order.paymentStatus} /></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/sales/${order.id}`}>
                          View <ArrowRight className="w-4 h-4 ml-1" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function SaleStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    dispensed: { label: "Dispensed", className: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
    pending: { label: "Pending", className: "bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30" },
    cancelled: { label: "Cancelled", className: "bg-rose-500/20 text-rose-700 dark:text-rose-400 border-rose-500/30" },
  };
  const cfg = map[status] ?? { label: status, className: "" };
  return <Badge variant="outline" className={`capitalize ${cfg.className}`}>{cfg.label}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    paid: { label: "Paid", className: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
    unpaid: { label: "Unpaid", className: "bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30" },
    refunded: { label: "Refunded", className: "bg-sky-500/20 text-sky-700 dark:text-sky-400 border-sky-500/30" },
  };
  const cfg = map[status] ?? { label: status, className: "" };
  return <Badge variant="outline" className={`capitalize ${cfg.className}`}>{cfg.label}</Badge>;
}

// Keep old name export for backward compat
export const OrderStatusBadge = SaleStatusBadge;
export const PaymentStatusBadge2 = PaymentStatusBadge;
