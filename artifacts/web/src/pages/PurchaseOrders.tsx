import { useListPurchaseOrders } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PackageSearch } from "lucide-react";

export default function PurchaseOrders() {
  const { data: pos, isLoading } = useListPurchaseOrders();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Purchase Orders</h1>
        <p className="text-muted-foreground mt-1">Manage restock requests to suppliers.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[100px]">PO #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">Loading...</TableCell>
                </TableRow>
              ) : pos?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    <PackageSearch className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    No purchase orders found.
                  </TableCell>
                </TableRow>
              ) : (
                pos?.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell className="font-medium">#{po.id}</TableCell>
                    <TableCell>{formatDate(po.createdAt)}</TableCell>
                    <TableCell>{po.supplierName}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(po.total)}</TableCell>
                    <TableCell>
                      <Badge variant={po.status === 'received' ? 'success' : po.status === 'cancelled' ? 'destructive' : 'warning'}>
                        {po.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
