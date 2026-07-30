import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Lock, Search, ChevronLeft, ChevronRight, Loader2, AlertTriangle } from "lucide-react";
import { formatDate } from "@/lib/utils";

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("pharma_token");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

interface LogEntry {
  id: number;
  orderId: number | null;
  medicineId: number;
  medicineName: string | null;
  patientId: number | null;
  patientName: string | null;
  prescriptionId: number | null;
  quantityDispensed: number;
  scheduleAtDispensing: "II" | "III" | "IV" | "V";
  dispensedByName: string | null;
  notes: string | null;
  createdAt: string;
}

const SCHEDULE_COLOR: Record<string, string> = {
  II: "bg-red-100 text-red-700 border-red-200",
  III: "bg-orange-100 text-orange-700 border-orange-200",
  IV: "bg-amber-100 text-amber-700 border-amber-200",
  V: "bg-blue-100 text-blue-700 border-blue-200",
};

const PAGE_SIZE = 50;

export default function ControlledSubstanceLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [offset, setOffset] = useState(0);
  const [scheduleFilter, setScheduleFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const load = useCallback(async (newOffset: number, schedule: string, q: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(newOffset) });
      const data = await apiFetch<LogEntry[]>(`/api/controlled-substance-logs?${params}`);
      setLogs(data);
      setOffset(newOffset);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load on first render
  useState(() => { load(0, "", ""); });

  const filtered = logs.filter(l => {
    if (scheduleFilter && l.scheduleAtDispensing !== scheduleFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (l.medicineName ?? "").toLowerCase().includes(q) ||
        (l.patientName ?? "").toLowerCase().includes(q) ||
        (l.dispensedByName ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Lock size={28} className="text-amber-600" />
            Controlled Substance Log
          </h1>
          <p className="text-muted-foreground mt-1">
            Immutable dispensing record for Schedule II–V controlled substances.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1">
          {["", "II", "III", "IV", "V"].map(s => (
            <Button
              key={s}
              variant={scheduleFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setScheduleFilter(s)}
              className="min-w-[52px]"
            >
              {s === "" ? "All" : `Sch ${s}`}
            </Button>
          ))}
        </div>
        <form
          className="flex gap-2 ml-auto"
          onSubmit={e => { e.preventDefault(); setSearch(searchInput); }}
        >
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Filter by medicine, patient, or staff…"
              className="pl-9 w-64"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" size="sm">Search</Button>
        </form>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle size={16} className="shrink-0" />
          {error}
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => load(offset, scheduleFilter, search)}>
            Retry
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Date &amp; Time</TableHead>
                <TableHead>Medicine</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Qty Dispensed</TableHead>
                <TableHead>Rx #</TableHead>
                <TableHead>Order #</TableHead>
                <TableHead>Dispensed By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    <Loader2 className="animate-spin mx-auto mb-2" size={20} />
                    Loading log…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Lock size={32} className="text-muted-foreground/40" />
                      <p>{loaded ? "No controlled substance dispensing events recorded yet." : "Loading…"}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(log => (
                  <TableRow key={log.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(log.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      {log.medicineName ?? `Medicine #${log.medicineId}`}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs font-bold ${SCHEDULE_COLOR[log.scheduleAtDispensing] ?? ""}`}
                      >
                        Sch {log.scheduleAtDispensing}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.patientName
                        ? <span>{log.patientName}{log.patientId && <span className="text-muted-foreground ml-1">#{log.patientId}</span>}</span>
                        : <span className="text-muted-foreground/60">—</span>}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{log.quantityDispensed}</TableCell>
                    <TableCell className="text-sm">
                      {log.prescriptionId
                        ? <span className="text-primary font-medium">#{log.prescriptionId}</span>
                        : <span className="text-muted-foreground/60">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.orderId
                        ? <span className="text-primary font-medium">#{log.orderId}</span>
                        : <span className="text-muted-foreground/60">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.dispensedByName ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {!isLoading && logs.length === PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => load(Math.max(0, offset - PAGE_SIZE), scheduleFilter, search)}
          >
            <ChevronLeft size={16} className="mr-1" /> Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Showing {offset + 1}–{offset + logs.length}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={logs.length < PAGE_SIZE}
            onClick={() => load(offset + PAGE_SIZE, scheduleFilter, search)}
          >
            Next <ChevronRight size={16} className="ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
