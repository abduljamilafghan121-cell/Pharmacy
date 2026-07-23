import { useRoute } from "wouter";
import { useGetMedicine, useDeleteMedicine } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Pill, ArrowLeft, Trash2, Info, AlertTriangle } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { Link } from "wouter";

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
          {isOutOfStock ? (
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
          <Button size="lg" className="mb-4" asChild>
            <Link href="/new-sale">Add to Sale</Link>
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
