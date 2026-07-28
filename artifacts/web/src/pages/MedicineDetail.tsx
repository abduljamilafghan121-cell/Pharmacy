import { useState } from "react";
import { useRoute } from "wouter";
import { useGetMedicine, useDeleteMedicine } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Pill, ArrowLeft, Trash2, Info, AlertTriangle, CalendarClock, Layers, Ban, Truck } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { Link } from "wouter";
import { useMedicineBatches, useWriteOffBatch } from "@/hooks/use-medicine-batches";
import { useCreateSupplierReturn } from "@/hooks/use-tier5";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function MedicineDetail() {
  const [, params] = useRoute("/medicines/:id");
  const id = Number(params?.id);
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: medicine, isLoading } = useGetMedicine(id, {
    query: { enabled: !!id } as any
  });
  const { data: batches } = useMedicineBatches(id);
  const writeOffMutation = useWriteOffBatch();
  const [writeOffBatch, setWriteOffBatch] = useState<any | null>(null);
  const [writeOffReason, setWriteOffReason] = useState("");
  const createSupplierReturn = useCreateSupplierReturn();
  const [returningBatch, setReturningBatch] = useState<any | null>(null);
  const [returnQty, setReturnQty] = useState(1);
  const [returnReason, setReturnReason] = useState("");
  const [returnUnitCost, setReturnUnitCost] = useState<string>("");

  const deleteMutation = useDeleteMedicine({
    mutation: {
      onSuccess: () => {
        toast({ title: "Medicine deleted" });
        queryClient.invalidateQueries({ queryKey: ['/api/medicines'] });
        setLocation("/medicines");
      },
      onError: () => toast({ title: "Delete failed", variant: "destructive" }),
    }
  });

  if (isLoading) return <div className="p-10 text-center">Loading...</div>;
  if (!medicine) return <div className="p-10 text-center">Medicine not found.</div>;

  const isOutOfStock = medicine.quantity === 0;
  const isLowStock = medicine.quantity > 0 && medicine.quantity <= 10;
  const isExpired = medicine.expiryDate && medicine.expiryDate < new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-300">
      <Button variant="ghost" className="mb-2 -ml-4" onClick={() => window.history.back()}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Back
      </Button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        {/* Image side */}
        <div className="bg-white rounded-2xl border border-border p-8 flex items-center justify-center aspect-square md:aspect-auto">
          {medicine.imageUrl ? (
            <img src={medicine.imageUrl} alt={medicine.name} className="w-full h-full object-contain mix-blend-multiply" />
          ) : (
            <div className="w-48 h-48 rounded-full bg-primary/5 flex items-center justify-center text-primary/40">
              <Pill className="w-24 h-24" />
            </div>
          )}
        </div>

        {/* Details side */}
        <div className="flex flex-col">
          <div className="mb-6">
            <div className="flex flex-wrap gap-2 mb-3">
              {medicine.categoryName && (
                <Badge variant="secondary">{medicine.categoryName}</Badge>
              )}
              {medicine.prescriptionRequired && (
                <Badge variant="outline" className="border-amber-500/50 text-amber-600 bg-amber-500/10">
                  Prescription Required
                </Badge>
              )}
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-foreground">{medicine.name}</h1>
            {medicine.genericName && (
              <p className="text-muted-foreground mt-1">{medicine.genericName}</p>
            )}
          </div>

          <div className="text-4xl font-bold text-foreground mb-6">
            {formatCurrency(parseFloat(medicine.price))}
            <span className="text-base font-normal text-muted-foreground ml-2">per unit</span>
          </div>

          {/* Stock status */}
          {isExpired ? (
            <div className="mb-6 flex items-center gap-2 rounded-xl bg-destructive/10 p-4 text-destructive">
              <CalendarClock size={18} />
              <span className="font-medium">Expired on {new Date(`${medicine.expiryDate}T00:00:00`).toLocaleDateString()} — not available for sale</span>
            </div>
          ) : isOutOfStock ? (
            <div className="flex items-center gap-2 p-4 rounded-xl bg-destructive/10 text-destructive mb-6">
              <AlertTriangle size={18} />
              <span className="font-medium">Out of Stock</span>
            </div>
          ) : isLowStock ? (
            <div className="flex items-center gap-2 p-4 rounded-xl bg-amber-500/10 text-amber-700 mb-6">
              <AlertTriangle size={18} />
              <span className="font-medium">Low Stock — {medicine.quantity} units remaining</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-4 rounded-xl bg-emerald-500/10 text-emerald-700 mb-6">
              <Info size={18} />
              <span className="font-medium">{medicine.quantity} units in stock</span>
            </div>
          )}

          {/* Quick sale link */}
          <Button size="lg" className="mb-4" asChild disabled={isExpired || isOutOfStock}>
            <Link href={`/new-sale?medicineId=${medicine.id}`}>Add to Checkout</Link>
          </Button>

          {/* Admin actions */}
          {(user?.role === "admin" || user?.role === "pharmacist") && (
            <Button
              variant="destructive"
              className="bg-destructive/10 text-destructive hover:bg-destructive hover:text-white"
              onClick={() => {
                if (confirm(`Delete "${medicine.name}"?`)) {
                  deleteMutation.mutate({ id });
                }
              }}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Medicine
            </Button>
          )}
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {medicine.manufacturer && (
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Manufacturer</p>
            <p className="font-medium">{medicine.manufacturer}</p>
          </CardContent></Card>
        )}
        {medicine.batchNumber && (
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Next Batch to Sell (FEFO)</p>
            <p className="font-medium">{medicine.batchNumber}</p>
          </CardContent></Card>
        )}
        {medicine.expiryDate && (
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Nearest Expiry</p>
            <p className="font-medium">{medicine.expiryDate}</p>
          </CardContent></Card>
        )}
        {medicine.description && (
          <Card className="md:col-span-2"><CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Description</p>
            <p className="text-sm">{medicine.description}</p>
          </CardContent></Card>
        )}
      </div>

      {/* Batch breakdown — the actual source of truth for stock, FEFO order */}
      {batches && batches.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="w-4 h-4 text-primary" />
              <h2 className="font-semibold">Stock Batches</h2>
              <span className="text-xs text-muted-foreground">(sold oldest-expiry-first)</span>
            </div>
            <div className="space-y-2">
              {batches.map((batch, idx) => {
                const isDepleted = batch.quantity === 0;
                const today = new Date().toISOString().slice(0, 10);
                const isBatchExpired = !!batch.expiryDate && batch.expiryDate < today;
                const isNearExpiry = !!batch.expiryDate && !isBatchExpired &&
                  batch.expiryDate <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
                const isNextUp = !isDepleted && batches.slice(0, idx).every(b => b.quantity === 0);

                return (
                  <div
                    key={batch.id}
                    className={`flex items-center justify-between rounded-lg border p-3 text-sm ${
                      batch.writeOffAt ? "opacity-50 border-border" :
                      isDepleted ? "opacity-40 border-border" :
                      isBatchExpired ? "border-destructive/40 bg-destructive/5" :
                      isNearExpiry ? "border-amber-400/50 bg-amber-500/5" :
                      "border-border"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-medium">
                          {batch.batchNumber ?? "No batch number"}
                          {isNextUp && (
                            <Badge variant="outline" className="ml-2 border-primary/40 text-primary text-[10px]">Next up</Badge>
                          )}
                          {batch.writeOffAt && (
                            <Badge variant="outline" className="ml-2 border-muted-foreground/40 text-muted-foreground text-[10px]">Written off</Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {batch.expiryDate
                            ? `Expires ${new Date(`${batch.expiryDate}T00:00:00`).toLocaleDateString()}`
                            : "No expiry set"}
                          {isBatchExpired && !batch.writeOffAt && <span className="text-destructive font-medium"> · Expired</span>}
                          {isNearExpiry && <span className="text-amber-600 font-medium"> · Expiring soon</span>}
                          {batch.writeOffAt && <span> · {batch.writeOffReason}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className={`font-semibold ${isDepleted ? "text-muted-foreground" : ""}`}>
                          {batch.quantity} units
                        </p>
                        {batch.costPrice && (
                          <p className="text-xs text-muted-foreground">{formatCurrency(batch.costPrice)}/unit cost</p>
                        )}
                      </div>
                      {batch.quantity > 0 && !batch.writeOffAt && (user?.role === "admin" || user?.role === "pharmacist") && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setReturningBatch(batch); setReturnReason(""); setReturnQty(batch.quantity); setReturnUnitCost(batch.costPrice ?? ""); }}
                          >
                            <Truck className="w-3.5 h-3.5 mr-1" /> Return to Supplier
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => { setWriteOffBatch(batch); setWriteOffReason(""); }}
                          >
                            <Ban className="w-3.5 h-3.5 mr-1" /> Write off
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!returningBatch} onOpenChange={(o) => !o && setReturningBatch(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Return batch {returningBatch?.batchNumber ?? ""} to supplier</DialogTitle>
          </DialogHeader>
          {returningBatch && (
            <div className="space-y-4 py-2">
              {!medicine.supplierId ? (
                <p className="text-sm text-destructive">This medicine has no supplier on record — set one before processing a return.</p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="return-qty">
                      Quantity to return <span className="text-muted-foreground font-normal">(max {returningBatch.quantity})</span>
                    </Label>
                    <Input
                      id="return-qty"
                      type="number"
                      min={1}
                      max={returningBatch.quantity}
                      value={returnQty}
                      onChange={(e) => setReturnQty(Math.max(1, Number(e.target.value) || 1))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="return-unit-cost">Unit cost credited <span className="text-muted-foreground font-normal">(per base unit)</span></Label>
                    <Input
                      id="return-unit-cost"
                      type="number"
                      min={0}
                      step="0.0001"
                      value={returnUnitCost}
                      onChange={(e) => setReturnUnitCost(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="return-reason">Reason *</Label>
                    <Textarea
                      id="return-reason"
                      placeholder="e.g. Damaged in transit, wrong item shipped, expired on arrival…"
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This removes the returned quantity from stock and credits {formatCurrency((parseFloat(returnUnitCost) || 0) * returnQty)} toward what you owe this supplier.
                  </p>
                  <Button
                    className="w-full"
                    disabled={!returnReason.trim() || createSupplierReturn.isPending}
                    onClick={() => {
                      createSupplierReturn.mutate(
                        {
                          supplierId: medicine.supplierId,
                          reason: returnReason.trim(),
                          items: [{
                            medicineId: id,
                            medicineBatchId: returningBatch.id,
                            quantity: returnQty,
                            unitCost: parseFloat(returnUnitCost) || undefined,
                          }],
                        },
                        {
                          onSuccess: (data) => {
                            toast({ title: `Returned to supplier — credited ${formatCurrency(data.totalAmount)}` });
                            setReturningBatch(null);
                          },
                          onError: (err) => toast({ title: "Return failed", description: err.message, variant: "destructive" }),
                        }
                      );
                    }}
                  >
                    {createSupplierReturn.isPending ? "Processing…" : "Confirm Return"}
                  </Button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!writeOffBatch} onOpenChange={(o) => !o && setWriteOffBatch(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Write off batch {writeOffBatch?.batchNumber ?? ""}</DialogTitle>
          </DialogHeader>
          {writeOffBatch && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                This removes <strong>{writeOffBatch.quantity} units</strong> from sellable stock permanently (e.g. expired or damaged).
                This cannot be undone.
              </p>
              <div className="space-y-2">
                <Label htmlFor="writeoff-reason">Reason *</Label>
                <Textarea
                  id="writeoff-reason"
                  placeholder="e.g. Expired, water damage, broken seal…"
                  value={writeOffReason}
                  onChange={(e) => setWriteOffReason(e.target.value)}
                  rows={3}
                />
              </div>
              <Button
                variant="destructive"
                className="w-full"
                disabled={!writeOffReason.trim() || writeOffMutation.isPending}
                onClick={() => {
                  writeOffMutation.mutate(
                    { medicineId: id, batchId: writeOffBatch.id, reason: writeOffReason.trim() },
                    {
                      onSuccess: (data) => {
                        toast({ title: `Wrote off ${data.quantityWrittenOff} units` });
                        setWriteOffBatch(null);
                      },
                      onError: (err) => toast({ title: "Write-off failed", description: err.message, variant: "destructive" }),
                    }
                  );
                }}
              >
                {writeOffMutation.isPending ? "Processing…" : "Confirm Write-off"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
