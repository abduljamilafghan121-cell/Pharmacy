import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileCheck, Plus, ClipboardList, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useListMedicines, useListPatients } from "@workspace/api-client-react";
import {
  useListPreAuths, useCreatePreAuth, useUpdatePreAuth, type InsurancePreAuth,
} from "@/hooks/use-tier5";

const STATUS_COLORS: Record<string, string> = {
  pending: "border-amber-400/40 text-amber-600",
  approved: "border-emerald-500/40 text-emerald-600",
  denied: "border-destructive/40 text-destructive",
  expired: "border-muted-foreground/40 text-muted-foreground",
};

export default function PreAuthorizations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: preAuths, isLoading } = useListPreAuths(statusFilter === "all" ? undefined : statusFilter);
  const canManage = user?.role === "admin" || user?.role === "pharmacist";

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <FileCheck className="w-7 h-7 text-primary" /> Insurance Pre-Authorizations
          </h1>
          <p className="text-muted-foreground mt-1">
            Track PA requests submitted to insurers before dispensing.
          </p>
        </div>
        {canManage && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" /> New PA Request</Button>
            </DialogTrigger>
            <NewPADialog onClose={() => setCreateOpen(false)} />
          </Dialog>
        )}
      </div>

      {/* Filter */}
      <Card>
        <CardContent className="p-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="denied">Denied</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardContent className="p-0 divide-y divide-border">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : !preAuths?.length ? (
            <div className="p-10 text-center text-muted-foreground text-sm">
              <ClipboardList className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
              No pre-authorization requests found.
            </div>
          ) : (
            preAuths.map((pa) => (
              <PARow key={pa.id} pa={pa} canManage={canManage} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PARow({ pa, canManage }: { pa: InsurancePreAuth; canManage: boolean }) {
  const { toast } = useToast();
  const updatePA = useUpdatePreAuth();
  const [refOpen, setRefOpen] = useState(false);
  const [refNumber, setRefNumber] = useState(pa.referenceNumber ?? "");

  function handleStatusChange(status: string) {
    updatePA.mutate(
      { id: pa.id, status },
      {
        onSuccess: () => toast({ title: "Status updated" }),
        onError: (err) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
      }
    );
  }

  function handleRefSave() {
    updatePA.mutate(
      { id: pa.id, referenceNumber: refNumber || null },
      {
        onSuccess: () => { toast({ title: "Reference number saved" }); setRefOpen(false); },
        onError: (err) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
      }
    );
  }

  return (
    <div className="p-4 space-y-1.5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium">{pa.medicineName ?? `Medicine #${pa.medicineId}`}</p>
            <Badge variant="outline" className={`text-[10px] capitalize ${STATUS_COLORS[pa.status]}`}>
              {pa.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pa.insurerName}
            {pa.policyNumber && ` · Policy ${pa.policyNumber}`}
            {pa.diagnosisCode && ` · DX: ${pa.diagnosisCode}`}
          </p>
          <p className="text-xs text-muted-foreground">
            {pa.patientName && `Patient: ${pa.patientName} · `}
            Requested by {pa.requestedByName ?? "unknown"} on {formatDate(pa.submittedAt)}
            {pa.resolvedAt && ` · Resolved ${formatDate(pa.resolvedAt)}`}
          </p>
          {pa.referenceNumber && (
            <p className="text-xs font-medium text-primary mt-0.5">Ref: {pa.referenceNumber}</p>
          )}
        </div>
        {canManage && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {/* Reference number edit */}
            <Dialog open={refOpen} onOpenChange={setRefOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 text-xs">
                  {pa.referenceNumber ? "Edit Ref#" : "Add Ref#"}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[360px]">
                <DialogHeader><DialogTitle>Authorization Reference Number</DialogTitle></DialogHeader>
                <div className="space-y-3 mt-2">
                  <Input
                    placeholder="e.g. AUTH-2026-00123"
                    value={refNumber}
                    onChange={(e) => setRefNumber(e.target.value)}
                  />
                  <Button className="w-full" onClick={handleRefSave} disabled={updatePA.isPending}>
                    {updatePA.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Save
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Status selector */}
            {pa.status !== "approved" && pa.status !== "denied" ? (
              <Select value={pa.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="denied">Denied</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="outline" className={`capitalize ${STATUS_COLORS[pa.status]}`}>
                {pa.status}
              </Badge>
            )}
          </div>
        )}
      </div>
      {pa.notes && <p className="text-xs text-muted-foreground italic">{pa.notes}</p>}
    </div>
  );
}

function NewPADialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const createPA = useCreatePreAuth();
  const { data: medicines } = useListMedicines();
  const { data: patients } = useListPatients();

  const [medicineId, setMedicineId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [insurerName, setInsurerName] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [diagnosisCode, setDiagnosisCode] = useState("");
  const [notes, setNotes] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!medicineId || !insurerName.trim()) return;
    createPA.mutate(
      {
        medicineId: Number(medicineId),
        patientId: patientId ? Number(patientId) : undefined,
        insurerName: insurerName.trim(),
        policyNumber: policyNumber.trim() || undefined,
        diagnosisCode: diagnosisCode.trim() || undefined,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: () => { toast({ title: "PA request submitted" }); onClose(); },
        onError: (err) => toast({ title: "Submission failed", description: err.message, variant: "destructive" }),
      }
    );
  }

  return (
    <DialogContent className="sm:max-w-[480px]">
      <DialogHeader><DialogTitle>New Pre-Authorization Request</DialogTitle></DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        <div className="space-y-2">
          <Label>Medicine *</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={medicineId}
            onChange={(e) => setMedicineId(e.target.value)}
            required
          >
            <option value="">Select medicine</option>
            {(medicines ?? []).map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Patient (optional)</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
          >
            <option value="">Walk-in / not recorded</option>
            {(patients ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Insurance Provider *</Label>
            <Input value={insurerName} onChange={(e) => setInsurerName(e.target.value)} placeholder="e.g. BlueCross" required />
          </div>
          <div className="space-y-2">
            <Label>Policy Number</Label>
            <Input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Diagnosis Code (ICD)</Label>
          <Input value={diagnosisCode} onChange={(e) => setDiagnosisCode(e.target.value)} placeholder="e.g. J45.9" />
        </div>
        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Clinical justification, attachments needed, etc." />
        </div>
        <Button type="submit" className="w-full" disabled={createPA.isPending}>
          {createPA.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Submit PA Request
        </Button>
      </form>
    </DialogContent>
  );
}
