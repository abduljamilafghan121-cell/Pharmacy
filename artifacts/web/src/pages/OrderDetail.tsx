import { useRoute } from "wouter";
import { useGetOrder, useUpdateOrderStatus, useCreatePayment } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, CreditCard, Box, Truck, CheckCircle2, XCircle } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { OrderStatusBadge, PaymentStatusBadge } from "./Orders";

export default function OrderDetail() {
  const [, params] = useRoute("/orders/:id");
  const id = Number(params?.id);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: order, isLoading } = useGetOrder(id, {
    query: { enabled: !!id }
  });

  const updateStatusMutation = useUpdateOrderStatus();
  const paymentMutation = useCreatePayment();

  const isAdmin = user?.role === "admin" || user?.role === "pharmacist";

  if (isLoading) return <div className="p-10 text-center">Loading order...</div>;
  if (!order) return <div className="p-10 text-center">Order not found.</div>;

  const handleUpdateStatus = (newStatus: any) => {
    updateStatusMutation.mutate({
      id,
      data: { status: newStatus }
    }, {
      onSuccess: () => {
        toast({ title: "Order status updated" });
        queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
        queryClient.invalidateQueries({ queryKey: [`/api/orders/${id}`] });
      }
    });
  };

  const handleSimulatePayment = () => {
    paymentMutation.mutate({
      data: {
        orderId: id,
        amount: order.total,
        method: 'card',
        transactionId: 'sim_' + Math.random().toString(36).slice(2, 9)
      }
    }, {
      onSuccess: () => {
        toast({ title: "Payment successful" });
        queryClient.invalidateQueries({ queryKey: [`/api/orders/${id}`] });
      }
    });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-300">
      <Button variant="ghost" className="mb-2 -ml-4" onClick={() => window.history.back()}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Orders
      </Button>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            Order #{order.id.toString().padStart(4, '0')}
            <OrderStatusBadge status={order.status} />
          </h1>
          <p className="text-muted-foreground mt-1">Placed on {formatDate(order.createdAt)}</p>
        </div>
        
        {/* Customer Payment CTA */}
        {user?.role === "customer" && order.paymentStatus === 'unpaid' && (
          <Button onClick={handleSimulatePayment} disabled={paymentMutation.isPending} size="lg">
            <CreditCard className="w-4 h-4 mr-2" /> Pay {formatCurrency(order.total)}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Order Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {order.items?.map((item) => (
                  <div key={item.id} className="flex justify-between items-center py-2 border-b border-border last:border-0 last:pb-0">
                    <div>
                      <p className="font-medium text-foreground">{item.medicineName}</p>
                      <p className="text-sm text-muted-foreground">Qty: {item.quantity} × {formatCurrency(item.price)}</p>
                    </div>
                    <div className="font-bold">
                      {formatCurrency(parseFloat(item.price) * item.quantity)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 pt-4 border-t border-border flex flex-col items-end space-y-2">
                <div className="flex justify-between w-48 text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(order.subtotal || order.total)}</span>
                </div>
                <div className="flex justify-between w-48 font-bold text-lg">
                  <span>Total</span>
                  <span className="text-primary">{formatCurrency(order.total)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <p><span className="text-muted-foreground">Name:</span> <span className="font-medium">{order.customerName}</span></p>
                <p className="flex items-center gap-2">
                  <span className="text-muted-foreground">Payment:</span> 
                  <PaymentStatusBadge status={order.paymentStatus} />
                </p>
                {order.prescriptionId && (
                  <p className="mt-2 pt-2 border-t border-border">
                    <span className="text-amber-600 font-medium flex items-center gap-1">
                      <Box className="w-4 h-4" /> Contains Rx Items
                    </span>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle>Update Status</CardTitle>
                <CardDescription>Move order through fulfillment</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    disabled={order.status === 'processing' || updateStatusMutation.isPending}
                    onClick={() => handleUpdateStatus('processing')}
                  >
                    <Box className="w-4 h-4 mr-2" /> Mark as Processing
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    disabled={order.status === 'dispensed' || updateStatusMutation.isPending}
                    onClick={() => handleUpdateStatus('dispensed')}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Mark as Dispensed
                  </Button>
                  <Button 
                    className="w-full justify-start"
                    disabled={order.status === 'delivered' || updateStatusMutation.isPending}
                    onClick={() => handleUpdateStatus('delivered')}
                  >
                    <Truck className="w-4 h-4 mr-2" /> Mark as Delivered
                  </Button>
                  <Button 
                    variant="destructive" 
                    className="w-full justify-start mt-4 bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    disabled={order.status === 'cancelled' || updateStatusMutation.isPending}
                    onClick={() => {
                      if(confirm("Cancel this order?")) handleUpdateStatus('cancelled');
                    }}
                  >
                    <XCircle className="w-4 h-4 mr-2" /> Cancel Order
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
