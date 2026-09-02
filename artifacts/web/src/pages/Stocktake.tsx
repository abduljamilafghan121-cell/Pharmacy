import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Loader2, Plus, ArrowLeft, CheckCircle2, ClipboardList, AlertTriangle } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";

function getAuthHeaders(): HeadersInit {
  // Session auth rides on the httpOnly cookie — no Authorization header needed.
  return { "Content-Type": "application/json" };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const url = `${base}/api${path}`;
  const res = await fetch(url, { ...init, headers: { ...getAuthHeaders(), ...init?.headers } });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

interface StocktakeSummary {
  id: number;
  reference: string;
  status: "in_progress" | "finalized";
  notes: string | null;
  createdByName: string | null;
  finalizedAt: string | null;
  createdAt: string;
}

interface StocktakeItem {
  id: number;
  stocktakeId: number;
  medicineId: number;
  medicineName: string;
  systemQuantity: number;
  countedQuantity: number | null;
  notes: string | null;
}

interface StocktakeDetail extends StocktakeSummary {
  items: StocktakeItem[];
}

function StatusBadge({ status }: { status: StocktakeSummary["status"] }) {
  if (status === "finalized") {
    return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 border">Finalized</Badge>;
  }
  return <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 border">In Progress</Badge>;
}

function varianceClass(variance: number | null) {
  if (variance == null) return "";
  if (variance === 0) return "text-emerald-600";
  if (variance > 0) return "text-blue-600";
  return "text-rose-600";
}

function varianceLabel(variance: number | null) {
  if (variance == null) return "—";
  if (variance === 0) return "✓ 0";
  return variance > 0 ? `+${variance}` : `${variance}`;
}

export default function Stocktake() {
  const { toast } = useToast();

  // List view state
  const [stocktakes, setStocktakes] = useState<StocktakeSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [newRef, setNewRef] = useState("");
  const [creating, setCreating] = useState(false);

  // Detail view state
  const [selected, setSelected] = useState<StocktakeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Per-item pending edits (not yet saved)
  const [pendingCounts, setPendingCounts] = useState<Record<number, string>>({});
  const [savingItem, setSavingItem] = useState<number | null>(null);

  // Finalize confirmation dialog
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  // Filter
  const [search, setSearch] = useState("");

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const data = await apiFetch<StocktakeSummary[]>("/stocktakes");
      setStocktakes(data);
    } catch (err: any) {
      toast({ title: "Failed to load stocktakes", description: err.message, variant: "destructive" });
    } finally {
      setListLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadList(); }, [loadList]);

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    setSelected(null);
    setPendingCounts({});
    try {
      const data = await apiFetch<StocktakeDetail>(`/stocktakes/${id}`);
      setSelected(data);
    } catch (err: any) {
      toast({ title: "Failed to load stocktake", description: err.message, variant: "destructive" });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const st = await apiFetch<StocktakeSummary>("/stocktakes", {
        method: "POST",
        body: JSON.stringify({ reference: newRef.trim() || undefined }),
      });
      toast({ title: `Stocktake ${st.reference} started`, description: "Enter physical counts for each medicine." });
      setCreateOpen(false);
      setNewRef("");
      await loadList();
      openDetail(st.id);
    } catch (err: any) {
      toast({ title: "Failed to create stocktake", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const saveItem = async (item: StocktakeItem, rawValue: string) => {
    const parsed = rawValue.trim() === "" ? null : parseInt(rawValue, 10);
    if (parsed !== null && (isNaN(parsed) || parsed < 0)) return;
    setSavingItem(item.id);
    try {
      const updated = await apiFetch<StocktakeItem>(`/stocktakes/${selected!.id}/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ countedQuantity: parsed }),
      });
      setSelected(prev => prev ? {
        ...prev,
        items: prev.items.map(i => i.id === updated.id ? updated : i),
      } : prev);
      setPendingCounts(prev => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingItem(null);
    }
  };

  const handleFinalize = async () => {
    if (!selected) return;
    setFinalizing(true);
    try {
      const result = await apiFetch<{ message: string; adjustments: number }>(`/stocktakes/${selected.id}/finalize`, { method: "POST" });
      toast({ title: "Stocktake finalized", description: `${result.adjustments} stock adjustment${result.adjustments !== 1 ? "s" : ""} applied.` });
      setFinalizeOpen(false);
      await openDetail(selected.id);
      loadList();
    } catch (err: any) {
      toast({ title: "Finalize failed", description: err.message, variant: "destructive" });
    } finally {
      setFinalizing(false);
    }
  };

  const filteredItems = selected?.items.filter(i =>
    !search || i.medicineName.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const uncountedCount = selected?.items.filter(i => i.countedQuantity == null).length ?? 0;
  const discrepancyCount = selected?.items.filter(i => i.countedQuantity != null && i.countedQuantity !== i.systemQuantity).length ?? 0;

  // ── Detail view ──────────────────────────────────────────────────────────
  if (detailLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="animate-spin mr-2" size={20} /> Loading stocktake…
      </div>
    );
  }

  if (selected) {
    const isFinalized = selected.status === "finalized";
    return (
      <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-200">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" className="-ml-3" onClick={() => setSelected(null)}>
              <ArrowLeft size={16} className="mr-1" /> Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                {selected.reference}
                <StatusBadge status={selected.status} />
              </h1>
              <p className="text-sm text-muted-foreground">
                Started {formatDate(selected.createdAt)}
                {selected.finalizedAt && ` · Finalized ${formatDate(selected.finalizedAt)}`}
              </p>
            </div>
          </div>
          {!isFinalized && (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setFinalizeOpen(true)}
            >
              <CheckCircle2 size={16} className="mr-2" />
              Finalize & Apply Adjustments
            </Button>
          )}
        </div>

        {!isFinalized && (
          <div className="flex gap-3 flex-wrap text-sm">
            <div className="bg-muted/50 rounded-lg px-4 py-2">
              <span className="text-muted-foreground">Total items: </span>
              <span className="font-semibold">{selected.items.length}</span>
            </div>
            <div className="bg-amber-500/10 text-amber-700 rounded-lg px-4 py-2">
              <span>Uncounted: </span>
              <span className="font-semibold">{uncountedCount}</span>
            </div>
            {discrepancyCount > 0 && (
              <div className="bg-rose-500/10 text-rose-700 rounded-lg px-4 py-2 flex items-center gap-1">
                <AlertTriangle size={13} />
                <span>Discrepancies: </span>
                <span className="font-semibold">{discrepancyCount}</span>
              </div>
            )}
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <Input
                placeholder="Search medicines…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs h-8"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Medicine</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground w-32">System Qty</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground w-36">
                      {isFinalized ? "Counted Qty" : "Count (physical)"}
                    </th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground w-28">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const pendingVal = pendingCounts[item.id];
                    const displayVal = pendingVal !== undefined ? pendingVal : (item.countedQuantity?.toString() ?? "");
                    const variance = item.countedQuantity != null ? item.countedQuantity - item.systemQuantity : null;
                    const hasDiscrepancy = variance != null && variance !== 0;

                    return (
                      <tr
                        key={item.id}
                        className={`border-b border-border last:border-0 transition-colors ${hasDiscrepancy ? "bg-amber-500/5 hover:bg-amber-500/10" : "hover:bg-muted/30"}`}
                      >
                        <td className="px-4 py-2.5">
                          <span className={hasDiscrepancy ? "font-medium" : ""}>{item.medicineName}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                          {item.systemQuantity}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {isFinalized ? (
                            <span className="font-mono">{item.countedQuantity ?? "—"}</span>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              {savingItem === item.id && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
                              <Input
                                type="number"
                                min={0}
                                value={displayVal}
                                placeholder="—"
                                className="h-7 w-24 text-right font-mono text-sm p-1"
                                onChange={(e) => setPendingCounts(prev => ({ ...prev, [item.id]: e.target.value }))}
                                onBlur={() => {
                                  if (pendingVal !== undefined) {
                                    saveItem(item, pendingVal);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && pendingVal !== undefined) {
                                    (e.target as HTMLInputElement).blur();
                                  }
                                }}
                              />
                            </div>
                          )}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono font-semibold ${varianceClass(variance)}`}>
                          {varianceLabel(variance)}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">
                        No medicines found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Finalize dialog */}
        <AlertDialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Finalize stocktake?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <p>This will apply all counted quantities to the live inventory:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>{discrepancyCount} medicine{discrepancyCount !== 1 ? "s" : ""} will have stock adjusted</li>
                    <li>{uncountedCount} uncounted item{uncountedCount !== 1 ? "s" : ""} will be left unchanged</li>
                    <li>The stocktake will be locked and cannot be edited</li>
                  </ul>
                  {uncountedCount > 0 && (
                    <p className="text-amber-700 font-medium">⚠ {uncountedCount} item{uncountedCount !== 1 ? "s" : ""} still uncounted — they won't be adjusted.</p>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={handleFinalize}
                disabled={finalizing}
              >
                {finalizing ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                Finalize & Apply
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-200">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stocktake</h1>
          <p className="text-muted-foreground mt-1">Physical count vs system — reconcile discrepancies.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={16} className="mr-2" /> Start New Count
        </Button>
      </div>

      {listLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="animate-spin mr-2" size={18} /> Loading…
        </div>
      ) : stocktakes.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <ClipboardList size={36} className="mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground">No stocktakes yet.</p>
            <Button variant="outline" onClick={() => setCreateOpen(true)}>Start your first count</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Reference</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Started by</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {stocktakes.map((st) => (
                  <tr key={st.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{st.reference}</td>
                    <td className="px-4 py-3"><StatusBadge status={st.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{st.createdByName ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(st.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => openDetail(st.id)}>
                        {st.status === "in_progress" ? "Continue →" : "View →"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Create dialog */}
      <AlertDialog open={createOpen} onOpenChange={setCreateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start new stocktake</AlertDialogTitle>
            <AlertDialogDescription>
              A snapshot of all medicine quantities will be taken now. Enter a reference name or leave blank to auto-generate one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Input
              placeholder="e.g. Monthly Count Jul 2026 (optional)"
              value={newRef}
              onChange={(e) => setNewRef(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !creating) handleCreate(); }}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              Start Count
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
