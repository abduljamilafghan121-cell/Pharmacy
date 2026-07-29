import { useState } from "react";
import {
  getGetSupplierLedgerQueryKey,
  getListSupplierLedgerQueryKey,
  useCreateSupplierPayment,
  useGetSupplierLedger,
  useListSupplierLedger,
  useListSuppliers,
  type SupplierLedgerSummary,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorState } from "@/components/ui/error-state";
import { getErrorMessage } from "@/lib/errors";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import {
  BookOpen,
  ChevronRight,
  CreditCard,
  Loader2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function SupplierLedger() {
  const { data: summaries, isLoading, isError, error, refetch } = useListSupplierLedger();
  const { data: suppliers } = useListSuppliers();
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payForSupplierId, setPayForSupplierId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const detailQuery = useGetSupplierLedger(selectedSupplierId ?? 0, {
    query: {
      enabled: selectedSupplierId !== null,
      queryKey: getGetSupplierLedgerQueryKey(selectedSupplierId ?? 0),
    },
  });

  const payMutation = useCreateSupplierPayment({
    mutation: {
      onSuccess: (payment) => {
        toast({ title: `Payment of ${formatCurrency(payment.amount)} recorded.` });
        queryClient.invalidateQueries({ queryKey: getListSupplierLedgerQueryKey() });
        if (selectedSupplierId) {
          queryClient.invalidateQueries({ queryKey: getGetSupplierLedgerQueryKey(selectedSupplierId) });
        }
        setPayOpen(false);
      },
      onError: (err) => {
        toast({
          title: "Couldn't record payment",
          description: getErrorMessage(err),
          variant: "destructive",
        });
      },
    },
  });

  function handlePay(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!payForSupplierId) return;
    const fd = new FormData(e.currentTarget);
    const purchaseOrderIdRaw = fd.get("purchaseOrderId") as string;
    payMutation.mutate({
      data: {
        supplierId: payForSupplierId,
        purchaseOrderId: purchaseOrderIdRaw ? Number(purchaseOrderIdRaw) : null,
        amount: (fd.get("amount") as string).trim(),
        method: fd.get("method") as "cash" | "bank" | "cheque" | "transfer",
        note: (fd.get("note") as string).trim() || null,
      },
    });
  }

  function openPayDialog(supplierId: number) {
    setPayForSupplierId(supplierId);
    setPayOpen(true);
  }

  const payForSupplierName = suppliers?.find((s) => s.id === payForSupplierId)?.name ?? "";
  const balanceClass = (balance: string) => parseFloat(balance) > 0 ? "text-destructive" : "text-green-600";

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <BookOpen className="h-5 w-5" />
            <span className="text-sm font-semibold uppercase tracking-wider">Finance</span>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">Supplier Ledger</h1>
          <p className="mt-1 text-muted-foreground">
            Track purchase orders, payments, and outstanding balances for each supplier.
          </p>
        </div>
      </div>

      {/* Summary cards */}
      {!isLoading && !isError && summaries && summaries.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard
            label="Total Ordered"
            icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
            value={formatCurrency(
              summaries.reduce((sum, s) => sum + parseFloat(s.totalOrdered), 0).toFixed(2)
            )}
          />
          <SummaryCard
            label="Total Paid"
            icon={<CreditCard className="h-4 w-4 text-muted-foreground" />}
            value={formatCurrency(
              summaries.reduce((sum, s) => sum + parseFloat(s.totalPaid), 0).toFixed(2)
            )}
            valueClass="text-green-600"
          />
          <SummaryCard
            label="Outstanding Balance"
            icon={<Wallet className="h-4 w-4 text-muted-foreground" />}
            value={formatCurrency(
              summaries.reduce((sum, s) => sum + parseFloat(s.balance), 0).toFixed(2)
            )}
            valueClass="text-destructive"
          />
        </div>
      )}

      {/* Supplier list */}
      {isError ? (
        <ErrorState
          title="Failed to load ledger"
          message={getErrorMessage(error)}
          onRetry={() => refetch()}
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Total Ordered</TableHead>
                  <TableHead className="text-right">Total Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Loading ledger…
                    </TableCell>
                  </TableRow>
                ) : summaries?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-14 text-center text-muted-foreground">
                      <BookOpen className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
                      <p className="font-medium">No suppliers yet</p>
                      <p className="mt-1 text-sm">Add a supplier and create purchase orders to see the ledger.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  summaries?.map((s) => (
                    <SupplierRow
                      key={s.supplierId}
                      summary={s}
                      onView={() => setSelectedSupplierId(s.supplierId)}
                      onPay={() => openPayDialog(s.supplierId)}
                      balanceClass={balanceClass(s.balance)}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Detail dialog */}
      <Dialog
        open={selectedSupplierId !== null}
        onOpenChange={(open) => !open && setSelectedSupplierId(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {detailQuery.data?.supplierName ?? "Supplier Ledger"}
            </DialogTitle>
            <DialogDescription>
              Complete transaction history — purchase orders (debits) and payments (credits).
            </DialogDescription>
          </DialogHeader>

          {detailQuery.isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading ledger…
            </div>
          ) : detailQuery.data ? (
            <div className="space-y-4">
              {/* Totals strip */}
              <div className="grid grid-cols-3 gap-3 rounded-lg bg-muted/40 p-4 text-center text-sm">
                <div>
                  <p className="text-muted-foreground">Ordered</p>
                  <p className="mt-0.5 font-semibold">{formatCurrency(detailQuery.data.totalOrdered)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Paid</p>
                  <p className="mt-0.5 font-semibold text-green-600">{formatCurrency(detailQuery.data.totalPaid)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Balance</p>
                  <p className={cn("mt-0.5 font-semibold", balanceClass(detailQuery.data.balance))}>
                    {formatCurrency(detailQuery.data.balance)}
                  </p>
                </div>
              </div>

              {/* Contact info */}
              {(detailQuery.data.contactName || detailQuery.data.email || detailQuery.data.phone) && (
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  {detailQuery.data.contactName && <span>Contact: <strong>{detailQuery.data.contactName}</strong></span>}
                  {detailQuery.data.email && <span>Email: <strong>{detailQuery.data.email}</strong></span>}
                  {detailQuery.data.phone && <span>Phone: <strong>{detailQuery.data.phone}</strong></span>}
                </div>
              )}

              {/* Ledger entries */}
              <div className="max-h-[360px] overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 sticky top-0">
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailQuery.data.entries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6 text-center text-muted-foreground text-sm">
                          No transactions yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      detailQuery.data.entries.map((entry) => (
                        <TableRow key={`${entry.entryType}-${entry.id}`}>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatDate(entry.date)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={entry.entryType === "purchase_order" ? "warning" : "success"}
                                className="text-[10px] uppercase"
                              >
                                {entry.entryType === "purchase_order" ? "PO" : "PMT"}
                              </Badge>
                              <span className="text-sm">{entry.description}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm text-destructive">
                            {parseFloat(entry.debit) > 0 ? formatCurrency(entry.debit) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm text-green-600">
                            {parseFloat(entry.credit) > 0 ? formatCurrency(entry.credit) : "—"}
                          </TableCell>
                          <TableCell className={cn("text-right font-medium text-sm", balanceClass(entry.runningBalance))}>
                            {formatCurrency(entry.runningBalance)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end">
                <Button onClick={() => { openPayDialog(detailQuery.data!.supplierId); setSelectedSupplierId(null); }}>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Record Payment
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Pay dialog */}
      <Dialog open={payOpen} onOpenChange={(open) => { setPayOpen(open); if (!open) setPayForSupplierId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment to {payForSupplierName}</DialogTitle>
            <DialogDescription>
              Enter the payment details. This will be credited against the supplier's balance.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePay} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pay-amount">Amount *</Label>
              <Input
                id="pay-amount"
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-method">Payment Method *</Label>
              <select
                id="pay-method"
                name="method"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              >
                <option value="cash">Cash</option>
                <option value="bank">Bank Transfer</option>
                <option value="cheque">Cheque</option>
                <option value="transfer">Online Transfer</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-po">Purchase Order # (optional)</Label>
              <Input
                id="pay-po"
                name="purchaseOrderId"
                type="number"
                min="1"
                placeholder="Link to a specific PO (leave blank for general payment)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-note">Note (optional)</Label>
              <Input id="pay-note" name="note" placeholder="Cheque no., reference, etc." />
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={payMutation.isPending}>
                {payMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Record Payment
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  label,
  icon,
  value,
  valueClass,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={cn("mt-1 text-2xl font-bold", valueClass)}>{value}</p>
        </div>
        {icon}
      </CardContent>
    </Card>
  );
}

function SupplierRow({
  summary,
  onView,
  onPay,
  balanceClass,
}: {
  summary: SupplierLedgerSummary;
  onView: () => void;
  onPay: () => void;
  balanceClass: string;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">{summary.supplierName}</TableCell>
      <TableCell className="text-right">{formatCurrency(summary.totalOrdered)}</TableCell>
      <TableCell className="text-right text-green-600">{formatCurrency(summary.totalPaid)}</TableCell>
      <TableCell className={cn("text-right font-semibold", balanceClass)}>
        {formatCurrency(summary.balance)}
        {parseFloat(summary.balance) > 0 && (
          <TrendingDown className="ml-1 inline h-3.5 w-3.5" />
        )}
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onView}>
            <ChevronRight className="mr-1 h-4 w-4" />
            View
          </Button>
          <Button size="sm" onClick={onPay}>
            <CreditCard className="mr-1 h-4 w-4" />
            Pay
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
