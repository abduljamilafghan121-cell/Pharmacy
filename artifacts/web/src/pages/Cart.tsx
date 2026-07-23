import { useState } from "react";
import { useCart } from "@/hooks/use-cart";
import { Link, useLocation } from "wouter";
import { useCreateOrder, useCreatePrescription } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Trash2, Plus, Minus, FileText, AlertCircle, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { Label } from "@/components/ui/label";

export default function Cart() {
  const { items, removeFromCart, updateQuantity, getCartTotal, requiresPrescription, clearCart } = useCart();
  const [prescriptionUrl, setPrescriptionUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const createOrderMutation = useCreateOrder();
  const createPrescriptionMutation = useCreatePrescription();

  const subtotal = getCartTotal();
  const needsRx = requiresPrescription();

  const handleCheckout = async () => {
    if (needsRx && !prescriptionUrl) {
      toast({ title: "Prescription required", description: "Please provide a prescription image URL.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      let prescriptionId = undefined;

      if (needsRx) {
        const rxRes = await createPrescriptionMutation.mutateAsync({
          data: { imageUrl: prescriptionUrl, notes }
        });
        prescriptionId = rxRes.id;
      }

      const orderRes = await createOrderMutation.mutateAsync({
        data: {
          prescriptionId,
          items: items.map(i => ({ medicineId: i.id, quantity: i.selectedQuantity }))
        }
      });

      clearCart();
      toast({ title: "Order placed successfully!", description: `Order #${orderRes.id} has been created.` });
      setLocation(`/orders/${orderRes.id}`);
    } catch (err: any) {
      toast({ 
        title: "Checkout failed", 
        description: err.response?.data?.error || "An error occurred", 
        variant: "destructive" 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 animate-in fade-in">
        <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
          <ShoppingCartEmpty className="w-12 h-12 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground mb-2">Your cart is empty</h2>
        <p className="text-muted-foreground max-w-md mb-8">
          Looks like you haven't added any medicines to your cart yet.
        </p>
        <Button size="lg" asChild>
          <Link href="/medicines">Browse Medicines</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Shopping Cart</h1>
        <p className="text-muted-foreground mt-1">Review your items and proceed to checkout.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="border-b border-border pb-4">
              <CardTitle>Cart Items ({items.length})</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {items.map((item) => (
                <div key={item.id} className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pb-6 border-b border-border last:border-0 last:pb-0">
                  <div className="w-20 h-20 bg-muted/30 rounded-lg flex items-center justify-center flex-shrink-0 border border-border">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="w-16 h-16 object-contain mix-blend-multiply" />
                    ) : (
                      <span className="text-primary font-bold text-xl">{item.name.charAt(0)}</span>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <Link href={`/medicines/${item.id}`} className="font-bold text-lg hover:text-primary transition-colors truncate block">
                      {item.name}
                    </Link>
                    <p className="text-sm text-muted-foreground">{item.genericName}</p>
                    {item.prescriptionRequired && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-destructive bg-destructive/10 px-2 py-0.5 rounded-full mt-2">
                        <AlertCircle className="w-3 h-3" /> Rx Required
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between w-full sm:w-auto gap-6 mt-2 sm:mt-0">
                    <div className="flex items-center border border-input rounded-md overflow-hidden bg-background">
                      <button 
                        className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                        onClick={() => updateQuantity(item.id, Math.max(1, item.selectedQuantity - 1))}
                        disabled={item.selectedQuantity <= 1}
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-10 text-center text-sm font-medium">{item.selectedQuantity}</span>
                      <button 
                        className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                        onClick={() => updateQuantity(item.id, Math.min(item.quantity, item.selectedQuantity + 1))}
                        disabled={item.selectedQuantity >= item.quantity}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    
                    <div className="text-right min-w-[80px]">
                      <p className="font-bold">{formatCurrency(parseFloat(item.price) * item.selectedQuantity)}</p>
                    </div>

                    <button 
                      onClick={() => removeFromCart(item.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-2"
                      title="Remove item"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {needsRx && (
            <Card className="border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20">
              <CardHeader>
                <CardTitle className="text-amber-800 dark:text-amber-500 flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Prescription Required
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-amber-700 dark:text-amber-600">
                  One or more items in your cart require a valid prescription. Please provide a link to your prescription image.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="rxUrl" className="text-amber-900 dark:text-amber-400">Prescription Image URL</Label>
                  <Input 
                    id="rxUrl" 
                    placeholder="https://example.com/prescription.jpg" 
                    value={prescriptionUrl}
                    onChange={(e) => setPrescriptionUrl(e.target.value)}
                    className="bg-white dark:bg-background border-amber-200 dark:border-amber-900 focus-visible:ring-amber-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rxNotes" className="text-amber-900 dark:text-amber-400">Notes for Pharmacist (Optional)</Label>
                  <Input 
                    id="rxNotes" 
                    placeholder="e.g., Doctor mentioned substitution is okay" 
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="bg-white dark:bg-background border-amber-200 dark:border-amber-900 focus-visible:ring-amber-500"
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-1">
          <Card className="sticky top-24">
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Shipping</span>
                <span className="font-medium">Free</span>
              </div>
              <div className="pt-4 border-t border-border flex justify-between">
                <span className="font-bold text-lg">Total</span>
                <span className="font-bold text-lg text-primary">{formatCurrency(subtotal)}</span>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full h-12 text-lg" 
                onClick={handleCheckout}
                disabled={isSubmitting || (needsRx && !prescriptionUrl)}
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
                Checkout
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ShoppingCartEmpty(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </svg>
  );
}
