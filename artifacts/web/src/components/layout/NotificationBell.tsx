import { useGetInventoryReport, useListPrescriptions } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Bell, AlertTriangle, Clock, FileText } from "lucide-react";
import { Link } from "wouter";

export function NotificationBell() {
  const { user } = useAuth();
  const canSeeInventoryAlerts = user && ["admin", "pharmacist", "viewer"].includes(user.role);
  const canSeePrescriptionAlerts = user && ["admin", "pharmacist", "cashier", "viewer"].includes(user.role);

  const { data: inventory } = useGetInventoryReport({ query: { enabled: !!canSeeInventoryAlerts } } as any);
  const { data: prescriptions } = useListPrescriptions({ query: { enabled: !!canSeePrescriptionAlerts } } as any);

  const lowStockCount = canSeeInventoryAlerts ? (inventory?.lowStockCount ?? 0) : 0;
  const expiringCount = canSeeInventoryAlerts ? (inventory?.expiringCount ?? 0) : 0;
  const pendingRxCount = canSeePrescriptionAlerts
    ? (prescriptions ?? []).filter((p: any) => p.status === "pending").length
    : 0;

  const total = lowStockCount + expiringCount + pendingRxCount;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="w-5 h-5" />
          {total > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Alerts</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {total === 0 ? (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">Nothing needs attention right now.</div>
        ) : (
          <>
            {lowStockCount > 0 && (
              <DropdownMenuItem asChild>
                <Link href="/medicines?filter=low-stock" className="flex items-center gap-2 cursor-pointer">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>{lowStockCount} medicine{lowStockCount !== 1 ? "s" : ""} low on stock</span>
                </Link>
              </DropdownMenuItem>
            )}
            {expiringCount > 0 && (
              <DropdownMenuItem asChild>
                <Link href="/medicines?filter=expiring" className="flex items-center gap-2 cursor-pointer">
                  <Clock className="w-4 h-4 text-destructive shrink-0" />
                  <span>{expiringCount} medicine{expiringCount !== 1 ? "s" : ""} expiring within 30 days</span>
                </Link>
              </DropdownMenuItem>
            )}
            {pendingRxCount > 0 && (
              <DropdownMenuItem asChild>
                <Link href="/prescriptions" className="flex items-center gap-2 cursor-pointer">
                  <FileText className="w-4 h-4 text-primary shrink-0" />
                  <span>{pendingRxCount} prescription{pendingRxCount !== 1 ? "s" : ""} awaiting verification</span>
                </Link>
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
