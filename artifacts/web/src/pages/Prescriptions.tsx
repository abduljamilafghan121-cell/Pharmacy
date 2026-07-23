import { useState } from "react";
import { useListPrescriptions, useVerifyPrescription, useRejectPrescription, useCreatePrescription } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, CheckCircle, XCircle, Plus, User, Stethoscope } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function Prescriptions() {
  const { data: prescriptions, isLoading } = useListPrescriptions();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Prescriptions</h1>
          <p className="text-muted-foreground mt-1">Record and verify patient prescriptions.</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus size={16} className="mr-2" /> New Prescription</Button>
          </DialogTrigger>
          <NewPrescriptionDialog onClose={() => setDialogOpen(false)} />
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3].map(i => <div key={i} className="h-[200px] bg-muted/50 animate-pulse rounded-xl" />)}
        </div>
      ) : prescriptions?.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="text-lg font-medium">No prescriptions recorded</h3>
          <p className="text-muted-foreground mt-1 text-sm">Create a new prescription to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {prescriptions?.map(rx => (
            <PrescriptionCard key={rx.id} rx={rx} />
          ))}
        </div>
      )}
    </div>
  );
}

function NewPrescriptionDialog({ onClose }: { onClose: () => void }) {
  const [patientName, setPatientName] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [notes, setNotes] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createMutation = useCreatePrescription({
    mutation: {
      onSuccess: () => {
        toast({ title: "Prescription recorded" });
        queryClient.invalidateQueries({ queryKey: ["/api/prescriptions"] });
        onClose();
      },
      onError: () => toast({ title: "Failed to save", variant: "destructive" }),
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      data: {
        patientName: patientName.trim() || undefined,
        doctorName: doctorName.trim() || undefined,
        notes: notes.trim() || undefined,
      },
    });
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Record Prescription</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        <div className="space-y-1">
          <Label htmlFor="rxPatient">Patient Name</Label>
          <Input id="rxPatient" value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="Patient full name" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rxDoctor">Prescribing Doctor</Label>
          <Input id="rxDoctor" value={doctorName} onChange={e => setDoctorName(e.target.value)} placeholder="Dr. Name" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rxNotes">Prescription Notes</Label>
          <Input id="rxNotes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Medicines, dosage, instructions…" />
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={createMutation.isPending}>Save</Button>
        </div>
      </form>
    </DialogContent>
  );
}

function PrescriptionCard({ rx }: { rx: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const verifyMutation = useVerifyPrescription({
    mutation: {
      onSuccess: () => {
        toast({ title: "Prescription verified" });
        queryClient.invalidateQueries({ queryKey: ["/api/prescriptions"] });
      },
    },
  });

  const rejectMutation = useRejectPrescription({
    mutation: {
      onSuccess: () => {
        toast({ title: "Prescription rejected" });
        queryClient.invalidateQueries({ queryKey: ["/api/prescriptions"] });
      },
    },
  });

  const statusColors: Record<string, any> = {
    pending: "warning",
    verified: "success",
    rejected: "destructive",
  };

  return (
    <Card className="flex flex-col">
      <CardContent className="p-6 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">RX #{rx.id}</p>
            <p className="font-semibold mt-1 flex items-center gap-1">
              <User size={14} className="text-muted-foreground" />
              {rx.patientName || <span className="text-muted-foreground italic text-sm">Unknown patient</span>}
            </p>
          </div>
          <Badge variant={statusColors[rx.status] || "default"} className="capitalize">
            {rx.status}
          </Badge>
        </div>

        <div className="space-y-2 mb-4 flex-1">
          {rx.doctorName && (
            <p className="text-sm flex items-center gap-2 text-muted-foreground">
              <Stethoscope size={13} />
              <span>Dr. {rx.doctorName}</span>
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Recorded: {formatDate(rx.createdAt)}
          </p>
          {rx.notes && (
            <div className="bg-muted/50 p-3 rounded-md text-sm border border-border">
              <p className="text-muted-foreground mb-1">Notes:</p>
              <p>{rx.notes}</p>
            </div>
          )}
        </div>

        {rx.status === 'pending' && (
          <div className="flex gap-2 mt-auto pt-4 border-t border-border">
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
                if (reason) rejectMutation.mutate({ id: rx.id, data: { notes: reason } });
              }}
            >
              <XCircle className="w-4 h-4 mr-2" /> Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
