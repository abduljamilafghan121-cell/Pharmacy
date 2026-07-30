import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Plus, Trash2, Search, Loader2, Zap } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { ErrorState } from "@/components/ui/error-state";

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("pharma_token");
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...getAuthHeaders(), ...init?.headers } });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

interface Medicine {
  id: number;
  name: string;
  genericName?: string | null;
  strength?: string | null;
}

interface DrugInteraction {
  id: number;
  medicine1Id: number;
  medicine2Id: number;
  severity: "mild" | "moderate" | "severe" | "contraindicated";
  description?: string | null;
  createdAt: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  mild: "bg-blue-100 text-blue-700 border-blue-200",
  moderate: "bg-amber-100 text-amber-700 border-amber-200",
  severe: "bg-red-100 text-red-700 border-red-200",
  contraindicated: "bg-red-200 text-red-900 border-red-400",
};

function MedicineSearch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Medicine | null;
  onChange: (m: Medicine | null) => void;
}) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [results, setResults] = useState<Medicine[]>([]);
  const [open, setOpen] = useState(false);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    try {
      const data = await apiFetch<Medicine[]>(`/api/medicines?search=${encodeURIComponent(q)}&limit=10`);
      setResults(data);
      setOpen(true);
    } catch {
      setResults([]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 300);
    return () => clearTimeout(t);
  }, [query, search]);

  return (
    <div className="relative space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          className="pl-8 h-9 text-sm"
          placeholder="Search medicine…"
          value={value ? `${value.name}${value.strength ? ` ${value.strength}` : ""}` : query}
          onChange={e => { onChange(null); setQuery(e.target.value); }}
          onFocus={() => { if (results.length) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          {results.map(m => (
            <button
              key={m.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
              onMouseDown={() => { onChange(m); setQuery(""); setOpen(false); }}
            >
              <span className="font-medium">{m.name}</span>
              {m.strength && <span className="ml-1 text-muted-foreground text-xs">{m.strength}</span>}
              {m.genericName && <span className="block text-xs text-muted-foreground">{m.genericName}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DrugInteractions() {
  const { toast } = useToast();

  const [interactions, setInteractions] = useState<DrugInteraction[]>([]);
  const [medicines, setMedicines] = useState<Record<number, Medicine>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [med1, setMed1] = useState<Medicine | null>(null);
  const [med2, setMed2] = useState<Medicine | null>(null);
  const [severity, setSeverity] = useState<"mild" | "moderate" | "severe" | "contraindicated">("moderate");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const [filterQuery, setFilterQuery] = useState("");

  const loadInteractions = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiFetch<DrugInteraction[]>("/api/drug-interactions");
      setInteractions(data);

      // Fetch all referenced medicines in one batch
      const ids = Array.from(new Set(data.flatMap(i => [i.medicine1Id, i.medicine2Id])));
      if (ids.length > 0) {
        const medData = await apiFetch<Medicine[]>(`/api/medicines?limit=200`);
        const map: Record<number, Medicine> = {};
        for (const m of medData) map[m.id] = m;
        setMedicines(map);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load interactions.";
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadInteractions(); }, [loadInteractions]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!med1 || !med2) return;
    setSaving(true);
    try {
      const row = await apiFetch<DrugInteraction>("/api/drug-interactions", {
        method: "POST",
        body: JSON.stringify({
          medicine1Id: med1.id,
          medicine2Id: med2.id,
          severity,
          description: description.trim() || undefined,
        }),
      });
      setInteractions(prev => [...prev, row]);
      setMedicines(prev => ({ ...prev, [med1.id]: med1, [med2.id]: med2 }));
      toast({ title: "Interaction rule added" });
      setMed1(null); setMed2(null); setSeverity("moderate"); setDescription("");
      setAddOpen(false);
    } catch (err) {
      toast({
        title: "Couldn't add interaction",
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/api/drug-interactions/${id}`, { method: "DELETE" });
      setInteractions(prev => prev.filter(i => i.id !== id));
      toast({ title: "Interaction rule removed" });
    } catch (err) {
      toast({
        title: "Couldn't remove interaction",
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
    }
  };

  const medName = (id: number) => {
    const m = medicines[id];
    if (!m) return `Medicine #${id}`;
    return m.strength ? `${m.name} ${m.strength}` : m.name;
  };

  const filtered = filterQuery.trim()
    ? interactions.filter(i => {
        const q = filterQuery.toLowerCase();
        return (
          medName(i.medicine1Id).toLowerCase().includes(q) ||
          medName(i.medicine2Id).toLowerCase().includes(q) ||
          i.severity.includes(q) ||
          (i.description ?? "").toLowerCase().includes(q)
        );
      })
    : interactions;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Drug Interactions</h1>
          <p className="text-muted-foreground mt-1">
            Manage known interaction rules between medicines. These are checked at the point of sale.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={16} className="mr-2" /> Add Interaction
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(["mild", "moderate", "severe", "contraindicated"] as const).map(s => {
          const count = interactions.filter(i => i.severity === s).length;
          return (
            <Card key={s} className="py-3">
              <CardContent className="px-4 flex items-center justify-between">
                <span className="text-sm font-medium capitalize text-muted-foreground">{s}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border capitalize ${SEVERITY_COLORS[s]}`}>
                  {count}
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Filter by medicine or severity…"
          className="pl-9"
          value={filterQuery}
          onChange={e => setFilterQuery(e.target.value)}
        />
      </div>

      {/* List */}
      {loadError ? (
        <ErrorState title="Failed to load interactions" message={loadError} onRetry={loadInteractions} />
      ) : loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 size={24} className="animate-spin mr-2" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <Zap size={36} className="opacity-30" />
            <p className="text-sm">
              {interactions.length === 0
                ? "No interaction rules defined yet. Add one to get started."
                : "No interactions match your filter."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {filtered.map(interaction => (
              <div key={interaction.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                <div className="flex items-start gap-3 min-w-0">
                  <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${
                    interaction.severity === "contraindicated" || interaction.severity === "severe"
                      ? "text-red-500"
                      : interaction.severity === "moderate"
                      ? "text-amber-500"
                      : "text-blue-500"
                  }`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight">
                      {medName(interaction.medicine1Id)}
                      <span className="text-muted-foreground font-normal mx-1.5">+</span>
                      {medName(interaction.medicine2Id)}
                    </p>
                    {interaction.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-md">{interaction.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  <Badge className={`text-[10px] capitalize border ${SEVERITY_COLORS[interaction.severity] ?? ""}`} variant="outline">
                    {interaction.severity}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(interaction.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Drug Interaction Rule</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4 mt-2">
            <MedicineSearch label="Medicine 1 *" value={med1} onChange={setMed1} />
            <MedicineSearch label="Medicine 2 *" value={med2} onChange={setMed2} />
            {med1 && med2 && med1.id === med2.id && (
              <p className="text-xs text-destructive">A medicine cannot interact with itself.</p>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Severity *</Label>
              <select
                value={severity}
                onChange={e => setSeverity(e.target.value as typeof severity)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="mild">Mild</option>
                <option value="moderate">Moderate</option>
                <option value="severe">Severe</option>
                <option value="contraindicated">Contraindicated</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Clinical description</Label>
              <Input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="e.g. Increases bleeding risk"
                className="h-9 text-sm"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving || !med1 || !med2 || med1.id === med2.id}
              >
                {saving ? <Loader2 size={14} className="animate-spin mr-2" /> : <Plus size={14} className="mr-2" />}
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
