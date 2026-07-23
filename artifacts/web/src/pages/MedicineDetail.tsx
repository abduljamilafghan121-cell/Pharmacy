import { useRoute } from "wouter";
import { useGetMedicine, useDeleteMedicine } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Pill, ArrowLeft, Trash2, Edit, ShoppingCart, Info, AlertTriangle } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { useCart } from "@/hooks/use-cart";
import { useState } from "react";
import { Input } from "@/components/ui/input";

export default function MedicineDetail() {
  const [, params] = useRoute("/medicines/:id");
  const id = Number(params?.id);
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { addToCart } = useCart();
  const [quantity, setQuantity] = useState(1);

  const { data: medicine, isLoading } = useGetMedicine(id, {
    query: { enabled: !!id }
  });

  const deleteMutation = useDeleteMedicine({
    mutation: {
      onSuccess: () => {
        toast({ title: "Medicine deleted" });
        queryClient.invalidateQueries({ queryKey: ['/api/medicines'] });
        setLocation("/medicines");
      }
    }
  });

  if (isLoading) return <div className="p-10 text-center">Loading...</div>;
  if (!medicine) return <div className="p-10 text-center">Medicine not found.</div>;

  const isAdmin = user?.role === "admin" || user?.role === "pharmacist";
  const isOutOfStock = medicine.quantity === 0;

  const handleAddToCart = () => {
    if (quantity > medicine.quantity) {
      toast({ title: "Not enough stock", variant: "destructive" });
      return;
    }
    addToCart({ ...medicine, selectedQuantity: quantity });
    toast({ title: "Added to cart", description: `${quantity}x ${medicine.name}` });
  };

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
                <Badge variant="destructive" className="uppercase tracking-wide text-[10px]">Rx Required</Badge>
              )}
            </div>
            
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-1">
              {medicine.name}
            </h1>
            {medicine.genericName && (
              <p className="text-lg text-muted-foreground">{medicine.genericName}</p>
            )}
          </div>

          <div className="text-3xl font-bold text-primary mb-6">
            {formatCurrency(medicine.price)}
          </div>

          <div className="bg-muted/30 rounded-xl p-6 mb-8 border border-border">
            <h3 className="font-semibold flex items-center gap-2 mb-3 text-foreground">
              <Info className="w-4 h-4 text-primary" /> About this medicine
            </h3>
            <p className="text-muted-foreground leading-relaxed text-sm">
              {medicine.description || "No description provided."}
            </p>
          </div>

          {user?.role === "customer" && (
            <div className="mt-auto space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-24">
                  <Input 
                    type="number" 
                    min={1} 
                    max={medicine.quantity} 
                    value={quantity} 
                    onChange={e => setQuantity(Number(e.target.value))}
                    disabled={isOutOfStock}
                    className="text-center text-lg font-medium h-12"
                  />
                </div>
                <Button 
                  size="lg" 
                  className="flex-1 h-12 text-base" 
                  disabled={isOutOfStock}
                  onClick={handleAddToCart}
                >
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  {isOutOfStock ? "Out of Stock" : "Add to Cart"}
                </Button>
              </div>
              <p className="text-sm text-center text-muted-foreground">
                {medicine.quantity} units available
              </p>
            </div>
          )}

          {isAdmin && (
            <div className="mt-auto pt-6 border-t border-border grid grid-cols-2 gap-4">
              <div className="col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-card p-3 rounded-lg border border-border shadow-sm">
                  <p className="text-xs text-muted-foreground mb-1">Stock</p>
                  <p className="font-bold text-lg">{medicine.quantity}</p>
                </div>
                <div className="bg-card p-3 rounded-lg border border-border shadow-sm">
                  <p className="text-xs text-muted-foreground mb-1">Batch</p>
                  <p className="font-medium truncate">{medicine.batchNumber || "—"}</p>
                </div>
                <div className="bg-card p-3 rounded-lg border border-border shadow-sm col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">Expiry</p>
                  <p className="font-medium">{medicine.expiryDate ? formatDate(medicine.expiryDate) : "—"}</p>
                </div>
              </div>
              <Button variant="outline" className="w-full">
                <Edit className="w-4 h-4 mr-2" /> Edit Details
              </Button>
              <Button 
                variant="destructive" 
                className="w-full"
                onClick={() => {
                  if(confirm("Are you sure you want to delete this medicine?")) {
                    deleteMutation.mutate({ id });
                  }
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
