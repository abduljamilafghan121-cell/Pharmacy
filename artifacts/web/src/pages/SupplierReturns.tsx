import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Undo2, Truck } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useListSupplierReturns } from "@/hooks/use-tier5";

export default function SupplierReturns() {
  const { data: returns, isLoading } = useListSupplierReturns();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Undo2 className="w-7 h-7 text-primary" /> Supplier Returns
        </h1>
        <p className="text-muted-foreground mt-1">
          Stock sent back to suppliers for credit. Start a return from a medicine's batch list.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Most recent first.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 divide-y divide-border">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted/30 animate-pulse" />)}
            </div>
          ) : !returns?.length ? (
            <div className="p-10 text-center text-muted-foreground text-sm">
              <Truck className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
              No supplier returns yet.
            </div>
          ) : (
            returns.map((ret) => (
              <div key={ret.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{ret.supplierName ?? "Supplier"}</p>
                  <p className="text-sm text-muted-foreground">{ret.reason}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatDate(ret.createdAt)}</p>
                </div>
                <p className="font-semibold text-emerald-600">+{formatCurrency(ret.totalAmount)} credit</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
