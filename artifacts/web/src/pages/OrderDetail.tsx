import { useState } from "react";
import { useRoute } from "wouter";
import { useGetOrder, useUpdateOrderStatus, useCreatePayment, getGetOrderQueryKey } from "@workspace/api-client-react";
import type { PaymentInputMethod, OrderDetail, OrderItem } from "@workspace/api-client-react";
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
import { ArrowLeft, CheckCircle2, RotateCcw, User, Stethoscope, Printer, Package, BadgeCheck, Tag, AlertTriangle } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { SaleStatusBadge, PaymentStatusBadge } from "./Orders";
import { PrintableReceipt } from "@/components/PrintableReceipt";
import { printDispensingLabel } from "@/components/PrintableLabel";
import { usePharmacySettings } from "@/hooks/use-pharmacy-settings";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const PAYMENT_METHODS: { value: PaymentInputMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card / PoS" },
  { value: "insurance", label: "Insurance" },
];

// Extended fields — passed through since they're not in the generated schema yet
type OrderDetailRow = OrderDetail & {
  patientName?: string | null;
  servedByName?: string | null;
  discountAmount?: string | null;
  taxAmount?: string | null;
};
type OrderItemRow = OrderItem & { sig?: string | null };

export default function SaleDetail() {
  const [, params] = useRoute("/sales/:id");
  const id = Number(params?.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: order, isLoading } = useGetOrder(id, {
    query: { enabled: !!id, queryKey: getGetOrderQueryKey(id) },
  });
  const { data: pharmacy } = usePharmacySettings();

  const updateStatusMutation = useUpdateOrderStatus();
  const createPaymentMutation = useCreatePayment();

  // Return & Refund dialog state
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundNote, setRefundNote] = useState("");

  // Collect payment (settle an unpaid/credit sale) dialog state
  const [collectOpen, setCollectOpen] = useState(false);
  const [collectMethod, setCollectMethod] = useState<PaymentInputMethod>("cash");

  const handleCollect = () => {
    createPaymentMutation.mutate(
      { data: { orderId: id, amount: order!.total, method: collectMethod } },
      {
        onSuccess: () => {
          toast({ title: "Payment collected — sale marked as paid" });
          setCollectOpen(false);
          queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
          queryClient.invalidateQueries({ queryKey: [`/api/orders/${id}`] });
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? "Failed to collect payment";
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  };

  if (isLoading) return <div className="p-10 text-center text-muted-foreground">Loading sale…</div>;
  if (!order) return <div className="p-10 text-center text-muted-foreground">Sale not found.</div>;

  const o = order as OrderDetailRow;
  const items = (order.items ?? []) as OrderItemRow[];

  const isCancelled = order.status === "cancelled";
  const isDispensed = order.status === "dispensed";
  const isPaid = order.paymentStatus === "paid";
  const isRefunded = order.paymentStatus === "refunded";
  const isUnpaid = order.paymentStatus === "unpaid";

  const handleDispensed = () => {
    updateStatusMutation.mutate(
      { id, data: { status: "dispensed" } },
      {
        onSuccess: () => {
          toast({ title: "Sale marked as dispensed" });
          queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
          queryClient.invalidateQueries({ queryKey: [`/api/orders/${id}`] });
        },
        onError: () => toast({ title: "Couldn't update sale status", description: "Something went wrong. Please try again.", variant: "destructive" }),
      }
    );
  };

  const handleReturnRefund = () => {
    updateStatusMutation.mutate(
      // Pass refundNote as extra body field alongside status
      { id, data: { status: "cancelled", ...(refundNote.trim() ? { refundNote: refundNote.trim() } : {}) } },
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
    <PrintableReceipt order={order} />

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
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="py-3 border-b border-border last:border-0 last:pb-0"
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">{item.medicineName}</p>
                        <p className="text-sm text-muted-foreground">
                          Qty: {item.quantity}{item.unitName ? ` ${item.unitName}` : ""} × {formatCurrency(parseFloat(item.price) / item.quantity)}
                        </p>
                        {item.sig && (
                          <p className="text-xs text-primary/80 mt-1 italic">
                            ↳ {item.sig}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                          title="Print dispensing label"
                          onClick={() => printDispensingLabel(
                            {
                              patientName: o.patientName,
                              medicineName: item.medicineName ?? "",
                              sig: item.sig,
                              qty: item.quantity,
                              unitName: item.unitName,
                              dispensedDate: o.createdAt,
                            },
                            pharmacy?.name ?? "Pharmacy",
                            pharmacy?.address
                          )}
                        >
                          <Tag size={13} className="mr-1" /> Label
                        </Button>
                        <p className="font-semibold text-foreground">{formatCurrency(parseFloat(item.price))}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t border-border space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatCurrency(o.subtotal ?? order.total)}</span>
                </div>
                {!!(o.discountAmount) && parseFloat(o.discountAmount) > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Discount</span>
                    <span className="text-green-600">−{formatCurrency(o.discountAmount)}</span>
                  </div>
                )}
                {!!(o.taxAmount) && parseFloat(o.taxAmount) > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Tax</span>
                    <span>{formatCurrency(o.taxAmount)}</span>
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
                <span className="font-medium">{o.patientName || "Walk-in"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Stethoscope size={14} className="text-muted-foreground" />
                <span className="text-muted-foreground">Served by:</span>
                <span className="font-medium">{o.servedByName || "—"}</span>
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
              {isUnpaid && (
                <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-md p-3">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <span>This sale was dispensed on credit and is unpaid.</span>
                </div>
              )}
              {isUnpaid && (
                <Button
                  className="w-full justify-center"
                  onClick={() => setCollectOpen(true)}
                >
                  Collect Payment · {formatCurrency(order.total)}
                </Button>
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

      {/* Collect payment confirmation dialog for unpaid/credit sales */}
      <AlertDialog open={collectOpen} onOpenChange={setCollectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Collect Payment — {formatCurrency(order.total)}</AlertDialogTitle>
            <AlertDialogDescription>
              This sale was dispensed on credit and is currently unpaid. Choose how the customer is paying now to settle it.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-2">
            <Label htmlFor="collect-method" className="mb-2 block">Payment method</Label>
            <Select value={collectMethod} onValueChange={(v) => setCollectMethod(v as PaymentInputMethod)}>
              <SelectTrigger id="collect-method" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCollectOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleCollect}
              disabled={createPaymentMutation.isPending}
            >
              {createPaymentMutation.isPending ? "Recording…" : `Confirm ${formatCurrency(order.total)}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </>
  );
}
