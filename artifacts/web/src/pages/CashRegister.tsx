import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Lock, Unlock, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import {
  useCurrentCashShift, useCashShiftHistory, useOpenCashShift, useCloseCashShift,
} from "@/hooks/use-tier5";

export default function CashRegister() {
  const { toast } = useToast();
  const { data: currentShift, isLoading } = useCurrentCashShift();
  const { data: history } = useCashShiftHistory();
  const openShift = useOpenCashShift();
  const closeShift = useCloseCashShift();

  const [openingFloat, setOpeningFloat] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [manualCashOut, setManualCashOut] = useState("");
  const [notes, setNotes] = useState("");
  const [closeResult, setCloseResult] = useState<any>(null);

  function handleOpen(e: React.FormEvent) {
    e.preventDefault();
    openShift.mutate(
      { openingFloat: parseFloat(openingFloat) || 0 },
      {
        onSuccess: () => { toast({ title: "Register opened" }); setOpeningFloat(""); },
        onError: (err) => toast({ title: "Couldn't open register", description: err.message, variant: "destructive" }),
      }
    );
  }

  function handleClose(e: React.FormEvent) {
    e.preventDefault();
    if (!currentShift) return;
    closeShift.mutate(
      {
        id: currentShift.id,
        closingCountedCash: parseFloat(closingCash) || 0,
        manualCashOut: parseFloat(manualCashOut) || 0,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: (data) => {
          setCloseResult(data);
          setClosingCash(""); setManualCashOut(""); setNotes("");
        },
        onError: (err) => toast({ title: "Couldn't close register", description: err.message, variant: "destructive" }),
      }
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <DollarSign className="w-7 h-7 text-primary" /> Cash Register
        </h1>
        <p className="text-muted-foreground mt-1">Open at the start of your shift, close and reconcile at the end.</p>
      </div>

      {isLoading ? (
        <div className="h-40 rounded-lg bg-muted/30 animate-pulse" />
      ) : closeResult ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {Math.abs(parseFloat(closeResult.variance)) < 0.01 ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              )}
              Shift Closed
            </CardTitle>
            <CardDescription>Reconciliation summary</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Expected cash</span><span>{formatCurrency(closeResult.expectedCash)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Counted cash</span><span>{formatCurrency(closeResult.closingCountedCash)}</span></div>
            <div className={`flex justify-between font-bold text-lg pt-2 border-t ${Math.abs(parseFloat(closeResult.variance)) < 0.01 ? "text-emerald-600" : "text-amber-600"}`}>
              <span>Variance</span>
              <span>{parseFloat(closeResult.variance) > 0 ? "+" : ""}{formatCurrency(closeResult.variance)}</span>
            </div>
            <Button variant="outline" className="w-full mt-4" onClick={() => setCloseResult(null)}>Done</Button>
          </CardContent>
        </Card>
      ) : currentShift ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Unlock className="w-5 h-5 text-emerald-600" /> Register Open</CardTitle>
            <CardDescription>
              Opened by {currentShift.openedByName ?? "—"} at {formatDate(currentShift.openedAt)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="bg-muted/30 rounded-lg p-3 flex justify-between text-sm">
              <span className="text-muted-foreground">Opening float</span>
              <span className="font-semibold">{formatCurrency(currentShift.openingFloat)}</span>
            </div>
            <form onSubmit={handleClose} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="closing-cash">Counted cash in drawer *</Label>
                <Input id="closing-cash" type="number" min={0} step="0.01" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-cashout">Cash given out during shift <span className="text-muted-foreground font-normal">(refunds, etc. — optional)</span></Label>
                <Input id="manual-cashout" type="number" min={0} step="0.01" placeholder="0.00" value={manualCashOut} onChange={(e) => setManualCashOut(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="close-notes">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Textarea id="close-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any discrepancy explanation…" />
              </div>
              <Button type="submit" variant="destructive" className="w-full" disabled={closeShift.isPending}>
                <Lock className="w-4 h-4 mr-2" /> {closeShift.isPending ? "Closing…" : "Close Register"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Lock className="w-5 h-5 text-muted-foreground" /> Register Closed</CardTitle>
            <CardDescription>Open the register with your starting cash float to begin.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleOpen} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="opening-float">Opening cash float *</Label>
                <Input id="opening-float" type="number" min={0} step="0.01" placeholder="e.g. 100.00" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={openShift.isPending}>
                <Unlock className="w-4 h-4 mr-2" /> {openShift.isPending ? "Opening…" : "Open Register"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {history && history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Clock className="w-4 h-4" /> Recent Shifts</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {history.slice(0, 10).map((shift) => (
              <div key={shift.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="font-medium">{shift.openedByName ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(shift.openedAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {shift.status === "closed" && shift.variance != null && (
                    <span className={Math.abs(parseFloat(shift.variance)) < 0.01 ? "text-emerald-600" : "text-amber-600"}>
                      {parseFloat(shift.variance) > 0 ? "+" : ""}{formatCurrency(shift.variance)}
                    </span>
                  )}
                  <Badge variant="outline" className={shift.status === "open" ? "border-emerald-500/40 text-emerald-600" : "border-border text-muted-foreground"}>
                    {shift.status}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
