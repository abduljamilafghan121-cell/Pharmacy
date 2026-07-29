import { useState } from "react";
import { useRoute } from "wouter";
import { useGetMedicine, useDeleteMedicine } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pill, ArrowLeft, Trash2, Info, AlertTriangle, CalendarClock, PackageX, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { Link } from "wouter";

function authHeaders(): HeadersInit {
  let token: string | null = null;
  try { token = localStorage.getItem("pharma_token"); } catch { /* sandboxed */ }
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function MedicineDetail() {
  const [, params] = useRoute("/medicines/:id");
  const id = Number(params?.id);
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [writeOffQty, setWriteOffQty] = useState(1);
  const [writeOffReason, setWriteOffReason] = useState("");
  const [writeOffPending, setWriteOffPending] = useState(false);

  const { data: medicine, isLoading } = useGetMedicine(id, {
    query: { enabled: !!id } as any
  });

  const deleteMutation = useDeleteMedicine({
    mutation: {
      onSuccess: () => {
        toast({ title: "Medicine deleted" });
        queryClient.invalidateQueries({ queryKey: ['/api/medicines'] });
        setLocation("/medicines");
      },
      onError: () => toast({ title: "Couldn't delete medicine", description: "Something went wrong. Please try again.", variant: "destructive" }),
    }
  });

  async function handleWriteOff() {
    if (!writeOffReason.trim()) { toast({ title: "Please enter a reason", variant: "destructive" }); return; }
    setWriteOffPending(true);
    try {
      const base = `${import.meta.env.BASE_URL}api/medicines/${id}/write-off`.replace(/\/+/g, "/").replace(":/", "://");
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ quantity: writeOffQty, reason: writeOffReason.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Write-off failed");
      toast({ title: `${writeOffQty} unit(s) written off from ${medicine?.name}` });
      queryClient.invalidateQueries({ queryKey: ['/api/medicines'] });
      setWriteOffOpen(false);
      setWriteOffQty(1);
      setWriteOffReason("");
    } catch (err: any) {
      toast({ title: "Write-off failed", description: err.message ?? "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setWriteOffPending(false);
    }
  }

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
            <div className="flex flex-col gap-2">
              {/* Write-off expired/damaged stock */}
              {medicine.quantity > 0 && (
                <Button
                  variant="outline"
                  className="border-amber-500/40 text-amber-700 hover:bg-amber-500/10"
                  onClick={() => setWriteOffOpen(true)}
                >
                  <PackageX className="w-4 h-4 mr-2" />
                  Write Off Stock
                </Button>
              )}
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
            </div>
          )}

          {/* Write-off dialog */}
          <Dialog open={writeOffOpen} onOpenChange={setWriteOffOpen}>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                <DialogTitle>Write Off Stock — {medicine.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Quantity to write off <span className="text-muted-foreground font-normal">(max {medicine.quantity})</span></Label>
                  <Input type="number" min={1} max={medicine.quantity} value={writeOffQty}
                    onChange={(e) => setWriteOffQty(Math.min(medicine.quantity, Math.max(1, parseInt(e.target.value) || 1)))} />
                </div>
                <div className="space-y-2">
                  <Label>Reason <span className="text-destructive">*</span></Label>
                  <Input placeholder="e.g. Expired, damaged, contaminated…" value={writeOffReason}
                    onChange={(e) => setWriteOffReason(e.target.value)} />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" className="flex-1" onClick={() => setWriteOffOpen(false)}>Cancel</Button>
                  <Button variant="destructive" className="flex-1" onClick={handleWriteOff} disabled={writeOffPending}>
                    {writeOffPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirm Write-Off
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
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
            <p className="text-xs text-muted-foreground mb-1">Batch Number</p>
            <p className="font-medium">{medicine.batchNumber}</p>
          </CardContent></Card>
        )}
        {medicine.expiryDate && (
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Expiry Date</p>
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
    </div>
  );
}
