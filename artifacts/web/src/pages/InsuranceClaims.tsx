import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, Plus, FileText } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  useListInsuranceClaims, useCreateInsuranceClaim, useUpdateInsuranceClaim, InsuranceClaim,
} from "@/hooks/use-tier5";
import { Link } from "wouter";

const STATUS_COLORS: Record<string, string> = {
  submitted: "border-blue-400/40 text-blue-600",
  approved: "border-emerald-500/40 text-emerald-600",
  rejected: "border-destructive/40 text-destructive",
  paid: "border-primary/40 text-primary",
};

export default function InsuranceClaims() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const { data: claims, isLoading } = useListInsuranceClaims(statusFilter === "all" ? undefined : statusFilter);
  const [createOpen, setCreateOpen] = useState(false);

  const canManage = user?.role === "admin" || user?.role === "pharmacist";

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-primary" /> Insurance Claims
          </h1>
          <p className="text-muted-foreground mt-1">Track claims filed with insurers for insurance-paid sales.</p>
        </div>
        {canManage && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" /> File Claim</Button>
            </DialogTrigger>
            <NewClaimDialog onClose={() => setCreateOpen(false)} />
          </Dialog>
        )}
      </div>

      <Card>
        <CardContent className="p-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 divide-y divide-border">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted/30 animate-pulse" />)}
            </div>
          ) : !claims?.length ? (
            <div className="p-10 text-center text-muted-foreground text-sm">
              <FileText className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
              No claims found.
            </div>
          ) : (
            claims.map((claim) => <ClaimRow key={claim.id} claim={claim} canManage={canManage} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ClaimRow({ claim, canManage }: { claim: InsuranceClaim; canManage: boolean }) {
  const { toast } = useToast();
  const updateClaim = useUpdateInsuranceClaim();

  return (
    <div className="p-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate">{claim.providerName}</p>
          <Badge variant="outline" className={`text-[10px] capitalize ${STATUS_COLORS[claim.status]}`}>{claim.status}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          <Link href={`/sales/${claim.orderId}`} className="hover:underline">Sale #{claim.orderId}</Link>
          {claim.policyNumber && ` · Policy ${claim.policyNumber}`} · Filed {formatDate(claim.submittedAt)}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <p className="font-semibold">{formatCurrency(claim.claimAmount)}</p>
        {canManage && claim.status !== "paid" && (
          <Select
            value={claim.status}
            onValueChange={(status) => updateClaim.mutate(
              { id: claim.id, status },
              {
                onSuccess: () => toast({ title: "Claim updated" }),
                onError: (err) => toast({ title: "Couldn't update claim", description: err.message, variant: "destructive" }),
              }
            )}
          >
            <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

function NewClaimDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const createClaim = useCreateInsuranceClaim();
  const [orderId, setOrderId] = useState("");
  const [providerName, setProviderName] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [claimAmount, setClaimAmount] = useState("");
  const [notes, setNotes] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createClaim.mutate(
      {
        orderId: Number(orderId),
        providerName: providerName.trim(),
        policyNumber: policyNumber.trim() || undefined,
        claimAmount: parseFloat(claimAmount) || 0,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: () => { toast({ title: "Claim filed" }); onClose(); },
        onError: (err) => toast({ title: "Couldn't file claim", description: err.message, variant: "destructive" }),
      }
    );
  }

  return (
    <DialogContent className="sm:max-w-[440px]">
      <DialogHeader><DialogTitle>File Insurance Claim</DialogTitle></DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        <div className="space-y-2">
          <Label htmlFor="claim-order">Sale ID *</Label>
          <Input id="claim-order" type="number" min={1} value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="e.g. 42" required />
          <p className="text-xs text-muted-foreground">Find this on the Sale Detail page's URL or header.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="claim-provider">Insurance Provider *</Label>
          <Input id="claim-provider" value={providerName} onChange={(e) => setProviderName(e.target.value)} placeholder="e.g. BlueCross" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="claim-policy">Policy Number</Label>
          <Input id="claim-policy" value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} placeholder="Optional" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="claim-amount">Claim Amount *</Label>
          <Input id="claim-amount" type="number" min={0} step="0.01" value={claimAmount} onChange={(e) => setClaimAmount(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="claim-notes">Notes</Label>
          <Textarea id="claim-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </div>
        <Button type="submit" className="w-full" disabled={createClaim.isPending}>
          {createClaim.isPending ? "Submitting…" : "File Claim"}
        </Button>
      </form>
    </DialogContent>
  );
}
