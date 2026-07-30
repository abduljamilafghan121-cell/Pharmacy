import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  useListMedicines, useListCategories, useCreateMedicine,
  useListMedicineUnits, useCreateMedicineUnit, useDeleteMedicineUnit,
  getListMedicinesQueryKey, getListMedicineUnitsQueryKey,
  type Medicine, type MedicineUnit,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Filter, AlertCircle, CalendarClock, Package, Trash2, Loader2, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import { formatStockDisplay } from "@/lib/stock-format";

export default function Medicines() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");

  const { data: medicines, isLoading, isError, error, refetch } = useListMedicines(
    { search: search || undefined, categoryId: categoryId || undefined }
  );
  const { data: categories } = useListCategories();
  const isAdmin = user?.role === "admin" || user?.role === "pharmacist";

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Medicines</h1>
          <p className="text-muted-foreground mt-1">Browse our full catalog of pharmaceutical products.</p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && <MedicineFormDialog />}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 bg-card p-4 rounded-xl border border-card-border shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search medicines by name or generic name..."
            className="pl-9 bg-transparent"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="text-muted-foreground w-4 h-4 ml-2" />
          <select
            className="h-11 rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">All Categories</option>
            {categories?.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {isError ? (
        <ErrorState
          title="Failed to load medicines"
          message={getErrorMessage(error)}
          onRetry={() => refetch()}
        />
      ) : isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <div key={i} className="h-[300px] rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {medicines?.map(medicine => (
            <MedicineCard key={medicine.id} medicine={medicine} isAdmin={isAdmin} />
          ))}
          {medicines?.length === 0 && (
            <div className="col-span-full py-12 text-center">
              <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground">No medicines found</h3>
              <p className="text-muted-foreground mt-1">Try adjusting your search or filters.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MedicineCard({ medicine, isAdmin }: { medicine: Medicine, isAdmin: boolean }) {
  const isOutOfStock = medicine.quantity === 0;
  const today = new Date().toISOString().slice(0, 10);
  const isExpired = Boolean(medicine.expiryDate && medicine.expiryDate < today);
  const isExpiringSoon = Boolean(
    medicine.expiryDate &&
    !isExpired &&
    medicine.expiryDate <= new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
  );

  const units = (medicine as any).units as MedicineUnit[] | undefined;
  const stockDisplay = formatStockDisplay(medicine.quantity, units);
  const hasUnits = units && units.length > 0;
  const controlledSchedule = (medicine as any).controlledSchedule as string | null;

  return (
    <Card className="flex flex-col overflow-hidden hover-elevate transition-all group">
      <Link href={`/medicines/${medicine.id}`} className="block relative aspect-square bg-muted/30 p-6 flex items-center justify-center border-b border-border group-hover:bg-muted/50 transition-colors">
        {medicine.imageUrl ? (
          <img src={medicine.imageUrl} alt={medicine.name} className="object-contain w-full h-full mix-blend-multiply" />
        ) : (
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <span className="text-2xl font-bold">{medicine.name.charAt(0)}</span>
          </div>
        )}
        <div className="absolute top-3 left-3 flex flex-col gap-1">
          {medicine.prescriptionRequired && (
            <Badge variant="destructive" className="text-[10px] uppercase font-bold tracking-wider">Rx Required</Badge>
          )}
          {controlledSchedule && (
            <Badge className="text-[10px] uppercase font-bold tracking-wider bg-orange-600 hover:bg-orange-600 flex items-center gap-0.5">
              <Lock size={9} /> Sch {controlledSchedule}
            </Badge>
          )}
        </div>
      </Link>
      <CardContent className="p-5 flex-1 flex flex-col">
        <div className="mb-2">
          <Link href={`/medicines/${medicine.id}`} className="text-lg font-bold hover:text-primary transition-colors line-clamp-1">
            {medicine.name}
          </Link>
          <p className="text-sm text-muted-foreground line-clamp-1" title={medicine.genericName ?? undefined}>
            {medicine.genericName || "—"}
          </p>
        </div>
        <div className="mt-auto space-y-3 pt-4">
          {medicine.expiryDate && (
            <div className={`flex items-center gap-1.5 text-xs ${isExpired ? "font-semibold text-destructive" : isExpiringSoon ? "font-semibold text-amber-600" : "text-muted-foreground"}`}>
              <CalendarClock size={14} />
              {isExpired ? "Expired" : `Expires ${new Date(`${medicine.expiryDate}T00:00:00`).toLocaleDateString()}`}
            </div>
          )}
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-xl font-bold text-primary">{formatCurrency(medicine.price)}</p>
              {isOutOfStock ? (
                <p className="mt-1 text-xs font-semibold text-destructive">Out of stock</p>
              ) : hasUnits ? (
                <p className="mt-1 text-xs text-muted-foreground" title={`${medicine.quantity} base units`}>
                  {stockDisplay}
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">{medicine.quantity} in stock</p>
              )}
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              {isAdmin && (
                <ManageUnitsDialog medicine={medicine} units={units ?? []} />
              )}
              <Button size="sm" variant="outline" asChild>
                <Link href={`/medicines/${medicine.id}`}>Details</Link>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ManageUnitsDialog({ medicine, units }: { medicine: Medicine; units: MedicineUnit[] }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: liveUnits, isLoading: unitsLoading } = useListMedicineUnits(medicine.id, {
    query: { enabled: open, queryKey: getListMedicineUnitsQueryKey(medicine.id) },
  });

  const displayUnits = liveUnits ?? units;

  const createUnit = useCreateMedicineUnit({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMedicineUnitsQueryKey(medicine.id) });
        queryClient.invalidateQueries({ queryKey: getListMedicinesQueryKey() });
        toast({ title: "Packaging unit added" });
      },
      onError: (err) => toast({ title: "Couldn't add packaging unit", description: getErrorMessage(err), variant: "destructive" }),
    },
  });

  const deleteUnit = useDeleteMedicineUnit({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMedicineUnitsQueryKey(medicine.id) });
        queryClient.invalidateQueries({ queryKey: getListMedicinesQueryKey() });
        toast({ title: "Packaging unit removed" });
      },
      onError: (err) => toast({ title: "Couldn't remove packaging unit", description: getErrorMessage(err), variant: "destructive" }),
    },
  });

  const handleAddUnit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const unitName = fd.get("unitName") as string;
    const factor = parseInt(fd.get("factor") as string, 10);
    const isBase = fd.get("isBase") === "on";
    if (!unitName || !factor || factor < 1) {
      toast({ title: "Fill in unit name and a conversion factor ≥ 1", variant: "destructive" });
      return;
    }
    createUnit.mutate({
      id: medicine.id,
      data: { unitName, conversionFactorToBase: factor, isBaseUnit: isBase },
    });
    (e.target as HTMLFormElement).reset();
  };

  const sorted = [...displayUnits].sort((a, b) => a.conversionFactorToBase - b.conversionFactorToBase);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground h-7 px-2">
          <Package size={13} className="mr-1" /> Units
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Packaging units — {medicine.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* How it works */}
          <div className="rounded-lg bg-muted/50 border border-border p-3 space-y-1.5 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground text-sm">How packaging units work</p>
            <p>Stock is always stored as the <strong>smallest sellable unit</strong> (e.g. individual tablet). Every other unit tells the system how many of those base units it contains.</p>
            <p className="font-medium text-foreground mt-1">Example — 1 strip = 10 tablets:</p>
            <div className="space-y-1 pl-2 border-l-2 border-primary/30">
              <p>① Add <strong>Tablet</strong> · factor <strong>1</strong> · ✓ Base unit &nbsp;→ the individual tablet</p>
              <p>② Add <strong>Strip</strong> · factor <strong>10</strong> &nbsp;→ 1 strip = 10 tablets</p>
              <p>③ Add <strong>Box</strong> · factor <strong>100</strong> &nbsp;→ 1 box = 100 tablets (optional)</p>
            </div>
            <p className="mt-1">In a sale you can then choose <em>Tablet</em> and enter 5 to sell exactly 5 tablets.</p>
          </div>

          {/* Current units */}
          {unitsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2 italic">No packaging units defined yet. Add one below.</p>
          ) : (
            <div className="space-y-2">
              {/* Warning when no base unit (factor=1) is defined */}
              {!sorted.some(u => u.isBaseUnit || u.conversionFactorToBase === 1) && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-700">
                  <span className="text-base leading-none mt-0.5">⚠️</span>
                  <span>
                    <strong>No base unit defined.</strong> You can still sell individual units in the sale form
                    using the "Individual unit (×1)" option, but adding an explicit base unit (e.g. Tablet · factor 1)
                    lets you name it properly.
                  </span>
                </div>
              )}
              {sorted.map((unit) => (
                <div key={unit.id} className="flex items-center justify-between rounded-lg border border-border p-3 bg-muted/20">
                  <div>
                    <span className="font-medium text-sm">{unit.unitName}</span>
                    {unit.isBaseUnit && (
                      <Badge variant="secondary" className="ml-2 text-[10px]">Base</Badge>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      1 {unit.unitName} = {unit.conversionFactorToBase} base unit{unit.conversionFactorToBase !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => deleteUnit.mutate({ id: medicine.id, unitId: unit.id })}
                    disabled={deleteUnit.isPending}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add unit form */}
          <form onSubmit={handleAddUnit} className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">Add packaging unit</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="unitName" className="text-xs">Unit name</Label>
                <Input id="unitName" name="unitName" placeholder="e.g. Tablet, Strip, Box" className="h-9 text-sm" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="factor" className="text-xs">How many base units?</Label>
                <Input id="factor" name="factor" type="number" min="1" placeholder="e.g. 1, 10, 100" className="h-9 text-sm" required />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isBase" name="isBase" className="w-4 h-4 rounded border-input" />
              <Label htmlFor="isBase" className="text-sm font-normal">
                This is the base unit <span className="text-muted-foreground">(set factor to 1, e.g. Tablet)</span>
              </Label>
            </div>
            <Button type="submit" size="sm" disabled={createUnit.isPending} className="w-full">
              {createUnit.isPending ? <Loader2 size={14} className="animate-spin mr-2" /> : <Plus size={14} className="mr-2" />}
              Add unit
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MedicineFormDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: categories } = useListCategories();

  const createMutation = useCreateMedicine({
    mutation: {
      onSuccess: () => {
        toast({ title: "Medicine added", description: "It's now available in your inventory." });
        queryClient.invalidateQueries({ queryKey: getListMedicinesQueryKey() });
        setOpen(false);
      },
      onError: (err) => {
        toast({ title: "Couldn't add medicine", description: getErrorMessage(err), variant: "destructive" });
      },
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      data: {
        name: fd.get("name") as string,
        genericName: fd.get("genericName") as string || undefined,
        categoryId: fd.get("categoryId") ? Number(fd.get("categoryId")) : undefined,
        quantity: Number(fd.get("quantity")),
        price: fd.get("price") as string,
        expiryDate: fd.get("expiryDate") as string,
        prescriptionRequired: fd.get("prescriptionRequired") === "on",
        description: (fd.get("description") as string) || undefined,
        // Extended fields — passed through as any since they're not in the generated schema yet
        ...(fd.get("controlledSchedule") ? { controlledSchedule: fd.get("controlledSchedule") } : {}),
        ...(fd.get("drugClass") ? { drugClass: fd.get("drugClass") } : {}),
      } as any,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="w-4 h-4 mr-2" /> Add Medicine</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Medicine</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" name="name" required placeholder="Amoxicillin 500mg" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="genericName">Generic Name</Label>
            <Input id="genericName" name="genericName" placeholder="Amoxicillin" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Price per base unit *</Label>
              <Input id="price" name="price" type="number" step="0.01" required placeholder="0.50" />
              <p className="text-xs text-muted-foreground">Price per the smallest unit (e.g. per tablet, per ml)</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">Initial stock (base units) *</Label>
              <Input id="quantity" name="quantity" type="number" required placeholder="100" />
              <p className="text-xs text-muted-foreground">Enter in base units (e.g. total tablets)</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="expiryDate">Expiry date *</Label>
            <Input id="expiryDate" name="expiryDate" type="date" min={new Date().toISOString().slice(0, 10)} required />
            <p className="text-xs text-muted-foreground">Expired medicines are blocked at checkout.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="categoryId">Category</Label>
            <select id="categoryId" name="categoryId" className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">Select a category</option>
              {categories?.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Dosage instructions, side effects, etc."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="controlledSchedule">Controlled Schedule</Label>
              <select id="controlledSchedule" name="controlledSchedule" className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Not controlled</option>
                <option value="II">Schedule II</option>
                <option value="III">Schedule III</option>
                <option value="IV">Schedule IV</option>
                <option value="V">Schedule V</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="drugClass">Drug Class</Label>
              <Input id="drugClass" name="drugClass" placeholder="e.g. NSAID, Beta-blocker" />
            </div>
          </div>
          <div className="flex items-center space-x-2 pt-2">
            <input type="checkbox" id="prescriptionRequired" name="prescriptionRequired" className="w-4 h-4 rounded border-input" />
            <Label htmlFor="prescriptionRequired">Requires Prescription</Label>
          </div>
          <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
            💡 After adding the medicine, use the <strong>Units</strong> button on its card to define packaging levels (e.g. tablet → strip → box).
          </p>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving…" : "Save Medicine"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
