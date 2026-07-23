import { useListPrescriptions, useVerifyPrescription, useRejectPrescription } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, CheckCircle, XCircle, ExternalLink } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function Prescriptions() {
  const { user } = useAuth();
  const { data: prescriptions, isLoading } = useListPrescriptions();
  
  const isAdmin = user?.role === "admin" || user?.role === "pharmacist";

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Prescriptions</h1>
        <p className="text-muted-foreground mt-1">
          {isAdmin ? "Review and verify customer prescriptions." : "Manage your uploaded prescriptions."}
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3].map(i => <div key={i} className="h-[200px] bg-muted/50 animate-pulse rounded-xl" />)}
        </div>
      ) : prescriptions?.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="text-lg font-medium">No prescriptions found</h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {prescriptions?.map(rx => (
            <PrescriptionCard key={rx.id} rx={rx} isAdmin={isAdmin} />
          ))}
        </div>
      )}
    </div>
  );
}

function PrescriptionCard({ rx, isAdmin }: { rx: any, isAdmin: boolean }) {
  const [showImage, setShowImage] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const verifyMutation = useVerifyPrescription({
    mutation: {
      onSuccess: () => {
        toast({ title: "Prescription verified" });
        queryClient.invalidateQueries({ queryKey: ['/api/prescriptions'] });
      }
    }
  });

  const rejectMutation = useRejectPrescription({
    mutation: {
      onSuccess: () => {
        toast({ title: "Prescription rejected" });
        queryClient.invalidateQueries({ queryKey: ['/api/prescriptions'] });
      }
    }
  });

  const statusColors: any = {
    pending: "warning",
    verified: "success",
    rejected: "destructive"
  };

  return (
    <>
      <Card className="flex flex-col">
        <CardContent className="p-6 flex-1 flex flex-col">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">RX #{rx.id}</p>
              <p className="font-semibold mt-1">{rx.customerName}</p>
            </div>
            <Badge variant={statusColors[rx.status] || "default"} className="capitalize">
              {rx.status}
            </Badge>
          </div>
          
          <div className="space-y-3 mb-6 flex-1">
            <p className="text-sm">
              <span className="text-muted-foreground">Date:</span> {formatDate(rx.createdAt)}
            </p>
            {rx.notes && (
              <div className="bg-muted/50 p-3 rounded-md text-sm border border-border">
                <p className="text-muted-foreground mb-1">Notes:</p>
                <p>{rx.notes}</p>
              </div>
            )}
          </div>
          
          <div className="flex gap-2 mt-auto pt-4 border-t border-border">
            <Button variant="outline" className="flex-1" onClick={() => setShowImage(true)} disabled={!rx.imageUrl}>
              <ExternalLink className="w-4 h-4 mr-2" /> View Image
            </Button>
          </div>
          
          {isAdmin && rx.status === 'pending' && (
            <div className="flex gap-2 mt-3">
              <Button 
                variant="default" 
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={verifyMutation.isPending}
                onClick={() => verifyMutation.mutate({ id: rx.id, data: { notes: "Verified by pharmacist" } })}
              >
                <CheckCircle className="w-4 h-4 mr-2" /> Verify
              </Button>
              <Button 
                variant="destructive" 
                className="flex-1"
                disabled={rejectMutation.isPending}
                onClick={() => {
                  const reason = prompt("Reason for rejection:");
                  if(reason) {
                    rejectMutation.mutate({ id: rx.id, data: { notes: reason } });
                  }
                }}
              >
                <XCircle className="w-4 h-4 mr-2" /> Reject
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      
      <Dialog open={showImage} onOpenChange={setShowImage}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Prescription Image</DialogTitle>
          </DialogHeader>
          <div className="mt-4 flex justify-center bg-muted rounded-lg p-2 overflow-hidden h-[60vh]">
            <img src={rx.imageUrl} alt="Prescription" className="object-contain w-full h-full" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
