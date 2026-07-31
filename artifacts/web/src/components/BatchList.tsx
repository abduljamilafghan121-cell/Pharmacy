import { useState } from "react";
import { useMedicineBatches, useWriteOffBatch, type MedicineBatch } from "@/hooks/use-medicine-batches";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Layers, Plus, PackageX, Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/utils";

function authHeaders(): HeadersInit {
  let token: string | null = null;
  try { token = localStorage.getItem("pharma_token"); } catch { /* sandboxed */ }
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function isExpired(expiryDate: string | null): boolean {
  return !!expiryDate && expiryDate < today();
}

function isExpiringSoon(expiryDate: string | null): boolean {
  if (!expiryDate) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 30);
  return expiryDate >= today() && expiryDate <= cutoff.toISOString().slice(0, 10);
}

interface AddBatchForm {
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  costPrice: string;
}

interface BatchListProps {
  medicineId: number;
  medicineName: string;
}

export default function BatchList({ medicineId, medicineName }: BatchListProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: batches, isLoading } = useMedicineBatches(medicineId);
  const writeOff = useWriteOffBatch();

  const canEdit = user?.role === "admin" || user?.role === "pharmacist";

  // Write-off state
  const [writeOffBatch, setWriteOffBatch] = useState<MedicineBatch | null>(null);
  const [writeOffReason, setWriteOffReason] = useState("");

  // Add batch state
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<AddBatchForm>({ batchNumber: "", expiryDate: "", quantity: 1, costPrice: "" });

  const addBatch = useMutation({
    mutationFn: async (data: AddBatchForm) => {
      const url = `${import.meta.env.BASE_URL}api/medicines/${medicineId}/batches`
        .replace(/\/+/g, "/").replace(":/", "://");
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          batchNumber: data.batchNumber || null,
          expiryDate: data.expiryDate || null,
          quantity: data.quantity,
          costPrice: data.costPrice || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to add batch");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medicine-batches", medicineId] });
      queryClient.invalidateQueries({ queryKey: [`/api/medicines/${medicineId}`] });
      toast({ title: "Batch added successfully" });
      setAddOpen(false);
      setForm({ batchNumber: "", expiryDate: "", quantity: 1, costPrice: "" });
    },
    onError: (err: Error) => toast({ title: "Failed to add batch", description: err.message, variant: "destructive" }),
  });

  const handleWriteOff = () => {
    if (!writeOffBatch || !writeOffReason.trim()) return;
    writeOff.mutate(
      { medicineId, batchId: writeOffBatch.id, reason: writeOffReason.trim() },
      {
        onSuccess: () => {
          toast({ title: `Batch written off` });
          setWriteOffBatch(null);
          setWriteOffReason("");
        },
        onError: (err: Error) => toast({ title: "Write-off failed", description: err.message, variant: "destructive" }),
      }
    );
  };

  const activeBatches = (batches ?? []).filter((b) => b.quantity > 0 && !b.writeOffAt);
  const emptyOrWrittenOff = (batches ?? []).filter((b) => b.quantity === 0 || b.writeOffAt);

  return (
    <Card>
      <CardHeader className="border-b border-border pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers size={18} className="text-primary" />
          Stock Batches (Lots)
          {batches && batches.length > 0 && (
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {activeBatches.length} active lot{activeBatches.length !== 1 ? "s" : ""}
            </span>
          )}
          {canEdit && (
            <Button size="sm" variant="outline" className="ml-2 h-7 text-xs" onClick={() => setAddOpen(true)}>
              <Plus size={13} className="mr-1" /> Add Batch
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Loading batches…
          </div>
        ) : !batches || batches.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No batch records yet. Receive a purchase order or add a batch manually to start tracking lots.
          </p>
        ) : (
          <div className="space-y-3">
            {/* Active batches */}
            {activeBatches.map((batch) => {
              const expired = isExpired(batch.expiryDate);
              const expiringSoon = isExpiringSoon(batch.expiryDate);
              return (
                <div
                  key={batch.id}
                  className={`rounded-lg border p-3 flex items-start justify-between gap-3 ${
                    expired
                      ? "border-destructive/30 bg-destructive/5"
                      : expiringSoon
                      ? "border-amber-300/60 bg-amber-50/40"
                      : "border-border bg-background"
                  }`}
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">
                        {batch.batchNumber ? `Batch ${batch.batchNumber}` : "Batch #" + batch.id}
                      </span>
                      {expired && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">EXPIRED</Badge>
                      )}
                      {!expired && expiringSoon && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-amber-500 hover:bg-amber-500">EXPIRING SOON</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      <span>
                        <span className="font-medium text-foreground">{batch.quantity.toLocaleString()}</span> units remaining
                      </span>
                      {batch.expiryDate && (
                        <span>
                          Expires{" "}
                          <span className={`font-medium ${expired ? "text-destructive" : expiringSoon ? "text-amber-700" : "text-foreground"}`}>
                            {new Date(`${batch.expiryDate}T00:00:00`).toLocaleDateString()}
                          </span>
                        </span>
                      )}
                      {batch.costPrice && (
                        <span>Cost {formatCurrency(parseFloat(batch.costPrice))}/unit</span>
                      )}
                      <span>Received {new Date(batch.receivedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {canEdit && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      title="Write off this batch"
                      onClick={() => { setWriteOffBatch(batch); setWriteOffReason(""); }}
                    >
                      <PackageX size={14} />
                    </Button>
                  )}
                </div>
              );
            })}

            {/* Written off / empty */}
            {emptyOrWrittenOff.length > 0 && (
              <details className="mt-2">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
                  {emptyOrWrittenOff.length} depleted / written-off lot{emptyOrWrittenOff.length !== 1 ? "s" : ""}
                </summary>
                <div className="space-y-2 mt-2">
                  {emptyOrWrittenOff.map((batch) => (
                    <div key={batch.id} className="rounded-lg border border-border/50 bg-muted/30 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {batch.batchNumber ? `Batch ${batch.batchNumber}` : "Batch #" + batch.id}
                        </span>
                        {batch.writeOffAt && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">WRITTEN OFF</Badge>
                        )}
                      </div>
                      {batch.writeOffReason && (
                        <p className="text-xs text-muted-foreground mt-1">Reason: {batch.writeOffReason}</p>
                      )}
                      {batch.expiryDate && (
                        <p className="text-xs text-muted-foreground">
                          Expired {new Date(`${batch.expiryDate}T00:00:00`).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </CardContent>

      {/* Add batch dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Add Stock Batch — {medicineName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Batch / Lot Number</Label>
                <Input
                  placeholder="e.g. BX-2024-001"
                  value={form.batchNumber}
                  onChange={(e) => setForm((f) => ({ ...f, batchNumber: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Expiry Date</Label>
                <Input
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quantity (base units) <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  min={1}
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: Math.max(1, parseInt(e.target.value) || 1) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cost Price / base unit</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="0.00"
                  value={form.costPrice}
                  onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button
                className="flex-1"
                disabled={addBatch.isPending || form.quantity < 1}
                onClick={() => addBatch.mutate(form)}
              >
                {addBatch.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Batch
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Write-off confirmation dialog */}
      <Dialog open={!!writeOffBatch} onOpenChange={(open) => !open && setWriteOffBatch(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-destructive" />
              Write Off Batch
            </DialogTitle>
          </DialogHeader>
          {writeOffBatch && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                This will write off <span className="font-semibold text-foreground">{writeOffBatch.quantity} units</span> from{" "}
                {writeOffBatch.batchNumber ? `batch ${writeOffBatch.batchNumber}` : `batch #${writeOffBatch.id}`}.
                This cannot be undone.
              </p>
              <div className="space-y-1.5">
                <Label>Reason <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g. Expired, damaged, contaminated…"
                  value={writeOffReason}
                  onChange={(e) => setWriteOffReason(e.target.value)}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setWriteOffBatch(null)}>Cancel</Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleWriteOff}
                  disabled={writeOff.isPending || !writeOffReason.trim()}
                >
                  {writeOff.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Write Off
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
