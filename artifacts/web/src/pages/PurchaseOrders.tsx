import { useMemo, useState, useCallback } from "react";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { Link } from "wouter";
import {
  getGetPurchaseOrderQueryKey,
  getListMedicinesQueryKey,
  getListPurchaseOrdersQueryKey,
  useCreatePurchaseOrder,
  useGetPurchaseOrder,
  useListMedicines,
  useListPurchaseOrders,
  useListSuppliers,
  useReceivePurchaseOrder,
  type Medicine,
  type MedicineUnit,
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
import { formatStockDisplay } from "@/lib/stock-format";
import { useToast } from "@/components/ui/use-toast";
import {
  ClipboardList,
  Eye,
  Loader2,
  PackageCheck,
  PackageSearch,
  Plus,
  Trash2,
  Truck,
  Scan,
  X,
} from "lucide-react";

function getMedicineUnits(medicine: Medicine): MedicineUnit[] {
  return ((medicine as any).units as MedicineUnit[]) ?? [];
}

type DraftItem = {
  key: number;
  medicineId: number;
  quantity: number;
  unitId?: number;
  unitPrice: string;
};

export default function PurchaseOrders() {
  const { data: purchaseOrders, isLoading, isError, error, refetch } =
    useListPurchaseOrders();
  const { data: suppliers } = useListSuppliers();
  const { data: medicines } = useListMedicines();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draftSupplierId, setDraftSupplierId] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([
    { key: 1, medicineId: 0, quantity: 1, unitId: undefined, unitPrice: "" },
  ]);
  const [nextKey, setNextKey] = useState(2);

  // Scan-to-receive state (per-dialog session)
  const [poScanMode, setPoScanMode] = useState(false);
  const [scannedCounts, setScannedCounts] = useState<Record<number, number>>({});
  const [poScanFlash, setPoScanFlash] = useState<string | null>(null);

  const createMutation = useCreatePurchaseOrder({
    mutation: {
      onSuccess: () => {
        toast({ title: "Purchase order created" });
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
        setCreateOpen(false);
        resetDraft();
      },
      onError: (mutationError) => {
        toast({
          title: "Could not create purchase order",
          description: getErrorMessage(mutationError),
          variant: "destructive",
        });
      },
    },
  });

  const receiveMutation = useReceivePurchaseOrder({
    mutation: {
      onSuccess: (received) => {
        toast({
          title: `Purchase order #${received.id} received.`,
          description: "Inventory quantities were updated.",
        });
        queryClient.invalidateQueries({ queryKey: getListPurchaseOrdersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListMedicinesQueryKey() });
        if (selectedId === received.id) {
          queryClient.invalidateQueries({ queryKey: getGetPurchaseOrderQueryKey(received.id) });
        }
      },
      onError: (mutationError) => {
        toast({
          title: "Could not receive purchase order",
          description: getErrorMessage(mutationError),
          variant: "destructive",
        });
      },
    },
  });

  const selectedOrder = useGetPurchaseOrder(selectedId ?? 0, {
    query: {
      enabled: selectedId !== null,
      queryKey: getGetPurchaseOrderQueryKey(selectedId ?? 0),
    },
  });

  const availableMedicines = useMemo(() => medicines ?? [], [medicines]);

  // ── Scan-to-receive barcode handler ───────────────────────────────────────
  const handlePoBarcodeScan = useCallback((barcode: string) => {
    if (!selectedOrder.data) return;
    const medicine = availableMedicines.find((m: any) => m.barcode === barcode);
    if (!medicine) {
      toast({ title: "Barcode not recognised", description: `No medicine found for: ${barcode}`, variant: "destructive" });
      return;
    }
    const poItem = (selectedOrder.data.items ?? []).find((item: any) => item.medicineId === medicine.id);
    if (!poItem) {
      toast({ title: "Not on this order", description: `${medicine.name} is not a line on this purchase order.`, variant: "destructive" });
      return;
    }
    setScannedCounts(prev => ({ ...prev, [medicine.id]: (prev[medicine.id] ?? 0) + 1 }));
    setPoScanFlash(medicine.name);
    setTimeout(() => setPoScanFlash(null), 1500);
  }, [selectedOrder.data, availableMedicines, toast]);

  useBarcodeScanner({ onScan: handlePoBarcodeScan, enabled: poScanMode });

  function resetDraft() {
    setDraftSupplierId("");
    setDraftItems([{ key: 1, medicineId: 0, quantity: 1, unitId: undefined, unitPrice: "" }]);
    setNextKey(2);
  }

  function updateDraftItem(key: number, patch: Partial<DraftItem>) {
    setDraftItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  function selectMedicine(key: number, medicineId: number) {
    const medicine = availableMedicines.find((item) => item.id === medicineId);
    const units = medicine ? getMedicineUnits(medicine) : [];
    // Default to base unit if defined
    const baseUnit = units.find((u) => u.isBaseUnit) ?? units.find((u) => u.conversionFactorToBase === 1) ?? units[0];
    updateDraftItem(key, {
      medicineId,
      unitId: baseUnit?.id,
      unitPrice: medicine?.price ?? "",
    });
  }

  function selectUnit(key: number, unitId: number | undefined, medicine: Medicine | undefined) {
    if (!medicine) return;
    const units = getMedicineUnits(medicine);
    const unit = units.find((u) => u.id === unitId);
    // Unit price = base price × conversion factor (buying in larger packs costs proportionally more)
    const unitPrice = unit
      ? (parseFloat(medicine.price) * unit.conversionFactorToBase).toFixed(2)
      : medicine.price;
    updateDraftItem(key, { unitId, unitPrice });
  }

  function addDraftItem() {
    setDraftItems((current) => [
      ...current,
      { key: nextKey, medicineId: 0, quantity: 1, unitId: undefined, unitPrice: "" },
    ]);
    setNextKey((key) => key + 1);
  }

  function removeDraftItem(key: number) {
    setDraftItems((current) =>
      current.length === 1 ? current : current.filter((item) => item.key !== key),
    );
  }

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const items = draftItems.map(({ medicineId, quantity, unitId, unitPrice }) => ({
      medicineId: Number(medicineId),
      quantity: Number(quantity),
      ...(unitId ? { unitId } : {}),
      unitPrice: String(unitPrice).trim(),
    }));

    if (!draftSupplierId || items.some((item) => !item.medicineId || item.quantity < 1 || !item.unitPrice)) {
      toast({
        title: "Complete the purchase details",
        description: "Choose a supplier, medicine, quantity, and unit price for every line.",
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate({
      data: {
        supplierId: Number(draftSupplierId),
        items: items as any,
      },
    });
  }

  function handleReceive(id: number) {
    if (window.confirm("Receive this purchase and add its quantities to inventory?")) {
      receiveMutation.mutate({ id });
    }
  }

  const noSuppliers = !suppliers?.length;
  const noMedicines = !availableMedicines.length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <ClipboardList className="h-5 w-5" />
            <span className="text-sm font-semibold uppercase tracking-wider">Inventory purchasing</span>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">Purchase Orders</h1>
          <p className="mt-1 text-muted-foreground">
            Create supplier orders, track what is pending, and receive stock into inventory.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          disabled={noSuppliers || noMedicines}
          title={
            noSuppliers
              ? "Add a supplier first"
              : noMedicines
                ? "Add a medicine first"
                : undefined
          }
        >
          <Plus className="mr-2 h-4 w-4" />
          New Purchase Order
        </Button>
      </div>

      {(noSuppliers || noMedicines) && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Truck className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="font-semibold">Set up purchasing first</p>
                <p className="text-sm text-muted-foreground">
                  {noSuppliers
                    ? "Add at least one supplier before creating a purchase order."
                    : "Add at least one medicine before adding purchase lines."}
                </p>
              </div>
            </div>
            <Button variant="outline" asChild>
              <Link href={noSuppliers ? "/suppliers" : "/medicines"}>
                {noSuppliers ? "Manage Suppliers" : "Manage Medicines"}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {isError ? (
        <ErrorState
          title="Failed to load purchase orders"
          message={getErrorMessage(error)}
          onRetry={() => refetch()}
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[100px]">PO #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      Loading purchase orders…
                    </TableCell>
                  </TableRow>
                ) : purchaseOrders?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-14 text-center text-muted-foreground">
                      <PackageSearch className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
                      <p className="font-medium">No purchase orders yet</p>
                      <p className="mt-1 text-sm">Create your first supplier order to start restocking.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  purchaseOrders?.map((purchaseOrder) => (
                    <TableRow key={purchaseOrder.id}>
                      <TableCell className="font-medium">#{purchaseOrder.id}</TableCell>
                      <TableCell>{formatDate(purchaseOrder.createdAt)}</TableCell>
                      <TableCell>{purchaseOrder.supplierName ?? "Unknown supplier"}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(purchaseOrder.total)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            purchaseOrder.status === "received"
                              ? "success"
                              : purchaseOrder.status === "cancelled"
                                ? "destructive"
                                : "warning"
                          }
                        >
                          {purchaseOrder.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedId(purchaseOrder.id)}
                          >
                            <Eye className="mr-1.5 h-4 w-4" />
                            View
                          </Button>
                          {purchaseOrder.status === "pending" && (
                            <Button
                              size="sm"
                              onClick={() => handleReceive(purchaseOrder.id)}
                              disabled={receiveMutation.isPending}
                            >
                              {receiveMutation.isPending ? (
                                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                              ) : (
                                <PackageCheck className="mr-1.5 h-4 w-4" />
                              )}
                              Receive
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create PO dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) resetDraft();
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create purchase order</DialogTitle>
            <DialogDescription>
              Select a supplier and add every medicine with quantity, packaging unit, and purchase price.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="purchase-supplier">Supplier *</Label>
              <select
                id="purchase-supplier"
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={draftSupplierId}
                onChange={(event) => setDraftSupplierId(event.target.value)}
                required
              >
                <option value="">Select a supplier</option>
                {suppliers?.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Purchase lines *</Label>
                  <p className="text-xs text-muted-foreground">Unit price is the supplier cost per selected packaging unit.</p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={addDraftItem}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add line
                </Button>
              </div>
              <div className="space-y-3">
                {draftItems.map((item, index) => {
                  const selectedMed = availableMedicines.find((m) => m.id === item.medicineId);
                  const units = selectedMed ? getMedicineUnits(selectedMed) : [];
                  const stockDisplay = selectedMed
                    ? formatStockDisplay(selectedMed.quantity, units)
                    : null;

                  return (
                    <div key={item.key} className="rounded-lg border bg-muted/20 p-3 space-y-2">
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                        <div className="space-y-2">
                          <Label htmlFor={`purchase-medicine-${item.key}`}>Medicine {index + 1}</Label>
                          <select
                            id={`purchase-medicine-${item.key}`}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={item.medicineId || ""}
                            onChange={(event) => selectMedicine(item.key, Number(event.target.value))}
                            required
                          >
                            <option value="">Select medicine</option>
                            {availableMedicines.map((medicine) => {
                              const medUnits = getMedicineUnits(medicine);
                              const stock = formatStockDisplay(medicine.quantity, medUnits);
                              return (
                                <option key={medicine.id} value={medicine.id}>
                                  {medicine.name} ({stock} in stock)
                                </option>
                              );
                            })}
                          </select>
                          {stockDisplay && selectedMed && (
                            <p className="text-xs text-muted-foreground">
                              Current stock: <span className="font-medium">{stockDisplay}</span>
                            </p>
                          )}
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => removeDraftItem(item.key)}
                          disabled={draftItems.length === 1}
                          aria-label="Remove purchase line"
                          className="mt-6"
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
                        {/* Unit selector — only shown if medicine has packaging units */}
                        {units.length > 0 && (
                          <div className="space-y-2">
                            <Label htmlFor={`purchase-unit-${item.key}`}>Packaging unit</Label>
                            <select
                              id={`purchase-unit-${item.key}`}
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              value={item.unitId ?? ""}
                              onChange={(e) => selectUnit(item.key, e.target.value ? Number(e.target.value) : undefined, selectedMed)}
                            >
                              {units.sort((a, b) => a.conversionFactorToBase - b.conversionFactorToBase).map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.unitName} (×{u.conversionFactorToBase})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="space-y-2">
                          <Label htmlFor={`purchase-quantity-${item.key}`}>Quantity</Label>
                          <Input
                            id={`purchase-quantity-${item.key}`}
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(event) =>
                              updateDraftItem(item.key, { quantity: Number(event.target.value) })
                            }
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`purchase-price-${item.key}`}>Unit cost</Label>
                          <Input
                            id={`purchase-price-${item.key}`}
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={item.unitPrice}
                            onChange={(event) =>
                              updateDraftItem(item.key, { unitPrice: event.target.value })
                            }
                            required
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save purchase order
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* View PO dialog */}
      <Dialog open={selectedId !== null} onOpenChange={(open) => {
        if (!open) {
          setSelectedId(null);
          setPoScanMode(false);
          setScannedCounts({});
          setPoScanFlash(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Purchase order #{selectedOrder.data?.id ?? selectedId}
            </DialogTitle>
            <DialogDescription>
              {selectedOrder.data?.supplierName ?? "Loading order details…"}
            </DialogDescription>
          </DialogHeader>
          {selectedOrder.isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading details…
            </div>
          ) : selectedOrder.data ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge variant={selectedOrder.data.status === "received" ? "success" : "warning"}>
                  {selectedOrder.data.status}
                </Badge>
              </div>

              {/* Scan-to-receive toggle + status bar */}
              {selectedOrder.data.status === "pending" && (
                <div className="space-y-2">
                  <Button
                    size="sm"
                    variant={poScanMode ? "default" : "outline"}
                    className={`w-full ${poScanMode ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}
                    onClick={() => setPoScanMode(v => !v)}
                  >
                    <Scan size={14} className="mr-2" />
                    {poScanMode ? "Scanning — point at item…" : "Scan to Receive"}
                  </Button>
                  {poScanMode && (
                    <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                      <span className="text-emerald-700 font-medium flex-1">Scan mode active</span>
                      {poScanFlash && (
                        <span className="text-emerald-700 font-semibold">✓ {poScanFlash}</span>
                      )}
                      <button
                        className="text-emerald-700 hover:text-emerald-900 ml-1"
                        onClick={() => setPoScanMode(false)}
                        aria-label="Stop scan mode"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                {selectedOrder.data.items?.map((item) => {
                  const unitLabel = (item as any).unitName
                    ? `${item.quantity} ${(item as any).unitName}${item.quantity !== 1 ? "s" : ""}`
                    : `${item.quantity} units`;
                  const factor = (item as any).conversionFactorToBase ?? 1;
                  const scanned = scannedCounts[(item as any).medicineId] ?? 0;
                  return (
                    <div key={item.id} className="flex items-center justify-between border-b pb-2 text-sm last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{item.medicineName ?? "Medicine"}</p>
                        <p className="text-muted-foreground">
                          {unitLabel} × {formatCurrency(item.unitPrice)}
                          {factor > 1 && (
                            <span className="ml-1 text-muted-foreground/60">
                              ({item.quantity * factor} base units)
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        {scanned > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-0.5">
                            ✓ {scanned} scanned
                          </span>
                        )}
                        <span className="font-semibold">
                          {formatCurrency(Number(item.unitPrice) * item.quantity)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between border-t pt-3 font-semibold">
                <span>Total</span>
                <span>{formatCurrency(selectedOrder.data.total)}</span>
              </div>
              {selectedOrder.data.status === "pending" && (
                <Button
                  className="w-full"
                  onClick={() => handleReceive(selectedOrder.data!.id)}
                  disabled={receiveMutation.isPending}
                >
                  <PackageCheck className="mr-2 h-4 w-4" />
                  Receive and update inventory
                </Button>
              )}
            </div>
          ) : (
            <p className="py-6 text-center text-muted-foreground">Purchase order details unavailable.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
