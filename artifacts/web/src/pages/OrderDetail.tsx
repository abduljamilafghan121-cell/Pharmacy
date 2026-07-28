import { useState } from "react";
import { useRoute } from "wouter";
import { useGetOrder, useUpdateOrderStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, CheckCircle2, RotateCcw, User, Stethoscope, Printer, Package, BadgeCheck } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { SaleStatusBadge, PaymentStatusBadge } from "./Orders";
import { PrintableReceipt } from "@/components/PrintableReceipt";

export default function SaleDetail() {
  const [, params] = useRoute("/sales/:id");
  const id = Number(params?.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: order, isLoading } = useGetOrder(id, {
    query: { enabled: !!id } as any,
  });

  const updateStatusMutation = useUpdateOrderStatus();

  // Return & Refund dialog state
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundNote, setRefundNote] = useState("");

  if (isLoading) return <div className="p-10 text-center text-muted-foreground">Loading sale…</div>;
  if (!order) return <div className="p-10 text-center text-muted-foreground">Sale not found.</div>;

  const isCancelled = order.status === "cancelled";
  const isDispensed = order.status === "dispensed";
  const isPaid = order.paymentStatus === "paid";
  const isRefunded = order.paymentStatus === "refunded";

  const handleDispensed = () => {
    updateStatusMutation.mutate(
      { id, data: { status: "dispensed" } },
      {
        onSuccess: () => {
          toast({ title: "Sale marked as dispensed" });
          queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
          queryClient.invalidateQueries({ queryKey: [`/api/orders/${id}`] });
        },
        onError: () => toast({ title: "Update failed", variant: "destructive" }),
      }
    );
  };

  const handleReturnRefund = () => {
    updateStatusMutation.mutate(
      // Pass refundNote as extra body field alongside status
      { id, data: { status: "cancelled", ...(refundNote.trim() ? { refundNote: refundNote.trim() } : {}) } as any },
      {
        onSuccess: () => {
          toast({ title: isPaid ? "Sale cancelled & payment refunded" : "Sale cancelled & stock restored" });
          setRefundOpen(false);
          setRefundNote("");
          queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
          queryClient.invalidateQueries({ queryKey: [`/api/orders/${id}`] });
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? "Failed to process return";
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  };

  return (
    <>
    {/* Hidden receipt — only visible when printing */}
    <PrintableReceipt order={order as any} />

    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-300 print:hidden">
      <Button variant="ghost" className="mb-2 -ml-4" onClick={() => window.history.back()}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Sales
      </Button>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            Sale #{order.id.toString().padStart(4, "0")}
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
                  <div
                    key={item.id}
                    className="flex justify-between items-center py-2 border-b border-border last:border-0 last:pb-0"
                  >
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
                  <span>{formatCurrency((order as any).subtotal ?? order.total)}</span>
                </div>
                {!!((order as any).discountAmount) && parseFloat((order as any).discountAmount) > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Discount</span>
                    <span className="text-green-600">−{formatCurrency((order as any).discountAmount)}</span>
                  </div>
                )}
                {!!((order as any).taxAmount) && parseFloat((order as any).taxAmount) > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Tax</span>
                    <span>{formatCurrency((order as any).taxAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-xl pt-1 border-t border-border">
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
                  <p className="text-muted-foreground mb-1 text-xs">Notes</p>
                  <p className="whitespace-pre-line">{order.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment */}
          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">Status</span>
                <PaymentStatusBadge status={order.paymentStatus} />
              </div>
              {isRefunded && (
                <div className="flex items-start gap-2 text-sm text-sky-700 dark:text-sky-400 bg-sky-500/10 rounded-md p-3">
                  <BadgeCheck size={15} className="mt-0.5 shrink-0" />
                  <span>Payment has been refunded to the customer.</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
              <CardDescription>Manage this sale</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!isCancelled && (
                <>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    disabled={isDispensed || updateStatusMutation.isPending}
                    onClick={handleDispensed}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Mark as Dispensed
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start border-destructive/40 text-destructive hover:bg-destructive/10"
                    disabled={updateStatusMutation.isPending}
                    onClick={() => setRefundOpen(true)}
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    {isPaid ? "Return & Refund" : "Cancel Sale"}
                  </Button>
                </>
              )}

              {isCancelled && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
                  <Package size={15} className="shrink-0" />
                  <span>This sale has been cancelled. Stock has been restored.</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Return & Refund confirmation dialog */}
      <AlertDialog open={refundOpen} onOpenChange={setRefundOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isPaid ? "Process Return & Refund" : "Cancel Sale"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>This will:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Return all items back to inventory</li>
                  {isPaid && <li>Mark the payment as <strong>refunded</strong></li>}
                  <li>Set this sale status to <strong>cancelled</strong></li>
                </ul>
                <p className="text-sm">This action cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="refund-note">
              Reason <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="refund-note"
              placeholder="e.g. Wrong medicine dispensed, patient returned items…"
              value={refundNote}
              onChange={(e) => setRefundNote(e.target.value)}
              rows={3}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRefundNote("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleReturnRefund}
              disabled={updateStatusMutation.isPending}
            >
              {updateStatusMutation.isPending
                ? "Processing…"
                : isPaid
                ? "Confirm Return & Refund"
                : "Confirm Cancellation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </>
  );
}
