import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useListMedicines, useListCategories, useCreateMedicine, useUpdateMedicine, useDeleteMedicine } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Filter, AlertCircle, ShoppingCart } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/utils";

export default function Medicines() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  
  const { data: medicines, isLoading } = useListMedicines({
    query: {
      queryKey: ['medicines', search, categoryId]
    },
    request: {
      url: `/api/medicines?search=${search}${categoryId ? `&categoryId=${categoryId}` : ''}`
    } as any // quick workaround for params 
  });
  
  // Real params if generated properly:
  // useListMedicines({ search, categoryId: categoryId || undefined }) 
  // Let's use standard:
  // wait, looking at schema: useListMedicines(params?)
  
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
          {isAdmin && (
            <MedicineFormDialog />
          )}
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

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1,2,3,4,5,6,7,8].map(i => (
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

function MedicineCard({ medicine, isAdmin }: { medicine: any, isAdmin: boolean }) {
  const isOutOfStock = medicine.quantity === 0;

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
        {medicine.prescriptionRequired && (
          <div className="absolute top-3 left-3">
            <Badge variant="destructive" className="text-[10px] uppercase font-bold tracking-wider">Rx Required</Badge>
          </div>
        )}
      </Link>
      
      <CardContent className="p-5 flex-1 flex flex-col">
        <div className="mb-2">
          <Link href={`/medicines/${medicine.id}`} className="text-lg font-bold hover:text-primary transition-colors line-clamp-1">
            {medicine.name}
          </Link>
          <p className="text-sm text-muted-foreground line-clamp-1" title={medicine.genericName}>
            {medicine.genericName || "—"}
          </p>
        </div>
        
        <div className="mt-auto pt-4 flex items-end justify-between">
          <div>
            <p className="text-xl font-bold text-primary">{formatCurrency(medicine.price)}</p>
            {isOutOfStock ? (
              <p className="text-xs font-semibold text-destructive mt-1">Out of stock</p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">{medicine.quantity} in stock</p>
            )}
          </div>
          
          <Button size="icon" variant={isOutOfStock ? "outline" : "default"} disabled={isOutOfStock} title="Add to cart" asChild>
             <Link href={`/medicines/${medicine.id}`}>
               <ShoppingCart size={18} />
             </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
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
        toast({ title: "Medicine created successfully." });
        queryClient.invalidateQueries({ queryKey: ['/api/medicines'] });
        setOpen(false);
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.response?.data?.error || "Failed to create", variant: "destructive" });
      }
    }
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      name: fd.get("name") as string,
      genericName: fd.get("genericName") as string,
      categoryId: Number(fd.get("categoryId")),
      quantity: Number(fd.get("quantity")),
      price: fd.get("price") as string,
      prescriptionRequired: fd.get("prescriptionRequired") === "on",
      description: fd.get("description") as string,
    };
    
    createMutation.mutate({ data });
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
              <Label htmlFor="price">Price (USD) *</Label>
              <Input id="price" name="price" type="number" step="0.01" required placeholder="12.99" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">Initial Stock *</Label>
              <Input id="quantity" name="quantity" type="number" required placeholder="100" />
            </div>
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
          <div className="flex items-center space-x-2 pt-2">
            <input type="checkbox" id="prescriptionRequired" name="prescriptionRequired" className="w-4 h-4 rounded border-input" />
            <Label htmlFor="prescriptionRequired">Requires Prescription</Label>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending}>Save Medicine</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
