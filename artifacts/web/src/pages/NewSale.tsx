import { useState, useRef } from "react";
import { useListMedicines, useCreateOrder } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Minus, Trash2, ShoppingBag, Pill, CheckCircle2, Loader2, Receipt } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { useLocation } from "wouter";
import type { Medicine } from "@workspace/api-client-react";

interface SaleItem {
  medicine: Medicine;
  quantity: number;
}

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card / PoS" },
  { value: "insurance", label: "Insurance" },
] as const;

export default function NewSale() {
  const [search, setSearch] = useState("");
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [patientName, setPatientName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "insurance">("cash");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedSale, setCompletedSale] = useState<any>(null);

  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: medicines } = useListMedicines(
    { search: search || undefined }
  );

  const createOrderMutation = useCreateOrder();

  const filteredMedicines = search.trim()
    ? (medicines ?? []).filter(m =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        (m.genericName ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : [];

  const addItem = (medicine: Medicine) => {
    setSaleItems(prev => {
      const existing = prev.find(i => i.medicine.id === medicine.id);
      if (existing) {
        if (existing.quantity >= medicine.quantity) {
          toast({ title: "Stock limit reached", variant: "destructive" });
          return prev;
        }
        return prev.map(i =>
          i.medicine.id === medicine.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      if (medicine.quantity === 0) {
        toast({ title: "Out of stock", variant: "destructive" });
        return prev;
      }
      return [...prev, { medicine, quantity: 1 }];
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

  const removeItem = (id: number) => {
    setSaleItems(prev => prev.filter(i => i.medicine.id !== id));
  };

  const subtotal = saleItems.reduce((sum, i) => sum + parseFloat(i.medicine.price) * i.quantity, 0);

  const handleProcessSale = async () => {
    if (saleItems.length === 0) {
      toast({ title: "Add at least one item", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createOrderMutation.mutateAsync({
        data: {
          patientName: patientName.trim() || undefined,
          paymentMethod,
          notes: notes.trim() || undefined,
          items: saleItems.map(i => ({ medicineId: i.medicine.id, quantity: i.quantity })),
        },
      });

      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/medicines"] });
      setCompletedSale(result);
    } catch (err: any) {
      toast({
        title: "Sale failed",
        description: err.response?.data?.error || "An error occurred",
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
                  <span>{item.medicineName} × {item.quantity}</span>
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

        {/* Left: Medicine Search */}
        <div className="lg:col-span-3 space-y-4">
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
                    filteredMedicines.map(med => (
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
                          <p className="font-semibold text-sm">{formatCurrency(parseFloat(med.price))}</p>
                          <p className={`text-xs ${med.quantity === 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {med.quantity === 0 ? 'Out of stock' : `${med.quantity} in stock`}
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sale Items */}
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
                  {saleItems.map(item => (
                    <div key={item.medicine.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.medicine.name}</p>
                        <p className="text-xs text-muted-foreground">{formatCurrency(parseFloat(item.medicine.price))} each</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.medicine.id, item.quantity - 1)}>
                          <Minus size={12} />
                        </Button>
                        <Input
                          type="number"
                          value={item.quantity}
                          min={1}
                          max={item.medicine.quantity}
                          className="h-7 w-14 text-center text-sm p-0"
                          onChange={(e) => updateQty(item.medicine.id, parseInt(e.target.value) || 0)}
                        />
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.medicine.id, item.quantity + 1)} disabled={item.quantity >= item.medicine.quantity}>
                          <Plus size={12} />
                        </Button>
                      </div>
                      <div className="w-20 text-right shrink-0">
                        <p className="font-semibold text-sm">{formatCurrency(parseFloat(item.medicine.price) * item.quantity)}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0" onClick={() => removeItem(item.medicine.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}

                  <div className="pt-3 border-t border-border flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Patient + Payment */}
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
            <div className="flex justify-between font-bold text-xl">
              <span>Total</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
          </div>

          <Button
            className="w-full h-12 text-base font-semibold"
            onClick={handleProcessSale}
            disabled={saleItems.length === 0 || isSubmitting}
          >
            {isSubmitting ? <Loader2 className="animate-spin mr-2" size={18} /> : null}
            Process Sale · {formatCurrency(subtotal)}
          </Button>
        </div>
      </div>
    </div>
  );
}
