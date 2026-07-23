import { useListSuppliers, useCreateSupplier } from "@workspace/api-client-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { Truck, Plus, Mail, Phone, MapPin } from "lucide-react";

export default function Suppliers() {
  const { data: suppliers, isLoading } = useListSuppliers();
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const createMutation = useCreateSupplier({
    mutation: {
      onSuccess: () => {
        toast({ title: "Supplier added" });
        queryClient.invalidateQueries({ queryKey: ['/api/suppliers'] });
        setOpen(false);
      }
    }
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      data: {
        name: fd.get("name") as string,
        contactName: fd.get("contactName") as string,
        email: fd.get("email") as string,
        phone: fd.get("phone") as string,
        address: fd.get("address") as string,
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Suppliers</h1>
          <p className="text-muted-foreground mt-1">Manage pharmaceutical distributors and manufacturers.</p>
        </div>
        
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Add Supplier</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Supplier</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Company Name *</Label>
                <Input id="name" name="name" required placeholder="PharmaCorp Inc." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactName">Contact Person</Label>
                <Input id="contactName" name="contactName" placeholder="John Smith" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" placeholder="contact@pharmacorp.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" name="phone" placeholder="(555) 123-4567" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" name="address" placeholder="123 Distribution Way" />
              </div>
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={createMutation.isPending}>Save Supplier</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Location</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">Loading...</TableCell>
                </TableRow>
              ) : suppliers?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    <Truck className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    No suppliers configured.
                  </TableCell>
                </TableRow>
              ) : (
                suppliers?.map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell className="font-semibold">{supplier.name}</TableCell>
                    <TableCell>{supplier.contactName || "—"}</TableCell>
                    <TableCell>
                      {supplier.email && (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                          <Mail className="w-3 h-3" /> {supplier.email}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {supplier.phone && (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                          <Phone className="w-3 h-3" /> {supplier.phone}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {supplier.address && (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                          <MapPin className="w-3 h-3" /> <span className="truncate max-w-[200px] block" title={supplier.address}>{supplier.address}</span>
                        </div>
                      )}
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
