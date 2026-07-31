import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Undo2, Truck, Plus, Trash2, Loader2, PackageSearch, Search } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { useListSuppliers } from "@workspace/api-client-react";
import { useListSupplierReturns, useCreateSupplierReturn, type SupplierReturn } from "@/hooks/use-tier5";
import { useMedicineBatches, type MedicineBatch } from "@/hooks/use-medicine-batches";

// ── Auth helpers ──────────────────────────────────────────────────────────────

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("pharma_token");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...authHeaders(), ...init?.headers } });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface MedicineOption {
  id: number;
  name: string;
  genericName?: string | null;
  strength?: string | null;
  quantity: number;
}

interface ReturnLineItem {
  key: number;
  medicineId: number | null;
  medicineBatchId: number | null;
  quantity: number;
  unitCost: string;
}

// ── Medicine search component ─────────────────────────────────────────────────

function MedicineSearch({
  value,
  onChange,
}: {
  value: MedicineOption | null;
  onChange: (m: MedicineOption | null) => void;
}) {
  const [query, setQuery] = useState(value ? `${value.name}${value.strength ? ` ${value.strength}` : ""}` : "");
  const [results, setResults] = useState<MedicineOption[]>([]);
  const [open, setOpen] = useState(false);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    try {
      // No `limit` param — with limit present the backend returns { data, total }
      // (paginated envelope); without it, we get a plain array (up to 50).
      const raw = await apiFetch<MedicineOption[] | { data: MedicineOption[] }>(
        `/api/medicines?search=${encodeURIComponent(q)}`
      );
      const data = Array.isArray(raw) ? raw : raw.data;
      setResults(data.slice(0, 10));
      setOpen(data.length > 0);
    } catch {
      setResults([]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { if (!value) search(query); }, 300);
    return () => clearTimeout(t);
  }, [query, search, value]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          className="pl-8 h-9 text-sm"
          placeholder="Search medicine…"
          value={value ? `${value.name}${value.strength ? ` ${value.strength}` : ""}` : query}
          onChange={e => { onChange(null); setQuery(e.target.value); }}
          onFocus={() => { if (results.length && !value) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full mt-0.5 w-full rounded-md border border-border bg-popover shadow-md max-h-48 overflow-y-auto">
          {results.map(m => (
            <button
              key={m.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
              onMouseDown={() => { onChange(m); setQuery(""); setOpen(false); }}
            >
              <span className="font-medium">{m.name}</span>
              {m.strength && <span className="ml-1 text-muted-foreground text-xs">{m.strength}</span>}
              <span className="ml-2 text-xs text-muted-foreground">{m.quantity} in stock</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Batch picker row ──────────────────────────────────────────────────────────

function BatchRow({
  item,
  index,
  onUpdate,
  onRemove,
}: {
  item: ReturnLineItem;
  index: number;
  onUpdate: (patch: Partial<ReturnLineItem>) => void;
  onRemove: () => void;
}) {
  const [medicine, setMedicine] = useState<MedicineOption | null>(null);
  const { data: batches = [], isLoading: batchesLoading } = useMedicineBatches(medicine?.id);

  const availableBatches = batches.filter(b => b.quantity > 0 && !b.writeOffAt);

  const handleMedicineChange = (m: MedicineOption | null) => {
    setMedicine(m);
    onUpdate({ medicineId: m?.id ?? null, medicineBatchId: null, unitCost: "" });
  };

  const handleBatchChange = (batchId: number) => {
    const batch = availableBatches.find(b => b.id === batchId);
    onUpdate({
      medicineBatchId: batchId,
      unitCost: batch?.costPrice ?? "",
    });
  };

  const selectedBatch = availableBatches.find(b => b.id === item.medicineBatchId);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">Item {index + 1}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={onRemove} type="button">
          <Trash2 size={13} />
        </Button>
      </div>

      {/* Medicine search */}
      <div className="space-y-1">
        <Label className="text-xs">Medicine *</Label>
        <MedicineSearch value={medicine} onChange={handleMedicineChange} />
      </div>

      {/* Batch selection */}
      {medicine && (
        <div className="space-y-1">
          <Label className="text-xs">Batch *</Label>
          {batchesLoading ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-1">
              <Loader2 size={12} className="animate-spin" /> Loading batches…
            </div>
          ) : availableBatches.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1 italic">No stock batches available for this medicine.</p>
          ) : (
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={item.medicineBatchId ?? ""}
              onChange={e => handleBatchChange(Number(e.target.value))}
              required
            >
              <option value="">Select batch…</option>
              {availableBatches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.batchNumber ? `Batch ${b.batchNumber}` : `Batch #${b.id}`}
                  {b.expiryDate ? ` — exp ${b.expiryDate}` : ""}
                  {" "}· {b.quantity} in stock
                  {b.costPrice ? ` · cost ${formatCurrency(b.costPrice)}` : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Quantity + unit cost */}
      {item.medicineBatchId && selectedBatch && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Quantity to return *</Label>
            <Input
              type="number"
              min={1}
              max={selectedBatch.quantity}
              className="h-9 text-sm"
              placeholder={`Max ${selectedBatch.quantity}`}
              value={item.quantity || ""}
              onChange={e => onUpdate({ quantity: Math.min(Number(e.target.value), selectedBatch.quantity) })}
              required
            />
            <p className="text-[10px] text-muted-foreground">{selectedBatch.quantity} available</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Unit cost (credit value)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              className="h-9 text-sm"
              placeholder="0.00"
              value={item.unitCost}
              onChange={e => onUpdate({ unitCost: e.target.value })}
            />
            <p className="text-[10px] text-muted-foreground">Defaults to purchase cost</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Return detail dialog ──────────────────────────────────────────────────────

interface ReturnDetailItem {
  id: number;
  medicineName?: string | null;
  medicineBatchId: number;
  quantity: number;
  unitCost: string;
  lineTotal: string;
}

function ReturnDetailDialog({ ret, onClose }: { ret: SupplierReturn; onClose: () => void }) {
  const [items, setItems] = useState<ReturnDetailItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ items: ReturnDetailItem[] }>(`/api/supplier-returns/${ret.id}`)
      .then(data => setItems(data.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [ret.id]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 size={16} />
            Return #{ret.id} — {ret.supplierName ?? "Supplier"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-1">
          <div className="text-sm text-muted-foreground space-y-0.5">
            <p><span className="font-medium text-foreground">Reason:</span> {ret.reason}</p>
            <p><span className="font-medium text-foreground">Date:</span> {formatDate(ret.createdAt)}</p>
            <p><span className="font-medium text-foreground">Total credit:</span>{" "}
              <span className="text-emerald-600 font-semibold">+{formatCurrency(ret.totalAmount)}</span>
            </p>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Items returned</p>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 size={13} className="animate-spin" /> Loading…
              </div>
            ) : !items || items.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No items found.</p>
            ) : (
              <div className="space-y-2">
                {items.map(item => (
                  <div key={item.id} className="flex items-center justify-between text-sm rounded border border-border bg-muted/20 px-3 py-2">
                    <div>
                      <span className="font-medium">{item.medicineName ?? `Medicine #${item.medicineBatchId}`}</span>
                      <span className="ml-2 text-muted-foreground text-xs">batch #{item.medicineBatchId}</span>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>{item.quantity} × {formatCurrency(item.unitCost)}</p>
                      <p className="font-semibold text-foreground">{formatCurrency(item.lineTotal)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

let lineKey = 0;
function nextKey() { return ++lineKey; }

export default function SupplierReturns() {
  const { toast } = useToast();
  const { data: returns, isLoading } = useListSupplierReturns();
  const { data: suppliers = [] } = useListSuppliers();
  const createReturn = useCreateSupplierReturn();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailReturn, setDetailReturn] = useState<SupplierReturn | null>(null);

  // Form state
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<ReturnLineItem[]>([
    { key: nextKey(), medicineId: null, medicineBatchId: null, quantity: 1, unitCost: "" },
  ]);

  const addLine = () => {
    setLines(prev => [...prev, { key: nextKey(), medicineId: null, medicineBatchId: null, quantity: 1, unitCost: "" }]);
  };

  const updateLine = (key: number, patch: Partial<ReturnLineItem>) => {
    setLines(prev => prev.map(l => l.key === key ? { ...l, ...patch } : l));
  };

  const removeLine = (key: number) => {
    setLines(prev => prev.filter(l => l.key !== key));
  };

  const resetForm = () => {
    setSupplierId("");
    setReason("");
    setLines([{ key: nextKey(), medicineId: null, medicineBatchId: null, quantity: 1, unitCost: "" }]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) return;

    const readyLines = lines.filter(l => l.medicineId && l.medicineBatchId && l.quantity > 0);
    if (readyLines.length === 0) {
      toast({ title: "Add at least one item with a batch and quantity", variant: "destructive" });
      return;
    }

    createReturn.mutate(
      {
        supplierId: Number(supplierId),
        reason: reason.trim(),
        items: readyLines.map(l => ({
          medicineId: l.medicineId!,
          medicineBatchId: l.medicineBatchId!,
          quantity: l.quantity,
          ...(l.unitCost ? { unitCost: parseFloat(l.unitCost) } : {}),
        })),
      },
      {
        onSuccess: (result) => {
          toast({
            title: "Supplier return recorded",
            description: `Credit of ${formatCurrency(result.totalAmount)} applied to supplier ledger.`,
          });
          resetForm();
          setDialogOpen(false);
        },
        onError: (err) => {
          toast({
            title: "Couldn't process return",
            description: err.message,
            variant: "destructive",
          });
        },
      }
    );
  };

  const isFormValid = supplierId && reason.trim() && lines.some(l => l.medicineBatchId && l.quantity > 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Undo2 className="w-7 h-7 text-primary" /> Supplier Returns
          </h1>
          <p className="text-muted-foreground mt-1">
            Return stock to suppliers for credit. Credits are automatically applied to the supplier ledger.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus size={16} className="mr-2" /> New Return
        </Button>
      </div>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>Return History</CardTitle>
          <CardDescription>Most recent first. Click any row to see item details.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 divide-y divide-border">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : !returns?.length ? (
            <div className="p-10 text-center text-muted-foreground text-sm">
              <Truck className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
              <p>No supplier returns yet.</p>
              <p className="text-xs mt-1">Use the "New Return" button to process a return.</p>
            </div>
          ) : (
            returns.map(ret => (
              <button
                key={ret.id}
                className="w-full text-left p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
                onClick={() => setDetailReturn(ret)}
              >
                <div>
                  <p className="font-medium">{ret.supplierName ?? "Supplier"}</p>
                  <p className="text-sm text-muted-foreground">{ret.reason}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatDate(ret.createdAt)}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50">
                    +{formatCurrency(ret.totalAmount)} credit
                  </Badge>
                  <span className="text-xs text-muted-foreground">View →</span>
                </div>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      {/* New Return Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { resetForm(); } setDialogOpen(open); }}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageSearch size={18} /> New Supplier Return
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            {/* Supplier */}
            <div className="space-y-1.5">
              <Label>Supplier *</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={supplierId}
                onChange={e => setSupplierId(e.target.value ? Number(e.target.value) : "")}
                required
              >
                <option value="">Select supplier…</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <Label>Return reason *</Label>
              <Input
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Damaged goods, Expired stock, Wrong item delivered"
                required
              />
            </div>

            {/* Line items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Items to return *</Label>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addLine}>
                  <Plus size={12} /> Add item
                </Button>
              </div>

              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground italic py-2">No items added.</p>
              ) : (
                <div className="space-y-2">
                  {lines.map((line, index) => (
                    <BatchRow
                      key={line.key}
                      item={line}
                      index={index}
                      onUpdate={(patch) => updateLine(line.key, patch)}
                      onRemove={() => removeLine(line.key)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Submit */}
            <div className="flex gap-2 justify-end pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => { resetForm(); setDialogOpen(false); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={!isFormValid || createReturn.isPending}>
                {createReturn.isPending
                  ? <><Loader2 size={14} className="animate-spin mr-2" /> Processing…</>
                  : <><Undo2 size={14} className="mr-2" /> Submit Return</>
                }
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      {detailReturn && (
        <ReturnDetailDialog ret={detailReturn} onClose={() => setDetailReturn(null)} />
      )}
    </div>
  );
}
