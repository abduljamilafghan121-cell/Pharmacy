import { useRoute } from "wouter";
import { useGetOrder, useUpdateOrderStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, CheckCircle2, XCircle, User, Stethoscope, Printer } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { SaleStatusBadge, PaymentStatusBadge } from "./Orders";

export default function SaleDetail() {
  const [, params] = useRoute("/sales/:id");
  const id = Number(params?.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: order, isLoading } = useGetOrder(id, {
    query: { enabled: !!id } as any
  });

  const updateStatusMutation = useUpdateOrderStatus();

  if (isLoading) return <div className="p-10 text-center">Loading sale…</div>;
  if (!order) return <div className="p-10 text-center">Sale not found.</div>;

  const handleUpdateStatus = (newStatus: "pending" | "dispensed" | "cancelled") => {
    updateStatusMutation.mutate(
      { id, data: { status: newStatus } },
      {
        onSuccess: () => {
          toast({ title: `Sale marked as ${newStatus}` });
          queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
          queryClient.invalidateQueries({ queryKey: [`/api/orders/${id}`] });
        },
        onError: () => toast({ title: "Update failed", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-300">
      <Button variant="ghost" className="mb-2 -ml-4" onClick={() => window.history.back()}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Sales
      </Button>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            Sale #{order.id.toString().padStart(4, '0')}
            <SaleStatusBadge status={order.status} />
          </h1>
          <p className="text-muted-foreground mt-1">Processed on {formatDate(order.createdAt)}</p>
        </div>

        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="w-4 h-4 mr-2" /> Print Receipt
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Items */}
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Items Dispensed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(order as any).items?.map((item: any) => (
                  <div key={item.id} className="flex justify-between items-center py-2 border-b border-border last:border-0 last:pb-0">
                    <div>
                      <p className="font-medium text-foreground">{item.medicineName}</p>
                      <p className="text-sm text-muted-foreground">
                        Qty: {item.quantity} × {formatCurrency(parseFloat(item.price) / item.quantity)}
                      </p>
                    </div>
                    <p className="font-semibold text-foreground">{formatCurrency(parseFloat(item.price))}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t border-border space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatCurrency(order.subtotal ?? order.total)}</span>
                </div>
                <div className="flex justify-between font-bold text-xl">
                  <span>Total</span>
                  <span>{formatCurrency(order.total)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Patient & Staff */}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <User size={14} className="text-muted-foreground" />
                <span className="text-muted-foreground">Patient:</span>
                <span className="font-medium">{(order as any).patientName || "Walk-in"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Stethoscope size={14} className="text-muted-foreground" />
                <span className="text-muted-foreground">Served by:</span>
                <span className="font-medium">{(order as any).servedByName || "—"}</span>
              </div>
              {order.notes && (
                <div className="bg-muted/50 rounded-md p-3 mt-2">
                  <p className="text-muted-foreground mb-1">Notes</p>
                  <p>{order.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment */}
          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">Status</span>
                <PaymentStatusBadge status={order.paymentStatus} />
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
              <CardDescription>Update sale status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start"
                disabled={order.status === 'dispensed' || updateStatusMutation.isPending}
                onClick={() => handleUpdateStatus('dispensed')}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" /> Mark as Dispensed
              </Button>
              <Button
                variant="destructive"
                className="w-full justify-start bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                disabled={order.status === 'cancelled' || updateStatusMutation.isPending}
                onClick={() => {
                  if (confirm("Cancel this sale?")) handleUpdateStatus('cancelled');
                }}
              >
                <XCircle className="w-4 h-4 mr-2" /> Cancel Sale
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
