import { useState, useMemo } from "react";
import { useAuditLog } from "@/hooks/use-audit-log";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { getErrorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/utils";
import { History, Pill, ShoppingCart, FileText, Users, Truck, Settings as SettingsIcon } from "lucide-react";

const ENTITY_ICONS: Record<string, React.ElementType> = {
  medicine: Pill,
  order: ShoppingCart,
  prescription: FileText,
  user: Users,
  purchase_order: Truck,
  pharmacy_settings: SettingsIcon,
};

const ACTION_COLORS: Record<string, string> = {
  delete: "border-destructive/40 text-destructive",
  deactivate: "border-destructive/40 text-destructive",
  reject: "border-destructive/40 text-destructive",
  cancelled: "border-destructive/40 text-destructive",
  create: "border-emerald-500/40 text-emerald-600",
  verify: "border-emerald-500/40 text-emerald-600",
  reactivate: "border-emerald-500/40 text-emerald-600",
  receive: "border-emerald-500/40 text-emerald-600",
};

function actionBadgeClass(action: string) {
  const suffix = action.split(".").pop() ?? action;
  for (const [key, cls] of Object.entries(ACTION_COLORS)) {
    if (suffix.includes(key)) return cls;
  }
  return "border-border text-muted-foreground";
}

export default function AuditLog() {
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const { data, isLoading, isError, error, refetch } = useAuditLog(entityFilter === "all" ? undefined : entityFilter);

  const entries = data?.entries ?? [];

  const entityOptions = useMemo(() => Object.keys(ENTITY_ICONS), []);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <History className="w-7 h-7 text-primary" /> Audit Log
        </h1>
        <p className="text-muted-foreground mt-1">A record of sensitive actions — who did what, and when.</p>
      </div>

      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Filter by type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All activity</SelectItem>
              {entityOptions.map(e => (
                <SelectItem key={e} value={e} className="capitalize">{e.replace("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isLoading && <p className="text-sm text-muted-foreground">{data?.total ?? 0} entries</p>}
        </CardContent>
      </Card>

      {isError ? (
        <ErrorState title="Failed to load audit log" message={getErrorMessage(error)} onRetry={() => refetch()} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
            <CardDescription>Most recent first.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted/30 animate-pulse" />)}
              </div>
            ) : entries.length === 0 ? (
              <p className="text-muted-foreground text-sm py-10 text-center">No activity recorded yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {entries.map((entry) => {
                  const Icon = ENTITY_ICONS[entry.entityType] ?? History;
                  return (
                    <div key={entry.id} className="flex items-start gap-3 py-3">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{entry.description}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="outline" className={`text-[10px] ${actionBadgeClass(entry.action)}`}>
                            {entry.action}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {entry.userName ?? "System"} · {formatDate(entry.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
