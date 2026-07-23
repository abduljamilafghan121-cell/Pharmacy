import { useListOrders } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Receipt, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Sales() {
  const { data: orders, isLoading } = useListOrders();

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
              ) : (
                orders?.map((order) => (
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
