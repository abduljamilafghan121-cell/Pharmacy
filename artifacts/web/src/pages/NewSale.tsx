import { useState, useRef, useEffect } from "react";
import { useListMedicines, useCreateOrder, useListPrescriptions } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Minus, Trash2, ShoppingBag, Pill, CheckCircle2, Loader2, Receipt, AlertTriangle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { formatStockDisplay, priceForUnit } from "@/lib/stock-format";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/components/ui/use-toast";
import { useLocation, useSearch } from "wouter";
import type { Medicine, MedicineUnit } from "@workspace/api-client-react";
import { usePharmacySettings } from "@/hooks/use-pharmacy-settings";
import { ScanLine } from "lucide-react";

interface SaleItem {
  medicine: Medicine;
  quantity: number;           // user-facing quantity (e.g. 2 strips)
  unitId?: number;            // selected unit id (undefined = base unit)
  unitName?: string;          // selected unit name for display
  conversionFactor: number;   // base units per selected unit
}

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card / PoS" },
  { value: "insurance", label: "Insurance" },
] as const;

function getUnits(medicine: Medicine): MedicineUnit[] {
  return ((medicine as any).units as MedicineUnit[]) ?? [];
}

function defaultUnit(medicine: Medicine): { unitId?: number; unitName?: string; conversionFactor: number } {
  const units = getUnits(medicine);
  if (units.length === 0) return { conversionFactor: 1 };
  // Sort ascending so the smallest unit wins all tie-breaks.
  const sorted = [...units].sort((a, b) => a.conversionFactorToBase - b.conversionFactorToBase);
  // Priority: (1) isBaseUnit flag AND factor=1, (2) factor=1 regardless of flag,
  // (3) smallest unit overall.  We intentionally ignore isBaseUnit alone because
  // users sometimes mistakenly tick the flag on a box/strip — the factor is ground truth.
  const base =
    sorted.find((u) => u.isBaseUnit && u.conversionFactorToBase === 1) ??
    sorted.find((u) => u.conversionFactorToBase === 1) ??
    sorted[0];
  return { unitId: base.id, unitName: base.unitName, conversionFactor: base.conversionFactorToBase };
}

export default function NewSale() {
  const [search, setSearch] = useState("");
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [patientName, setPatientName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "insurance">("cash");
  const [notes, setNotes] = useState("");
  const [prescriptionId, setPrescriptionId] = useState<number | undefined>(undefined);
  const [discountInput, setDiscountInput] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedSale, setCompletedSale] = useState<any>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(useSearch());
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const initialMedicineHandled = useRef(false);

  const { data: medicines } = useListMedicines({ search: search || undefined });
  const createOrderMutation = useCreateOrder();
  const { data: prescriptions } = useListPrescriptions();
  const { data: pharmacySettings } = usePharmacySettings();
  const verifiedPrescriptions = (prescriptions ?? []).filter((p: any) => p.status === "verified");

  const rxRequiredItems = saleItems.filter(i => (i.medicine as any).prescriptionRequired);
  const needsPrescription = rxRequiredItems.length > 0;

  const filteredMedicines = search.trim()
    ? (medicines ?? []).filter(m =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        (m.genericName ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : [];

  useEffect(() => {
    if (initialMedicineHandled.current) return;
    const medicineId = Number(searchParams.get("medicineId"));
    if (!medicineId || !medicines) return;
    const selected = medicines.find((medicine) => medicine.id === medicineId);
    if (selected) {
      initialMedicineHandled.current = true;
      addItem(selected);
    }
  }, [medicines]);

  const addItem = (medicine: Medicine) => {
    const defUnit = defaultUnit(medicine);
    setSaleItems(prev => {
      const existing = prev.find(i => i.medicine.id === medicine.id);
      const baseUnitsNeeded = (existing ? existing.quantity + 1 : 1) * defUnit.conversionFactor;
      if (existing) {
        if (existing.medicine.quantity < baseUnitsNeeded) {
          toast({ title: "Stock limit reached", description: `Only ${formatStockDisplay(medicine.quantity, getUnits(medicine))} available.`, variant: "destructive" });
          return prev;
        }
        return prev.map(i => i.medicine.id === medicine.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      if (medicine.quantity === 0) {
        toast({ title: "Out of stock", description: `${medicine.name} is currently unavailable.`, variant: "destructive" });
        return prev;
      }
      if (medicine.expiryDate && medicine.expiryDate < new Date().toISOString().slice(0, 10)) {
        toast({ title: "Expired medicine", description: `${medicine.name} cannot be sold because it has expired.`, variant: "destructive" });
        return prev;
      }
      return [...prev, { medicine, quantity: 1, ...defUnit }];
    });
    setSearch("");
    searchRef.current?.focus();
  };

  const updateQty = (id: number, qty: number) => {
    setSaleItems(prev =>
      qty <= 0
        ? prev.filter(i => i.medicine.id !== id)
        : prev.map(i => i.medicine.id === id ? { ...i, quantity: qty } : i)
    );
  };

  const updateUnit = (medicineId: number, unitId: number | undefined, units: MedicineUnit[]) => {
    setSaleItems(prev => prev.map(i => {
      if (i.medicine.id !== medicineId) return i;
      if (unitId == null) return { ...i, unitId: undefined, unitName: undefined, conversionFactor: 1 };
      const unit = units.find((u) => u.id === unitId);
      if (!unit) return i;
      return { ...i, unitId: unit.id, unitName: unit.unitName, conversionFactor: unit.conversionFactorToBase };
    }));
  };

  const removeItem = (id: number) => {
    setSaleItems(prev => prev.filter(i => i.medicine.id !== id));
  };

  // Total using base unit price × base units sold
  const subtotal = saleItems.reduce((sum, i) => {
    return sum + priceForUnit(i.medicine.price, i.conversionFactor) * i.quantity;
  }, 0);
  const discountAmount = Math.min(Math.max(parseFloat(discountInput) || 0, 0), subtotal);
  const taxRate = parseFloat(pharmacySettings?.taxRatePercent ?? "0");
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = taxableAmount * (taxRate / 100);
  const total = taxableAmount + taxAmount;

  async function handleBarcodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;
    try {
      const token = localStorage.getItem("pharma_token");
      const url = `${import.meta.env.BASE_URL}api/medicines/by-barcode/${encodeURIComponent(code)}`.replace(/\/+/g, "/").replace(":/", "://");
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) {
        toast({ title: "No match", description: `No medicine found for barcode "${code}".`, variant: "destructive" });
        setBarcodeInput("");
        return;
      }
      const medicine = await res.json();
      addItem(medicine);
    } catch {
      toast({ title: "Lookup failed", description: "Could not reach the server.", variant: "destructive" });
    } finally {
      setBarcodeInput("");
      barcodeRef.current?.focus();
    }
  }

  const handleProcessSale = async () => {
    if (saleItems.length === 0) {
      toast({ title: "Cart is empty", description: "Add at least one medicine to process a sale.", variant: "destructive" });
      return;
    }

    if (needsPrescription && !prescriptionId) {
      toast({
        title: "Prescription required",
        description: `${rxRequiredItems.map(i => i.medicine.name).join(", ")} require a verified prescription. Select one before checking out.`,
        variant: "destructive",
      });
      return;
    }

    // Validate stock (in base units)
    for (const item of saleItems) {
      const baseUnitsNeeded = item.quantity * item.conversionFactor;
      if (item.medicine.quantity < baseUnitsNeeded) {
        const available = formatStockDisplay(item.medicine.quantity, getUnits(item.medicine));
        toast({ title: "Insufficient stock", description: `${item.medicine.name}: only ${available} available.`, variant: "destructive" });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const result = await createOrderMutation.mutateAsync({
        data: {
          patientName: patientName.trim() || undefined,
          paymentMethod,
          notes: notes.trim() || undefined,
          ...(needsPrescription && prescriptionId ? { prescriptionId } : {}),
          ...(discountAmount > 0 ? { discountAmount } : {}),
          items: saleItems.map(i => ({
            medicineId: i.medicine.id,
            quantity: i.quantity,
            ...(i.unitId ? { unitId: i.unitId } : {}),
          })) as any,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/medicines"] });
      setCompletedSale(result);
    } catch (err) {
      toast({
        title: "Sale failed",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewSale = () => {
    setSaleItems([]);
    setPatientName("");
    setPaymentMethod("cash");
    setNotes("");
    setPrescriptionId(undefined);
    setDiscountInput("");
    setCompletedSale(null);
    searchRef.current?.focus();
  };

  if (completedSale) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300">
        <div className="text-center py-8">
          <div className="w-20 h-20 bg-emerald-500/20 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={40} />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Sale Complete</h1>
          <p className="text-muted-foreground mt-1">Receipt #{completedSale.id?.toString().padStart(4, '0')}</p>
        </div>

        <Card>
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt size={18} /> Sale Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {completedSale.patientName && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Patient</span>
                <span className="font-medium">{completedSale.patientName}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Payment</span>
              <Badge variant="secondary" className="capitalize">{completedSale.paymentStatus}</Badge>
            </div>
            <div className="border-t border-border pt-3 space-y-2">
              {completedSale.items?.map((item: any) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>
                    {item.medicineName}
                    {item.unitName ? ` × ${item.quantity} ${item.unitName}${item.quantity !== 1 ? "s" : ""}` : ` × ${item.quantity}`}
                  </span>
                  <span className="font-medium">{formatCurrency(parseFloat(item.price))}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-3 flex justify-between font-bold text-lg">
              <span>Total</span>
              <span>{formatCurrency(parseFloat(completedSale.total))}</span>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button className="flex-1" onClick={handleNewSale}>
            <Plus size={16} className="mr-2" /> New Sale
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => setLocation(`/sales/${completedSale.id}`)}>
            View Details
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">New Sale</h1>
        <p className="text-muted-foreground mt-1">Search medicines and process a sale at the counter.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardContent className="pt-4 pb-4 space-y-3">
              <form onSubmit={handleBarcodeSubmit} className="relative">
                <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 text-primary w-4 h-4" />
                <Input
                  ref={barcodeRef}
                  placeholder="Scan or enter barcode, then press Enter…"
                  className="pl-9 border-primary/30 focus-visible:ring-primary/40"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                />
              </form>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  ref={searchRef}
                  autoFocus
                  placeholder="Search medicine by name or generic name…"
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {search.trim() && (
                <div className="mt-3 border border-border rounded-lg overflow-hidden divide-y divide-border max-h-72 overflow-y-auto">
                  {filteredMedicines.length === 0 ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">No medicines found</div>
                  ) : (
                    filteredMedicines.map(med => {
                      const units = getUnits(med);
                      const stockLabel = med.quantity === 0
                        ? "Out of stock"
                        : units.length > 0
                          ? formatStockDisplay(med.quantity, units)
                          : `${med.quantity} in stock`;
                      return (
                        <button
                          key={med.id}
                          onClick={() => addItem(med)}
                          className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                              <Pill size={16} />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{med.name}</p>
                              {med.genericName && <p className="text-xs text-muted-foreground">{med.genericName}</p>}
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-4">
                            <p className="font-semibold text-sm">{formatCurrency(parseFloat(med.price))}<span className="text-xs font-normal text-muted-foreground">/base unit</span></p>
                            <p className={`text-xs ${med.quantity === 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                              {stockLabel}
                            </p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingBag size={18} /> Current Sale
                {saleItems.length > 0 && (
                  <Badge variant="secondary" className="ml-auto">{saleItems.length} item{saleItems.length !== 1 ? 's' : ''}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {saleItems.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">
                  Search for a medicine above to add it to the sale
                </div>
              ) : (
                <div className="space-y-3">
                  {saleItems.map(item => {
                    // Use live medicine data from the query so that units added
                    // after the medicine was put in the cart are reflected immediately.
                    const liveMedicine = medicines?.find(m => m.id === item.medicine.id) ?? item.medicine;
                    const units = getUnits(liveMedicine);
                    const unitPrice = priceForUnit(item.medicine.price, item.conversionFactor);
                    const lineTotal = unitPrice * item.quantity;
                    const baseUnitsUsed = item.quantity * item.conversionFactor;
                    const maxQty = Math.floor(liveMedicine.quantity / item.conversionFactor);
                    return (
                      <div key={item.medicine.id} className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{item.medicine.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(unitPrice)}{item.unitName ? ` / ${item.unitName}` : " / unit"}
                              {item.conversionFactor > 1 && (
                                <span className="ml-1 text-muted-foreground/70">
                                  (= {item.conversionFactor} base units)
                                </span>
                              )}
                            </p>
                          </div>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0" onClick={() => removeItem(item.medicine.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap">
                          {/* Unit selector */}
                          {units.length > 0 && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground">Unit:</span>
                              <select
                                className="h-7 rounded-md border border-input bg-background px-2 py-0 text-xs"
                                value={item.unitId ?? ""}
                                onChange={(e) => updateUnit(item.medicine.id, e.target.value ? Number(e.target.value) : undefined, units)}
                              >
                                {/* Always offer an individual-unit option.
                                    If no unit with factor=1 / isBaseUnit is defined,
                                    inject a synthetic "1 unit" entry so pharmacists
                                    can sell individual tablets even when only strips/boxes
                                    are configured. */}
                                {!units.some(u => u.isBaseUnit || u.conversionFactorToBase === 1) && (
                                  <option value="">Individual unit (×1)</option>
                                )}
                                {[...units].sort((a, b) => a.conversionFactorToBase - b.conversionFactorToBase).map((u) => (
                                  <option key={u.id} value={u.id}>{u.unitName}</option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* Quantity controls */}
                          <div className="flex items-center gap-1.5 ml-auto">
                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.medicine.id, item.quantity - 1)}>
                              <Minus size={12} />
                            </Button>
                            <Input
                              type="number"
                              value={item.quantity}
                              min={1}
                              max={maxQty}
                              className="h-7 w-14 text-center text-sm p-0"
                              onChange={(e) => updateQty(item.medicine.id, parseInt(e.target.value) || 0)}
                            />
                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.medicine.id, item.quantity + 1)} disabled={item.quantity >= maxQty}>
                              <Plus size={12} />
                            </Button>
                          </div>

                          <div className="w-20 text-right shrink-0">
                            <p className="font-semibold text-sm">{formatCurrency(lineTotal)}</p>
                            {item.conversionFactor > 1 && (
                              <p className="text-[10px] text-muted-foreground">{baseUnitsUsed} base units</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div className="pt-3 border-t border-border flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span>{formatCurrency(total)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className="text-base">Patient</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              <div className="space-y-1">
                <Label htmlFor="patientName">Patient Name <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  id="patientName"
                  placeholder="Walk-in patient or name"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                />
              </div>

              {needsPrescription && (
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="prescription" className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    Verified Prescription <span className="text-destructive font-normal">(required)</span>
                  </Label>
                  <Select value={prescriptionId?.toString()} onValueChange={(v) => setPrescriptionId(Number(v))}>
                    <SelectTrigger id="prescription">
                      <SelectValue placeholder="Select a verified prescription…" />
                    </SelectTrigger>
                    <SelectContent>
                      {verifiedPrescriptions.length === 0 && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">No verified prescriptions found</div>
                      )}
                      {verifiedPrescriptions.map((p: any) => (
                        <SelectItem key={p.id} value={p.id.toString()}>
                          #{p.id} — {p.patientName ?? "Unnamed"} {p.doctorName ? `(Dr. ${p.doctorName})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Required for: {rxRequiredItems.map(i => i.medicine.name).join(", ")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className="text-base">Payment</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_METHODS.map(pm => (
                  <button
                    key={pm.value}
                    onClick={() => setPaymentMethod(pm.value)}
                    className={`py-3 rounded-lg border text-sm font-medium transition-colors ${
                      paymentMethod === pm.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    {pm.label}
                  </button>
                ))}
              </div>
              <div className="space-y-1">
                <Label htmlFor="discount">Discount <span className="text-muted-foreground font-normal">(optional, amount off)</span></Label>
                <Input
                  id="discount"
                  type="number"
                  min={0}
                  max={subtotal}
                  step="0.01"
                  placeholder="0.00"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="notes">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  id="notes"
                  placeholder="e.g. prescription #, allergies…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Items</span>
              <span>{saleItems.reduce((s, i) => s + i.quantity, 0)}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm text-emerald-600">
                <span>Discount</span>
                <span>-{formatCurrency(discountAmount)}</span>
              </div>
            )}
            {taxRate > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Tax ({taxRate}%)</span>
                <span>{formatCurrency(taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-xl pt-1 border-t border-border">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>

          <Button
            className="w-full h-12 text-base font-semibold"
            onClick={handleProcessSale}
            disabled={saleItems.length === 0 || isSubmitting || (needsPrescription && !prescriptionId)}
          >
            {isSubmitting ? <Loader2 className="animate-spin mr-2" size={18} /> : null}
            Process Sale · {formatCurrency(total)}
          </Button>
        </div>
      </div>
    </div>
  );
}
