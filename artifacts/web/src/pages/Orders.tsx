import { useListOrders } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ClipboardList, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export default function Orders() {
  const { user } = useAuth();
  const { data: orders, isLoading } = useListOrders();

  const isAdmin = user?.role === "admin" || user?.role === "pharmacist";

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Orders</h1>
        <p className="text-muted-foreground mt-1">
          {isAdmin ? "Manage and fulfill customer orders." : "View your order history and status."}
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[100px]">Order ID</TableHead>
                <TableHead>Date</TableHead>
                {isAdmin && <TableHead>Customer</TableHead>}
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-8 text-muted-foreground">
                    Loading orders...
                  </TableCell>
                </TableRow>
              ) : orders?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-12 text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <ClipboardList className="w-12 h-12 text-muted-foreground/50" />
                      <p>No orders found.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                orders?.map((order) => (
                  <TableRow key={order.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium text-foreground">
                      <Link href={`/orders/${order.id}`} className="hover:underline">
                        #{order.id.toString().padStart(4, '0')}
                      </Link>
                    </TableCell>
                    <TableCell>{formatDate(order.createdAt)}</TableCell>
                    {isAdmin && <TableCell>{order.customerName}</TableCell>}
                    <TableCell className="font-medium">{formatCurrency(order.total)}</TableCell>
                    <TableCell>
                      <OrderStatusBadge status={order.status} />
                    </TableCell>
                    <TableCell>
                      <PaymentStatusBadge status={order.paymentStatus} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/orders/${order.id}`}>
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

export function OrderStatusBadge({ status }: { status: string }) {
  const map: Record<string, any> = {
    pending: { label: "Pending", variant: "outline" },
    processing: { label: "Processing", variant: "warning" },
    dispensed: { label: "Dispensed", variant: "primary" },
    delivered: { label: "Delivered", variant: "success" },
    cancelled: { label: "Cancelled", variant: "destructive" },
  };

  const config = map[status] || map.pending;

  return (
    <Badge variant={config.variant} className={config.variant === 'outline' ? 'bg-background' : ''}>
      {config.label}
    </Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: string }) {
  const map: Record<string, any> = {
    unpaid: { label: "Unpaid", variant: "destructive" },
    paid: { label: "Paid", variant: "success" },
    refunded: { label: "Refunded", variant: "secondary" },
  };

  const config = map[status] || map.unpaid;

  return (
    <Badge variant={config.variant} className={config.variant === 'secondary' ? 'text-muted-foreground' : ''}>
      {config.label}
    </Badge>
  );
}
