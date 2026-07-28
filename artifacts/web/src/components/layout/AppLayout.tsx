import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Pill,
  Receipt,
  ClipboardList,
  FileText,
  Truck,
  PackageSearch,
  BarChart3,
  Settings,
  LogOut,
  Users,
  Menu,
  BookOpen,
  History,
  Wallet,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PharmacyBrand } from "./PharmacyBrand";
import { NotificationBell } from "./NotificationBell";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles: string[];
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["admin", "pharmacist", "cashier", "viewer"] },
  { label: "New Sale", href: "/new-sale", icon: Receipt, roles: ["admin", "pharmacist", "cashier"] },
  { label: "Sales", href: "/sales", icon: ClipboardList, roles: ["admin", "pharmacist", "cashier", "viewer"] },
  { label: "Prescriptions", href: "/prescriptions", icon: FileText, roles: ["admin", "pharmacist", "cashier", "viewer"] },
  { label: "Medicines", href: "/medicines", icon: Pill, roles: ["admin", "pharmacist", "viewer"] },
  { label: "Patients", href: "/patients", icon: Users, roles: ["admin", "pharmacist", "cashier", "viewer"] },
  { label: "Suppliers", href: "/suppliers", icon: Truck, roles: ["admin", "pharmacist", "viewer"] },
  { label: "Purchase Orders", href: "/purchase-orders", icon: PackageSearch, roles: ["admin", "pharmacist", "viewer"] },
  { label: "Supplier Ledger", href: "/supplier-ledger", icon: BookOpen, roles: ["admin", "viewer"] },
  { label: "Audit Log", href: "/audit-log", icon: History, roles: ["admin"] },
  { label: "Cash Register", href: "/cash-register", icon: Wallet, roles: ["admin", "pharmacist", "cashier"] },
  { label: "Insurance Claims", href: "/insurance-claims", icon: ShieldCheck, roles: ["admin", "pharmacist", "viewer"] },
  { label: "Supplier Returns", href: "/supplier-returns", icon: Undo2, roles: ["admin", "pharmacist", "viewer"] },
  { label: "Reports", href: "/reports", icon: BarChart3, roles: ["admin", "pharmacist", "viewer"] },
  { label: "User Management", href: "/users", icon: Users, roles: ["admin"] },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  if (!user) return <>{children}</>;

  const filteredNav = navItems.filter(item => item.roles.includes(user.role));

  return (
    <div className="flex min-h-[100dvh] bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col hidden md:flex sticky top-0 h-screen">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <div className="flex items-center gap-2 text-primary font-bold text-xl tracking-tight min-w-0">
            <PharmacyBrand />
          </div>
        </div>

        <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
          {filteredNav.map((item) => {
            const isActive = location === item.href || location.startsWith(item.href + '/');
            return (
              <Link key={item.href} href={item.href} className="block">
                <div className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}>
                  <item.icon size={18} />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-border space-y-1">
          <Link href="/settings" className="block">
            <div className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
              location === "/settings"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}>
              <Settings size={18} />
              Settings
            </div>
          </Link>

          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut size={18} />
            Log Out
          </button>

          <div className="px-3 pt-2 mt-1 border-t border-border">
            <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 sm:px-6 md:hidden">
          <div className="flex items-center gap-2 text-primary font-bold text-xl tracking-tight min-w-0">
            <PharmacyBrand />
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open navigation menu">
                <Menu size={20} />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[min(88vw,320px)] p-0">
              <SheetHeader className="border-b border-border px-6 py-5 text-left">
                <SheetTitle className="flex items-center gap-2 text-primary min-w-0">
                  <PharmacyBrand iconSize={18} boxClassName="w-8 h-8" />
                </SheetTitle>
                <SheetDescription>Pharmacy workspace navigation</SheetDescription>
              </SheetHeader>
              <nav className="space-y-1 overflow-y-auto px-4 py-5">
                {filteredNav.map((item) => {
                  const isActive = location === item.href || location.startsWith(item.href + '/');
                  return (
                    <Link key={item.href} href={item.href} className="block">
                      <div className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors",
                        isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}>
                        <item.icon size={18} />
                        {item.label}
                      </div>
                    </Link>
                  );
                })}
                <Link href="/settings" className="block">
                  <div className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors",
                    location === "/settings" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}>
                    <Settings size={18} />
                    Settings
                  </div>
                </Link>
              </nav>
              <div className="absolute inset-x-0 bottom-0 border-t border-border p-4">
                <div className="mb-3 px-3">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="text-xs capitalize text-muted-foreground">{user.role}</p>
                </div>
                <Button variant="outline" className="w-full justify-start" onClick={() => logout()}>
                  <LogOut size={16} className="mr-2" /> Log Out
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          </div>
        </header>

        {/* Mobile bottom nav */}
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border flex md:hidden">
          {filteredNav.slice(0, 4).map((item) => {
            const isActive = location === item.href || location.startsWith(item.href + '/');
            return (
              <Link key={item.href} href={item.href} className="flex-1 min-w-[64px]">
                <div className={cn(
                  "flex flex-col items-center gap-1 py-2 px-1 text-xs font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>
                  <item.icon size={20} />
                  <span className="truncate">{item.label}</span>
                </div>
              </Link>
            );
          })}
          <Sheet>
            <SheetTrigger asChild>
              <button className="flex-1 min-w-[64px] text-muted-foreground" aria-label="Open all navigation">
                <div className="flex flex-col items-center gap-1 px-1 py-2 text-xs font-medium">
                  <Menu size={20} />
                  <span>More</span>
                </div>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[82dvh] rounded-t-2xl px-4 pb-8">
              <SheetHeader className="text-left">
                <SheetTitle>All navigation</SheetTitle>
                <SheetDescription>Open any pharmacy workspace area.</SheetDescription>
              </SheetHeader>
              <nav className="mt-4 grid grid-cols-2 gap-2 overflow-y-auto">
                {filteredNav.slice(4).map((item) => {
                  const isActive = location === item.href || location.startsWith(item.href + '/');
                  return (
                    <Link key={item.href} href={item.href} className="block">
                      <div className={cn(
                        "flex min-h-16 items-center gap-3 rounded-xl border px-3 text-sm font-medium",
                        isActive ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                      )}>
                        <item.icon size={18} />
                        <span>{item.label}</span>
                      </div>
                    </Link>
                  );
                })}
                <Link href="/settings" className="block">
                  <div className={cn(
                    "flex min-h-16 items-center gap-3 rounded-xl border px-3 text-sm font-medium",
                    location === "/settings" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                  )}>
                    <Settings size={18} />
                    <span>Settings</span>
                  </div>
                </Link>
                <button
                  onClick={logout}
                  className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-destructive/40 px-3 text-sm font-medium text-destructive"
                >
                  <LogOut size={18} />
                  <span>Log Out</span>
                </button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>

        <main className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
          <div className="hidden md:flex h-16 border-b border-border items-center justify-end px-8 shrink-0">
            <NotificationBell />
          </div>
          <div className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
