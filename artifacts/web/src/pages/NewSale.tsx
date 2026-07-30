import { useState, useRef, useEffect, useCallback } from "react";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { useListMedicines, useCreateOrder } from "@workspace/api-client-react";
import { usePharmacySettings } from "@/hooks/use-pharmacy-settings";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Search, Plus, Minus, Trash2, ShoppingBag, Pill,
  CheckCircle2, Loader2, Receipt, AlertTriangle, ShieldAlert, Lock,
  FileText, AlertCircle, X, Scan,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { formatStockDisplay, priceForUnit } from "@/lib/stock-format";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/components/ui/use-toast";
import { useLocation, useSearch } from "wouter";
import type { Medicine, MedicineUnit } from "@workspace/api-client-react";

interface SaleItem {
  medicine: Medicine;
  quantity: number;
  unitId?: number;
  unitName?: string;
  conversionFactor: number;
  sig?: string;
}

interface DrugInteraction {
  id: number;
  medicine1Id: number; medicine1Name: string;
  medicine2Id: number; medicine2Name: string;
  severity: "minor" | "moderate" | "major" | "contraindicated";
  description: string;
}

interface PatientAllergy {
  id: number;
  allergen: string;
  severity: "mild" | "moderate" | "severe";
  reaction?: string | null;
}

interface ContraindicationWarning {
  id: number;
  medicineId: number;
  medicineName: string;
  contraindicationType: string;
  value: string;
  severity: "warn" | "block";
  description: string;
}

interface PrescriptionInfo {
  id: number;
  patientName: string | null;
  doctorName: string | null;
  status: string;
  maxRefills: number;
  refillsUsed: number;
}

interface GenericAlternative {
  id: number;
  name: string;
  genericName: string | null;
  price: string;
  quantity: number;
  manufacturer: string | null;
  units?: any[];
}

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card / PoS" },
  { value: "insurance", label: "Insurance" },
] as const;

const SEVERITY_COLOR: Record<string, string> = {
  minor: "text-blue-600 bg-blue-50 border-blue-200",
  moderate: "text-amber-700 bg-amber-50 border-amber-200",
  major: "text-orange-700 bg-orange-50 border-orange-200",
  contraindicated: "text-red-700 bg-red-50 border-red-200",
  mild: "text-blue-600 bg-blue-50 border-blue-200",
  severe: "text-red-700 bg-red-50 border-red-200",
};

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("pharma_token");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...getAuthHeaders(), ...init?.headers } });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || body?.detail || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

function getUnits(medicine: Medicine): MedicineUnit[] {
  return ((medicine as any).units as MedicineUnit[]) ?? [];
}

function defaultUnit(medicine: Medicine): { unitId?: number; unitName?: string; conversionFactor: number } {
  const units = getUnits(medicine);
  if (units.length === 0) return { conversionFactor: 1 };
  const sorted = [...units].sort((a, b) => a.conversionFactorToBase - b.conversionFactorToBase);
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
  const [patientId, setPatientId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "insurance">("cash");
  const [notes, setNotes] = useState("");
  const [discountAmount, setDiscountAmount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedSale, setCompletedSale] = useState<any>(null);

  // Safety state
  const [interactions, setInteractions] = useState<DrugInteraction[]>([]);
  const [allergies, setAllergies] = useState<PatientAllergy[]>([]);
  const [allergyHits, setAllergyHits] = useState<string[]>([]);
  const [overrideAllergy, setOverrideAllergy] = useState(false);
  const [contraindicationWarnings, setContraindicationWarnings] = useState<ContraindicationWarning[]>([]);
  const [overrideContraindication, setOverrideContraindication] = useState(false);

  // Prescription state
  const [prescriptionId, setPrescriptionId] = useState<number | null>(null);
  const [prescriptionInput, setPrescriptionInput] = useState("");
  const [prescriptionInfo, setPrescriptionInfo] = useState<PrescriptionInfo | null>(null);
  const [prescriptionLoading, setPrescriptionLoading] = useState(false);

  // Generic substitution suggestions
  const [genericSuggestion, setGenericSuggestion] = useState<{
    brandId: number;
    brandName: string;
    alternatives: GenericAlternative[];
  } | null>(null);

  // Barcode scan mode
  const [scanMode, setScanMode] = useState(false);
  const [scanFlash, setScanFlash] = useState<string | null>(null);

  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(useSearch());
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const initialMedicineHandled = useRef(false);

  const { data: medicines } = useListMedicines({ search: search || undefined });
  const { data: pharmacySettings } = usePharmacySettings();
  const taxRatePct = parseFloat(pharmacySettings?.taxRatePercent ?? "0");
  const createOrderMutation = useCreateOrder();

  const filteredMedicines = search.trim()
    ? (medicines ?? []).filter(m =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        (m.genericName ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : [];

  // ── Drug interaction check ─────────────────────────────────────────────────
  const checkInteractions = useCallback(async (items: SaleItem[]) => {
    const ids = items.map(i => i.medicine.id);
    if (ids.length < 2) { setInteractions([]); return; }
    try {
      const result = await apiFetch<{ interactions: DrugInteraction[] }>("/api/medicines/check-interactions", {
        method: "POST",
        body: JSON.stringify({ medicineIds: ids }),
      });
      setInteractions(result.interactions);
    } catch { setInteractions([]); }
  }, []);

  // ── Contraindication check ────────────────────────────────────────────────
  const checkContraindications = useCallback(async (pid: number | null, items: SaleItem[]) => {
    if (!pid || items.length === 0) { setContraindicationWarnings([]); return; }
    try {
      const result = await apiFetch<{ contraindications: ContraindicationWarning[] }>(
        "/api/medicines/check-contraindications",
        {
          method: "POST",
          body: JSON.stringify({ medicineIds: items.map(i => i.medicine.id), patientId: pid }),
        }
      );
      setContraindicationWarnings(result.contraindications);
    } catch { setContraindicationWarnings([]); }
  }, []);

  // ── Prescription lookup ───────────────────────────────────────────────────
  const lookupPrescription = useCallback(async (id: number) => {
    setPrescriptionLoading(true);
    setPrescriptionInfo(null);
    try {
      const row = await apiFetch<PrescriptionInfo>(`/api/prescriptions/${id}`);
      setPrescriptionInfo(row);
      setPrescriptionId(id);
    } catch {
      setPrescriptionInfo(null);
      setPrescriptionId(null);
      toast({ title: "Prescription not found", description: `No prescription with ID #${id} exists.`, variant: "destructive" });
    } finally {
      setPrescriptionLoading(false);
    }
  }, [toast]);

  // ── Generic substitution check ────────────────────────────────────────────
  const checkGenericAlternatives = useCallback(async (medicineId: number, medicineName: string) => {
    try {
      const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
      const alts = await apiFetch<GenericAlternative[]>(`${BASE}/api/medicines/${medicineId}/generics`);
      if (alts.length > 0) {
        setGenericSuggestion({ brandId: medicineId, brandName: medicineName, alternatives: alts });
      }
    } catch { /* silent */ }
  }, []);

  // ── Barcode scan handler ──────────────────────────────────────────────────
  const handleBarcodeScan = useCallback(async (barcode: string) => {
    try {
      const results = await apiFetch<Medicine[]>(`/api/medicines?search=${encodeURIComponent(barcode)}`);
      // apiFetch may return paginated {data,[]} or a plain array depending on query params
      const list: Medicine[] = Array.isArray(results) ? results : (results as any).data ?? [];
      const match = list.find((m: any) => m.barcode === barcode);
      if (!match) {
        toast({ title: "Barcode not recognised", description: `No medicine found for: ${barcode}`, variant: "destructive" });
        return;
      }
      addItem(match);
      setScanFlash(match.name);
      setTimeout(() => setScanFlash(null), 2000);
    } catch {
      toast({ title: "Scan lookup failed", description: "Could not reach the server.", variant: "destructive" });
    }
  }, [toast]); // addItem is stable (closure over setState calls)

  useBarcodeScanner({ onScan: handleBarcodeScan, enabled: scanMode });

  // ── Allergy check ─────────────────────────────────────────────────────────
  const checkAllergies = useCallback(async (pid: number | null, items: SaleItem[]) => {
    if (!pid) { setAllergies([]); setAllergyHits([]); return; }
    try {
      const rows = await apiFetch<PatientAllergy[]>(`/api/patients/${pid}/allergies`);
      setAllergies(rows);
      if (rows.length > 0) {
        const allergenNames = rows.map(a => a.allergen.toLowerCase());
        const hits = items.filter(i =>
          allergenNames.some(a =>
            i.medicine.name.toLowerCase().includes(a) ||
            ((i.medicine as any).genericName ?? "").toLowerCase().includes(a) ||
            ((i.medicine as any).drugClass ?? "").toLowerCase().includes(a)
          )
        ).map(i => i.medicine.name);
        setAllergyHits(hits);
      } else {
        setAllergyHits([]);
      }
    } catch { setAllergies([]); setAllergyHits([]); }
  }, []);

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

  // Re-check all safety data whenever cart or patient changes
  useEffect(() => {
    checkInteractions(saleItems);
    checkAllergies(patientId, saleItems);
    checkContraindications(patientId, saleItems);
    setOverrideAllergy(false);
    setOverrideContraindication(false);
  }, [saleItems, patientId]);

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
    if ((medicine as any).genericName) {
      checkGenericAlternatives(medicine.id, medicine.name);
    }
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
    setGenericSuggestion(prev => (prev?.brandId === id ? null : prev));
  };

  const updateSig = (id: number, sig: string) => {
    setSaleItems(prev => prev.map(i => i.medicine.id === id ? { ...i, sig: sig || undefined } : i));
  };

  const subtotal = saleItems.reduce((sum, i) => sum + priceForUnit(i.medicine.price, i.conversionFactor) * i.quantity, 0);
  const discountClamped = Math.min(discountAmount, subtotal);
  const afterDiscount = subtotal - discountClamped;
  const taxAmount = (afterDiscount * taxRatePct) / 100;
  const grandTotal = afterDiscount + taxAmount;

  // Controlled substances in cart
  const controlledItems = saleItems.filter(i => (i.medicine as any).controlledSchedule);

  // Hard block conditions
  const contraindicatedPairs = interactions.filter(i => i.severity === "contraindicated");
  const hasSevereAllergy = allergyHits.length > 0 &&
    allergies.some(a => a.severity === "severe" && allergyHits.some(h => h.toLowerCase().includes(a.allergen.toLowerCase())));
  const hasBlockContraindication = contraindicationWarnings.some(c => c.severity === "block");
  const isSafetyBlocked =
    contraindicatedPairs.length > 0 ||
    (hasSevereAllergy && !overrideAllergy) ||
    (hasBlockContraindication && !overrideContraindication);

  // Prescription refill status
  const refillsRemaining = prescriptionInfo
    ? Math.max(0, prescriptionInfo.maxRefills - prescriptionInfo.refillsUsed)
    : null;
  const refillsExhausted = prescriptionInfo
    ? prescriptionInfo.refillsUsed > prescriptionInfo.maxRefills
    : false;

  const handleProcessSale = async () => {
    if (saleItems.length === 0) {
      toast({ title: "Cart is empty", description: "Add at least one medicine to process a sale.", variant: "destructive" });
      return;
    }
    for (const item of saleItems) {
      const baseUnitsNeeded = item.quantity * item.conversionFactor;
      if (item.medicine.quantity < baseUnitsNeeded) {
        const available = formatStockDisplay(item.medicine.quantity, getUnits(item.medicine));
        toast({ title: "Insufficient stock", description: `${item.medicine.name}: only ${available} available.`, variant: "destructive" });
        return;
      }
    }
    if (isSafetyBlocked) {
      toast({ title: "Safety check failed", description: "Resolve safety warnings before proceeding.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createOrderMutation.mutateAsync({
        data: {
          patientName: patientName.trim() || undefined,
          paymentMethod,
          notes: notes.trim() || undefined,
          items: saleItems.map(i => ({
            medicineId: i.medicine.id,
            quantity: i.quantity,
            ...(i.unitId ? { unitId: i.unitId } : {}),
            ...(i.sig ? { sig: i.sig } : {}),
          })) as any,
          ...(discountClamped > 0 ? { discountAmount: discountClamped } as any : {}),
          ...(patientId ? { patientId } as any : {}),
          ...(prescriptionId ? { prescriptionId } as any : {}),
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/medicines"] });
      setCompletedSale(result);
    } catch (err) {
      toast({ title: "Sale failed", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewSale = () => {
    setSaleItems([]);
    setPatientName("");
    setPatientId(null);
    setPaymentMethod("cash");
    setNotes("");
    setDiscountAmount(0);
    setCompletedSale(null);
    setInteractions([]);
    setAllergies([]);
    setAllergyHits([]);
    setOverrideAllergy(false);
    setContraindicationWarnings([]);
    setOverrideContraindication(false);
    setPrescriptionId(null);
    setPrescriptionInput("");
    setPrescriptionInfo(null);
    setScanMode(false);
    setScanFlash(null);
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
            <CardTitle className="flex items-center gap-2 text-base"><Receipt size={18} /> Sale Summary</CardTitle>
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
          <Button className="flex-1" onClick={handleNewSale}><Plus size={16} className="mr-2" /> New Sale</Button>
          <Button variant="outline" className="flex-1" onClick={() => setLocation(`/sales/${completedSale.id}`)}>View Details</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">New Sale</h1>
          <p className="text-muted-foreground mt-1">Search medicines and process a sale at the counter.</p>
        </div>
        <Button
          variant={scanMode ? "default" : "outline"}
          size="sm"
          className={scanMode ? "bg-emerald-600 hover:bg-emerald-700 text-white shrink-0" : "shrink-0"}
          onClick={() => setScanMode(v => !v)}
        >
          <Scan size={15} className="mr-2" />
          {scanMode ? "Scanning…" : "Scan Mode"}
        </Button>
      </div>

      {/* Scan mode status bar */}
      {scanMode && (
        <div className="flex items-center gap-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-4 py-2.5 text-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span className="font-medium text-emerald-700">Scan mode active — point scanner at medicine barcode</span>
          <div className="ml-auto flex items-center gap-3">
            {scanFlash && (
              <span className="text-emerald-700 font-semibold animate-in fade-in slide-in-from-right-2 duration-200">
                ✓ {scanFlash}
              </span>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-emerald-700 hover:bg-emerald-500/20"
              onClick={() => setScanMode(false)}
            >
              <X size={13} className="mr-1" /> Stop
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <div className="lg:col-span-3 space-y-4">
          {/* Medicine search */}
          <Card>
            <CardContent className="pt-4 pb-4">
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
                      const stockLabel = med.quantity === 0 ? "Out of stock" : units.length > 0 ? formatStockDisplay(med.quantity, units) : `${med.quantity} in stock`;
                      const cs = (med as any).controlledSchedule as string | null;
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
                              <div className="flex items-center gap-1.5">
                                <p className="font-medium text-sm">{med.name}</p>
                                {cs && <Badge variant="destructive" className="text-[9px] py-0 px-1">Sch {cs}</Badge>}
                              </div>
                              {med.genericName && <p className="text-xs text-muted-foreground">{med.genericName}</p>}
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-4">
                            <p className="font-semibold text-sm">{formatCurrency(parseFloat(med.price))}<span className="text-xs font-normal text-muted-foreground">/base unit</span></p>
                            <p className={`text-xs ${med.quantity === 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{stockLabel}</p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Generic substitution suggestion */}
          {genericSuggestion && (
            <div className="rounded-lg border border-teal-300/60 bg-teal-500/5 p-3 text-sm flex items-start gap-3">
              <div className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-teal-500/15 text-teal-600 flex items-center justify-center">
                <Pill size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-teal-700">Cheaper generic available for {genericSuggestion.brandName}</p>
                <div className="mt-1.5 space-y-1">
                  {genericSuggestion.alternatives.slice(0, 2).map((alt) => {
                    const saving = parseFloat(saleItems.find(i => i.medicine.id === genericSuggestion.brandId)?.medicine.price ?? "0") - parseFloat(alt.price);
                    return (
                      <div key={alt.id} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <span className="font-medium truncate">{alt.name}</span>
                          {alt.manufacturer && <span className="text-teal-600/70 text-xs ml-1">· {alt.manufacturer}</span>}
                          <span className="text-teal-700 font-semibold ml-2">{formatCurrency(parseFloat(alt.price))}</span>
                          {saving > 0 && <span className="text-xs text-teal-600 ml-1">(save {formatCurrency(saving)}/unit)</span>}
                        </div>
                        <button
                          type="button"
                          className="shrink-0 text-xs font-semibold text-teal-700 hover:text-teal-900 border border-teal-400/50 rounded px-2 py-0.5 hover:bg-teal-500/10 transition-colors"
                          onClick={() => {
                            const found = (medicines ?? []).find(m => m.id === alt.id);
                            if (found) {
                              removeItem(genericSuggestion.brandId);
                              addItem(found);
                            }
                            setGenericSuggestion(null);
                          }}
                        >
                          Switch
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <button
                type="button"
                className="shrink-0 text-teal-500 hover:text-teal-700"
                onClick={() => setGenericSuggestion(null)}
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Safety warnings panel */}
          {saleItems.length > 0 && (interactions.length > 0 || allergyHits.length > 0 || controlledItems.length > 0) && (
            <div className="space-y-2">
              {/* Drug interactions */}
              {interactions.map((ix, i) => (
                <div key={i} className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${SEVERITY_COLOR[ix.severity] ?? "text-amber-700 bg-amber-50 border-amber-200"}`}>
                  {ix.severity === "contraindicated" ? <Lock size={16} className="shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
                  <div>
                    <p className="font-semibold capitalize">{ix.severity} interaction — {ix.medicine1Name} + {ix.medicine2Name}</p>
                    <p className="mt-0.5 opacity-90">{ix.description}</p>
                    {ix.severity === "contraindicated" && <p className="mt-1 font-bold">Cannot dispense — remove one of these medicines.</p>}
                  </div>
                </div>
              ))}

              {/* Allergy hits */}
              {allergyHits.length > 0 && (
                <div className={`rounded-lg border p-3 text-sm ${hasSevereAllergy ? "text-red-700 bg-red-50 border-red-200" : "text-amber-700 bg-amber-50 border-amber-200"}`}>
                  <div className="flex items-start gap-3">
                    <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold">
                        {hasSevereAllergy ? "Severe allergy alert" : "Allergy warning"} — {allergyHits.join(", ")}
                      </p>
                      <p className="mt-0.5 opacity-90">
                        Patient has a recorded allergy that may affect {allergyHits.length === 1 ? "this medicine" : "these medicines"}.
                      </p>
                      {hasSevereAllergy && !overrideAllergy && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 border-red-300 text-red-700 hover:bg-red-100"
                          onClick={() => setOverrideAllergy(true)}
                        >
                          Override — I confirm this is intentional
                        </Button>
                      )}
                      {overrideAllergy && (
                        <p className="mt-1 text-xs font-semibold text-red-800">⚠ Override active — proceeding at pharmacist discretion</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Controlled substances notice */}
              {controlledItems.length > 0 && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                  <Lock size={16} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Controlled substance{controlledItems.length > 1 ? "s" : ""} — prescription required</p>
                    <p className="mt-0.5 opacity-90">
                      {controlledItems.map(i => `${i.medicine.name} (Schedule ${(i.medicine as any).controlledSchedule})`).join(", ")} — a verified prescription must be attached and will be auto-logged.
                    </p>
                  </div>
                </div>
              )}

              {/* Drug-patient contraindications */}
              {contraindicationWarnings.map((ci, i) => (
                <div key={i} className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${ci.severity === "block" ? "text-red-700 bg-red-50 border-red-200" : "text-amber-700 bg-amber-50 border-amber-200"}`}>
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold capitalize">
                      {ci.severity === "block" ? "Contraindication — " : "Caution — "}
                      {ci.medicineName}
                    </p>
                    <p className="mt-0.5 opacity-90">{ci.description}</p>
                    {ci.severity === "block" && !overrideContraindication && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 border-red-300 text-red-700 hover:bg-red-100"
                        onClick={() => setOverrideContraindication(true)}
                      >
                        Override — I confirm this is intentional
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {overrideContraindication && contraindicationWarnings.some(c => c.severity === "block") && (
                <p className="text-xs font-semibold text-red-800 px-3">⚠ Contraindication override active — proceeding at pharmacist discretion</p>
              )}
            </div>
          )}

          {/* Cart */}
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
                    const liveMedicine = medicines?.find(m => m.id === item.medicine.id) ?? item.medicine;
                    const units = getUnits(liveMedicine);
                    const unitPrice = priceForUnit(item.medicine.price, item.conversionFactor);
                    const lineTotal = unitPrice * item.quantity;
                    const baseUnitsUsed = item.quantity * item.conversionFactor;
                    const maxQty = Math.floor(liveMedicine.quantity / item.conversionFactor);
                    const cs = (item.medicine as any).controlledSchedule as string | null;
                    const isContraindicated = contraindicatedPairs.some(p =>
                      p.medicine1Id === item.medicine.id || p.medicine2Id === item.medicine.id
                    );
                    return (
                      <div key={item.medicine.id} className={`rounded-lg border bg-muted/20 p-3 space-y-2 ${isContraindicated ? "border-red-300 bg-red-50/30" : "border-border"}`}>
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-sm truncate">{item.medicine.name}</p>
                              {cs && <Badge variant="destructive" className="text-[9px] py-0 px-1 shrink-0">Sch {cs}</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(unitPrice)}{item.unitName ? ` / ${item.unitName}` : " / unit"}
                              {item.conversionFactor > 1 && <span className="ml-1 text-muted-foreground/70">(= {item.conversionFactor} base units)</span>}
                            </p>
                          </div>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0" onClick={() => removeItem(item.medicine.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          {units.length > 0 && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground">Unit:</span>
                              <select
                                className="h-7 rounded-md border border-input bg-background px-2 py-0 text-xs"
                                value={item.unitId ?? ""}
                                onChange={(e) => updateUnit(item.medicine.id, e.target.value ? Number(e.target.value) : undefined, units)}
                              >
                                {!units.some(u => u.isBaseUnit || u.conversionFactorToBase === 1) && <option value="">Individual unit (×1)</option>}
                                {[...units].sort((a, b) => a.conversionFactorToBase - b.conversionFactorToBase).map((u) => (
                                  <option key={u.id} value={u.id}>{u.unitName}</option>
                                ))}
                              </select>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 ml-auto">
                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.medicine.id, item.quantity - 1)}>
                              <Minus size={12} />
                            </Button>
                            <Input type="number" value={item.quantity} min={1} max={maxQty} className="h-7 w-14 text-center text-sm p-0"
                              onChange={(e) => updateQty(item.medicine.id, parseInt(e.target.value) || 0)} />
                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.medicine.id, item.quantity + 1)} disabled={item.quantity >= maxQty}>
                              <Plus size={12} />
                            </Button>
                          </div>
                          <div className="w-20 text-right shrink-0">
                            <p className="font-semibold text-sm">{formatCurrency(lineTotal)}</p>
                            {item.conversionFactor > 1 && <p className="text-[10px] text-muted-foreground">{baseUnitsUsed} base units</p>}
                          </div>
                        </div>
                        {/* SIG — dosing instructions */}
                        <div className="pt-1">
                          <Input
                            placeholder="Dosing instructions (e.g. Take 1 tablet twice daily after food)"
                            value={item.sig ?? ""}
                            onChange={(e) => updateSig(item.medicine.id, e.target.value)}
                            className="h-7 text-xs text-muted-foreground placeholder:text-muted-foreground/50"
                            aria-label={`Dosing instructions for ${item.medicine.name}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="pt-3 border-t border-border flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
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
              <div className="space-y-1">
                <Label htmlFor="patientId">Patient ID <span className="text-muted-foreground font-normal">(for safety checks)</span></Label>
                <Input
                  id="patientId"
                  type="number"
                  placeholder="Enter patient ID"
                  value={patientId ?? ""}
                  onChange={(e) => setPatientId(e.target.value ? Number(e.target.value) : null)}
                />
                {patientId && allergies.length > 0 && (
                  <p className="text-xs text-amber-700">
                    ⚠ {allergies.length} allergy record{allergies.length !== 1 ? "s" : ""} — {allergies.map(a => a.allergen).join(", ")}
                  </p>
                )}
                {patientId && allergies.length === 0 && contraindicationWarnings.length === 0 && (
                  <p className="text-xs text-emerald-700">✓ No recorded allergies or contraindications</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Prescription */}
          <Card>
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText size={16} /> Prescription
                <span className="text-xs font-normal text-muted-foreground ml-auto">Required for Rx &amp; controlled drugs</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              <div className="space-y-1">
                <Label htmlFor="prescriptionId">Prescription ID</Label>
                <div className="flex gap-2">
                  <Input
                    id="prescriptionId"
                    type="number"
                    placeholder="Enter prescription ID"
                    value={prescriptionInput}
                    onChange={(e) => setPrescriptionInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && prescriptionInput) {
                        lookupPrescription(Number(prescriptionInput));
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={!prescriptionInput || prescriptionLoading}
                    onClick={() => prescriptionInput && lookupPrescription(Number(prescriptionInput))}
                  >
                    {prescriptionLoading ? <Loader2 size={14} className="animate-spin" /> : "Link"}
                  </Button>
                  {prescriptionId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => { setPrescriptionId(null); setPrescriptionInput(""); setPrescriptionInfo(null); }}
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
              </div>
              {prescriptionInfo && (
                <div className={`rounded-lg border p-3 text-sm space-y-1 ${prescriptionInfo.status !== "verified" ? "border-amber-200 bg-amber-50" : refillsExhausted ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {prescriptionInfo.status !== "verified"
                        ? "⚠ Prescription not verified"
                        : refillsExhausted
                          ? "✗ No refills remaining"
                          : `✓ Rx #${prescriptionInfo.id} — verified`}
                    </span>
                  </div>
                  {prescriptionInfo.doctorName && (
                    <p className="text-muted-foreground text-xs">Doctor: {prescriptionInfo.doctorName}</p>
                  )}
                  <p className={`text-xs font-medium ${refillsExhausted ? "text-red-700" : "text-emerald-700"}`}>
                    Refills: {prescriptionInfo.refillsUsed} used / {prescriptionInfo.maxRefills} allowed
                    {!refillsExhausted && refillsRemaining !== null && ` — ${refillsRemaining} remaining`}
                  </p>
                  {refillsExhausted && (
                    <p className="text-xs text-red-700 font-semibold">This prescription has no remaining refills. The server will block this sale.</p>
                  )}
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
                <Label htmlFor="notes">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input id="notes" placeholder="e.g. prescription #…" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground shrink-0">Discount</span>
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-sm text-muted-foreground">$</span>
                <input type="number" min={0} max={subtotal} step={0.01} value={discountAmount || ""} placeholder="0.00"
                  onChange={(e) => setDiscountAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-24 text-right h-7 rounded border border-input bg-background px-2 py-1 text-sm" />
              </div>
            </div>
            {taxRatePct > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Tax ({taxRatePct}%)</span><span>{formatCurrency(taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-xl border-t border-border pt-2">
              <span>Total</span><span>{formatCurrency(grandTotal)}</span>
            </div>
          </div>

          {isSafetyBlocked && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 text-center font-medium">
              {contraindicatedPairs.length > 0
                ? "Remove the contraindicated medicine before proceeding"
                : "Override the severe allergy alert to proceed"}
            </div>
          )}

          <Button
            className="w-full h-12 text-base font-semibold"
            onClick={handleProcessSale}
            disabled={saleItems.length === 0 || isSubmitting || isSafetyBlocked}
          >
            {isSubmitting ? <Loader2 className="animate-spin mr-2" size={18} /> : null}
            Process Sale · {formatCurrency(grandTotal)}
          </Button>
        </div>
      </div>
    </div>
  );
}
