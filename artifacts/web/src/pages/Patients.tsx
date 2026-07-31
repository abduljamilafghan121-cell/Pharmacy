import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Plus, Search, Phone, ShieldAlert, Activity, Trash2, Loader2, AlertTriangle, ClipboardList, Printer, ChevronLeft, ChevronRight } from "lucide-react";
import { ErrorState } from "@/components/ui/error-state";
import { useToast } from "@/components/ui/use-toast";
import { formatDate } from "@/lib/utils";

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("pharma_token");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...getAuthHeaders(), ...init?.headers } });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || body?.detail || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

interface Patient {
  id: number;
  name: string;
  phone?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  notes?: string | null;
  createdAt: string;
  allergyCount?: number;
}

interface PatientAllergy {
  id: number;
  allergen: string;
  severity: "mild" | "moderate" | "severe";
  reaction?: string | null;
}

interface PatientCondition {
  id: number;
  condition: string;
  notes?: string | null;
}

interface DispensingHistoryItem {
  orderId: number;
  orderDate: string;
  orderStatus: string;
  orderTotal: string;
  servedByName?: string | null;
  itemId: number;
  medicineId: number;
  medicineName?: string | null;
  medicineStrength?: string | null;
  quantity: number;
  unitName?: string | null;
  price: string;
  returnedQuantity?: number | null;
}

const SEVERITY_BADGE: Record<string, string> = {
  mild: "bg-blue-100 text-blue-700",
  moderate: "bg-amber-100 text-amber-700",
  severe: "bg-red-100 text-red-700",
};

export default function Patients() {
  const [search, setSearch] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const { toast } = useToast();

  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newDob, setNewDob] = useState("");
  const [newGender, setNewGender] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const loadPatients = useCallback(async (q?: string) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const url = q ? `/api/patients?search=${encodeURIComponent(q)}` : "/api/patients";
      const data = await apiFetch<Patient[]>(url);
      setPatients(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load patients.";
      setLoadError(msg);
      toast({ title: "Couldn't load patients", description: msg, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadPatients(); }, [loadPatients]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); loadPatients(search); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsSaving(true);
    try {
      await apiFetch("/api/patients", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          phone: newPhone.trim() || undefined,
          dateOfBirth: newDob || undefined,
          gender: newGender || undefined,
          notes: newNotes.trim() || undefined,
        }),
      });
      toast({ title: "Patient registered", description: "Their record is now in the system." });
      setNewName(""); setNewPhone(""); setNewDob(""); setNewGender(""); setNewNotes("");
      setDialogOpen(false);
      loadPatients(search);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to register patient.";
      toast({ title: "Couldn't register patient", description: msg, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Patients</h1>
          <p className="text-muted-foreground mt-1">Register and look up patients for repeat visits.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus size={16} className="mr-2" /> New Patient</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Register Patient</DialogTitle></DialogHeader>
            <form onSubmit={handleSave} className="space-y-4 mt-2">
              <div className="space-y-1">
                <Label htmlFor="pname">Full Name *</Label>
                <Input id="pname" value={newName} onChange={e => setNewName(e.target.value)} placeholder="John Doe" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="pphone">Phone</Label>
                  <Input id="pphone" value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+1 000 000 0000" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pgender">Gender</Label>
                  <select
                    id="pgender"
                    value={newGender}
                    onChange={e => setNewGender(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select…</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="pdob">Date of Birth</Label>
                <Input id="pdob" type="date" value={newDob} onChange={e => setNewDob(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pnotes">Notes</Label>
                <Input id="pnotes" value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="General notes…" />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isSaving || !newName.trim()}>{isSaving ? "Saving…" : "Save"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <form onSubmit={handleSearch} className="flex gap-3 max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input placeholder="Search by name…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button type="submit" variant="outline">Search</Button>
      </form>

      {loadError ? (
        <ErrorState title="Failed to load patients" message={loadError} onRetry={() => loadPatients(search)} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>DOB / Gender</TableHead>
                  <TableHead>Allergies</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading patients…</TableCell>
                  </TableRow>
                ) : patients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      <div className="flex flex-col items-center gap-3">
                        <Users className="w-12 h-12 text-muted-foreground/50" />
                        <p>No patients found.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  patients.map((p) => (
                    <TableRow key={p.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setSelectedPatient(p)}>
                      <TableCell className="font-medium">#{p.id}</TableCell>
                      <TableCell className="font-medium text-foreground">{p.name}</TableCell>
                      <TableCell>
                        {p.phone
                          ? <span className="flex items-center gap-1 text-sm text-muted-foreground"><Phone size={12} />{p.phone}</span>
                          : <span className="text-muted-foreground/50 text-sm">—</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.dateOfBirth ? new Date(`${p.dateOfBirth}T00:00:00`).toLocaleDateString() : "—"}
                        {p.gender && <span className="ml-1 capitalize">({p.gender})</span>}
                      </TableCell>
                      <TableCell>
                        {(p.allergyCount ?? 0) > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                            <AlertTriangle size={11} />
                            {p.allergyCount} allerg{p.allergyCount === 1 ? "y" : "ies"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50 text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-xs truncate">{p.notes ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatDate(p.createdAt)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" className="text-xs" onClick={e => { e.stopPropagation(); setSelectedPatient(p); }}>
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {selectedPatient && (
        // key forces a full remount when patient changes — prevents stale allergies/history
        <PatientSafetyDialog key={selectedPatient.id} patient={selectedPatient} onClose={() => setSelectedPatient(null)} />
      )}
    </div>
  );
}

function PatientSafetyDialog({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const { toast } = useToast();
  const [allergies, setAllergies] = useState<PatientAllergy[]>([]);
  const [conditions, setConditions] = useState<PatientCondition[]>([]);
  const [loadingA, setLoadingA] = useState(true);
  const [loadingC, setLoadingC] = useState(true);

  const [allergen, setAllergen] = useState("");
  const [severity, setSeverity] = useState<"mild" | "moderate" | "severe">("moderate");
  const [reaction, setReaction] = useState("");
  const [savingA, setSavingA] = useState(false);

  const [conditionName, setConditionName] = useState("");
  const [condNotes, setCondNotes] = useState("");
  const [savingC, setSavingC] = useState(false);

  // Dispensing history
  const [history, setHistory] = useState<DispensingHistoryItem[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [printHistory, setPrintHistory] = useState<DispensingHistoryItem[] | null>(null);
  const [printLoading, setPrintLoading] = useState(false);
  const HISTORY_LIMIT = 20;

  // Load all three data sets immediately on mount. Since PatientSafetyDialog
  // is always rendered with key={patient.id}, this effect only ever runs once
  // per patient — no stale data risk.
  useEffect(() => {
    apiFetch<PatientAllergy[]>(`/api/patients/${patient.id}/allergies`)
      .then(setAllergies).catch(() => {}).finally(() => setLoadingA(false));
    apiFetch<PatientCondition[]>(`/api/patients/${patient.id}/conditions`)
      .then(setConditions).catch(() => {}).finally(() => setLoadingC(false));
    loadHistory(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — component remounts via key when patient changes

  const addAllergy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allergen.trim()) return;
    setSavingA(true);
    try {
      const row = await apiFetch<PatientAllergy>(`/api/patients/${patient.id}/allergies`, {
        method: "POST",
        body: JSON.stringify({ allergen: allergen.trim(), severity, reaction: reaction.trim() || undefined }),
      });
      setAllergies(prev => [...prev, row]);
      setAllergen(""); setReaction("");
      toast({ title: "Allergy recorded" });
    } catch (err) {
      toast({ title: "Couldn't save allergy", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally { setSavingA(false); }
  };

  const deleteAllergy = async (id: number) => {
    try {
      await apiFetch(`/api/patients/${patient.id}/allergies/${id}`, { method: "DELETE" });
      setAllergies(prev => prev.filter(a => a.id !== id));
      toast({ title: "Allergy removed" });
    } catch (err) {
      toast({ title: "Couldn't remove allergy", description: err instanceof Error ? err.message : "", variant: "destructive" });
    }
  };

  const addCondition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conditionName.trim()) return;
    setSavingC(true);
    try {
      const row = await apiFetch<PatientCondition>(`/api/patients/${patient.id}/conditions`, {
        method: "POST",
        body: JSON.stringify({ condition: conditionName.trim(), notes: condNotes.trim() || undefined }),
      });
      setConditions(prev => [...prev, row]);
      setConditionName(""); setCondNotes("");
      toast({ title: "Condition recorded" });
    } catch (err) {
      toast({ title: "Couldn't save condition", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally { setSavingC(false); }
  };

  const deleteCondition = async (id: number) => {
    try {
      await apiFetch(`/api/patients/${patient.id}/conditions/${id}`, { method: "DELETE" });
      setConditions(prev => prev.filter(c => c.id !== id));
      toast({ title: "Condition removed" });
    } catch (err) {
      toast({ title: "Couldn't remove condition", description: err instanceof Error ? err.message : "", variant: "destructive" });
    }
  };

  const loadHistory = useCallback(async (page: number) => {
    setHistoryLoading(true);
    try {
      const data = await apiFetch<{ data: DispensingHistoryItem[]; total: number; page: number }>(
        `/api/patients/${patient.id}/dispensing-history?page=${page}&limit=${HISTORY_LIMIT}`
      );
      setHistory(data.data);
      setHistoryTotal(data.total);
      setHistoryPage(page);
      setHistoryLoaded(true);
    } catch {
      toast({ title: "Couldn't load dispensing history", variant: "destructive" });
    } finally {
      setHistoryLoading(false);
    }
  }, [patient.id, toast]);

  const handlePrintHistory = async () => {
    setPrintLoading(true);
    try {
      const data = await apiFetch<{ data: DispensingHistoryItem[] }>(
        `/api/patients/${patient.id}/dispensing-history?limit=500`
      );
      setPrintHistory(data.data);
      setTimeout(() => window.print(), 100);
    } catch {
      toast({ title: "Couldn't load history for printing", variant: "destructive" });
    } finally {
      setPrintLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto print:max-w-none print:shadow-none print:max-h-none print:overflow-visible">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users size={18} />
            {patient.name}
            <span className="text-sm font-normal text-muted-foreground">#{patient.id}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="text-sm text-muted-foreground space-y-0.5 mb-2">
          {patient.phone && <p className="flex items-center gap-1.5"><Phone size={12} /> {patient.phone}</p>}
          {patient.dateOfBirth && <p>DOB: {new Date(`${patient.dateOfBirth}T00:00:00`).toLocaleDateString()}</p>}
          {patient.gender && <p className="capitalize">Gender: {patient.gender}</p>}
        </div>

        <Tabs defaultValue="allergies">
          <TabsList className="w-full">
            <TabsTrigger value="allergies" className="flex-1 gap-1.5">
              <ShieldAlert size={14} /> Allergies
              {allergies.length > 0 && <Badge variant="destructive" className="ml-1 text-[10px] py-0">{allergies.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="conditions" className="flex-1 gap-1.5">
              <Activity size={14} /> Conditions
              {conditions.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px] py-0">{conditions.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="flex-1 gap-1.5"
            >
              <ClipboardList size={14} /> History
              {historyTotal > 0 && <Badge variant="secondary" className="ml-1 text-[10px] py-0">{historyTotal}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* ── Allergies ── */}
          <TabsContent value="allergies" className="space-y-4 mt-4">
            {loadingA ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin" /> Loading…
              </div>
            ) : allergies.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 italic">No allergies recorded.</p>
            ) : (
              <div className="space-y-2">
                {allergies.map(a => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{a.allergen}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${SEVERITY_BADGE[a.severity] ?? ""}`}>
                          {a.severity}
                        </span>
                      </div>
                      {a.reaction && <p className="text-xs text-muted-foreground mt-0.5">Reaction: {a.reaction}</p>}
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteAllergy(a.id)}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={addAllergy} className="space-y-3 border-t pt-4">
              <p className="text-sm font-medium">Add allergy</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Allergen *</Label>
                  <Input value={allergen} onChange={e => setAllergen(e.target.value)}
                    placeholder="e.g. Penicillin, Sulfa" className="h-9 text-sm" required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Severity</Label>
                  <select value={severity} onChange={e => setSeverity(e.target.value as any)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="mild">Mild</option>
                    <option value="moderate">Moderate</option>
                    <option value="severe">Severe</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Reaction description</Label>
                <Input value={reaction} onChange={e => setReaction(e.target.value)}
                  placeholder="e.g. hives, anaphylaxis" className="h-9 text-sm" />
              </div>
              <Button type="submit" size="sm" disabled={savingA || !allergen.trim()} className="w-full">
                {savingA ? <Loader2 size={14} className="animate-spin mr-2" /> : <Plus size={14} className="mr-2" />}
                Add Allergy
              </Button>
            </form>
          </TabsContent>

          {/* ── Dispensing History ── */}
          <TabsContent value="history" className="mt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-muted-foreground">
                {historyTotal > 0 ? `${historyTotal} dispensing record${historyTotal === 1 ? "" : "s"}` : ""}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 print:hidden"
                onClick={handlePrintHistory}
                disabled={printLoading}
              >
                {printLoading ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
                Print History
              </Button>
            </div>

            {historyLoading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 size={18} className="animate-spin mr-2" /> Loading history…
              </div>
            ) : !historyLoaded ? (
              <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
                <ClipboardList size={32} className="opacity-40" />
                <p className="text-sm">Click the History tab to load records.</p>
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
                <ClipboardList size={32} className="opacity-40" />
                <p className="text-sm italic">No dispensing history found for this patient.</p>
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Order #</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Medicine</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Qty</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Pharmacist</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr key={row.itemId} className="border-t hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                          {new Date(row.orderDate).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2 font-medium">
                          #{row.orderId}
                          {row.orderStatus === "cancelled" && (
                            <span className="ml-1 text-[10px] text-red-600 font-semibold">(void)</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-medium">{row.medicineName ?? "—"}</span>
                          {row.medicineStrength && (
                            <span className="ml-1 text-muted-foreground text-xs">{row.medicineStrength}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {row.quantity}{row.unitName ? ` ${row.unitName}` : ""}
                          {(row.returnedQuantity ?? 0) > 0 && (
                            <span className="ml-1 text-xs text-amber-600">({row.returnedQuantity} returned)</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{row.servedByName ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {historyTotal > HISTORY_LIMIT && (
              <div className="flex items-center justify-between mt-3 text-sm text-muted-foreground">
                <span>Page {historyPage} of {Math.ceil(historyTotal / HISTORY_LIMIT)}</span>
                <div className="flex gap-1">
                  <Button
                    size="sm" variant="outline" className="h-7 px-2"
                    disabled={historyPage <= 1 || historyLoading}
                    onClick={() => loadHistory(historyPage - 1)}
                  >
                    <ChevronLeft size={14} />
                  </Button>
                  <Button
                    size="sm" variant="outline" className="h-7 px-2"
                    disabled={historyPage >= Math.ceil(historyTotal / HISTORY_LIMIT) || historyLoading}
                    onClick={() => loadHistory(historyPage + 1)}
                  >
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            )}

            {/* Print-only view — hidden on screen, visible when window.print() fires */}
            {printHistory && (
              <PrintablePatientHistory patient={patient} items={printHistory} />
            )}
          </TabsContent>

          {/* ── Conditions ── */}
          <TabsContent value="conditions" className="space-y-4 mt-4">
            {loadingC ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin" /> Loading…
              </div>
            ) : conditions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 italic">No conditions recorded.</p>
            ) : (
              <div className="space-y-2">
                {conditions.map(c => (
                  <div key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3">
                    <div>
                      <p className="font-medium text-sm">{c.condition}</p>
                      {c.notes && <p className="text-xs text-muted-foreground mt-0.5">{c.notes}</p>}
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteCondition(c.id)}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={addCondition} className="space-y-3 border-t pt-4">
              <p className="text-sm font-medium">Add condition</p>
              <div className="space-y-1">
                <Label className="text-xs">Condition *</Label>
                <Input value={conditionName} onChange={e => setConditionName(e.target.value)}
                  placeholder="e.g. Type 2 Diabetes, Renal Impairment" className="h-9 text-sm" required />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notes</Label>
                <Input value={condNotes} onChange={e => setCondNotes(e.target.value)}
                  placeholder="Additional context…" className="h-9 text-sm" />
              </div>
              <Button type="submit" size="sm" disabled={savingC || !conditionName.trim()} className="w-full">
                {savingC ? <Loader2 size={14} className="animate-spin mr-2" /> : <Plus size={14} className="mr-2" />}
                Add Condition
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function PrintablePatientHistory({ patient, items }: { patient: Patient; items: DispensingHistoryItem[] }) {
  return (
    <div className="hidden print:block mt-6">
      <h2 className="text-lg font-bold mb-1">{patient.name} — Dispensing History</h2>
      <p className="text-xs text-muted-foreground mb-4">
        {patient.phone && <>Phone: {patient.phone} · </>}
        {patient.dateOfBirth && <>DOB: {new Date(`${patient.dateOfBirth}T00:00:00`).toLocaleDateString()} · </>}
        Printed: {new Date().toLocaleDateString()}
      </p>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-300">
            <th className="text-left py-1 pr-3 font-semibold">Date</th>
            <th className="text-left py-1 pr-3 font-semibold">Order #</th>
            <th className="text-left py-1 pr-3 font-semibold">Medicine</th>
            <th className="text-left py-1 pr-3 font-semibold">Qty</th>
            <th className="text-left py-1 font-semibold">Pharmacist</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.itemId} className="border-b border-gray-100">
              <td className="py-1 pr-3 whitespace-nowrap">{new Date(row.orderDate).toLocaleDateString()}</td>
              <td className="py-1 pr-3">#{row.orderId}{row.orderStatus === "cancelled" ? " (void)" : ""}</td>
              <td className="py-1 pr-3">
                {row.medicineName ?? "—"}{row.medicineStrength ? ` ${row.medicineStrength}` : ""}
              </td>
              <td className="py-1 pr-3 whitespace-nowrap">
                {row.quantity}{row.unitName ? ` ${row.unitName}` : ""}
                {(row.returnedQuantity ?? 0) > 0 ? ` (${row.returnedQuantity} returned)` : ""}
              </td>
              <td className="py-1">{row.servedByName ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
