import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Plus, Search, Phone } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { formatDate } from "@/lib/utils";

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("pharma_token");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...getAuthHeaders(), ...init?.headers } });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

interface Patient { id: number; name: string; phone?: string | null; notes?: string | null; createdAt: string; }

export default function Patients() {
  const [search, setSearch] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const loadPatients = async (q?: string) => {
    setIsLoading(true);
    try {
      const url = q ? `/api/patients?search=${encodeURIComponent(q)}` : "/api/patients";
      const data = await apiFetch<Patient[]>(url);
      setPatients(data);
    } catch {
      toast({ title: "Failed to load patients", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadPatients(); }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadPatients(search);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsSaving(true);
    try {
      await apiFetch("/api/patients", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), phone: newPhone.trim() || undefined, notes: newNotes.trim() || undefined }),
      });
      toast({ title: "Patient added" });
      setNewName(""); setNewPhone(""); setNewNotes("");
      setDialogOpen(false);
      loadPatients(search);
    } catch {
      toast({ title: "Failed to add patient", variant: "destructive" });
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
            <DialogHeader>
              <DialogTitle>Register Patient</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4 mt-2">
              <div className="space-y-1">
                <Label htmlFor="pname">Full Name *</Label>
                <Input id="pname" value={newName} onChange={e => setNewName(e.target.value)} placeholder="John Doe" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pphone">Phone</Label>
                <Input id="pphone" value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+234 000 000 0000" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pnotes">Notes</Label>
                <Input id="pnotes" value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="Allergies, conditions…" />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isSaving || !newName.trim()}>Save</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <form onSubmit={handleSearch} className="flex gap-3 max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search by name…"
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Button type="submit" variant="outline">Search</Button>
      </form>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Registered</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading patients…</TableCell>
                </TableRow>
              ) : patients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    <div className="flex flex-col items-center gap-3">
                      <Users className="w-12 h-12 text-muted-foreground/50" />
                      <p>No patients found.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                patients.map((p) => (
                  <TableRow key={p.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium">#{p.id}</TableCell>
                    <TableCell className="font-medium text-foreground">{p.name}</TableCell>
                    <TableCell>
                      {p.phone ? (
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Phone size={12} />{p.phone}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50 text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-xs truncate">{p.notes ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(p.createdAt)}</TableCell>
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
