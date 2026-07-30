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
  ShieldCheck,
  RotateCcw,
  Landmark,
  CreditCard,
  Lock,
  FileCheck,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { BRAND } from "@/lib/brand";
import { useEffect } from "react";

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
  { label: "Prescriptions", href: "/prescriptions", icon: FileText, roles: ["admin", "pharmacist", "cashier"] },
  { label: "Medicines", href: "/medicines", icon: Pill, roles: ["admin", "pharmacist", "viewer"] },
  { label: "Patients", href: "/patients", icon: Users, roles: ["admin", "pharmacist", "cashier"] },
  { label: "Suppliers", href: "/suppliers", icon: Truck, roles: ["admin", "pharmacist", "viewer"] },
  { label: "Purchase Orders", href: "/purchase-orders", icon: PackageSearch, roles: ["admin", "pharmacist", "viewer"] },
  { label: "Supplier Ledger", href: "/supplier-ledger", icon: BookOpen, roles: ["admin"] },
  { label: "Supplier Returns", href: "/supplier-returns", icon: RotateCcw, roles: ["admin", "pharmacist"] },
  { label: "Cash Register", href: "/cash-register", icon: CreditCard, roles: ["admin", "pharmacist", "cashier"] },
  { label: "Insurance Claims", href: "/insurance-claims", icon: Landmark, roles: ["admin", "pharmacist"] },
  { label: "Pre-Authorizations", href: "/pre-authorizations", icon: FileCheck, roles: ["admin", "pharmacist"] },
  { label: "Reports", href: "/reports", icon: BarChart3, roles: ["admin", "pharmacist", "viewer"] },
  { label: "Controlled Substances", href: "/controlled-substance-logs", icon: Lock, roles: ["admin", "pharmacist"] },
  { label: "Stocktake", href: "/stocktake", icon: ClipboardList, roles: ["admin", "pharmacist"] },
  { label: "Drug Interactions", href: "/drug-interactions", icon: Zap, roles: ["admin", "pharmacist"] },
  { label: "Audit Log", href: "/audit-log", icon: ShieldCheck, roles: ["admin"] },
  { label: "User Management", href: "/users", icon: Users, roles: ["admin"] },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  if (!user) return <>{children}</>;

  // Set the browser tab title to the product name on mount
  useEffect(() => { document.title = BRAND.name; }, []);

  const filteredNav = navItems.filter(item => item.roles.includes(user.role));

  const BrandLogo = () => (
    <img src={BRAND.logoUrl} alt={BRAND.name} className="h-9 w-auto object-contain" />
  );

  return (
    <div className="flex min-h-[100dvh] bg-background">
      {/* Sidebar — hidden on mobile, flex column on md+ */}
      <aside className="hidden md:flex w-64 flex-col sticky top-0 h-screen bg-card border-r border-border shadow-[2px_0_12px_0_rgba(0,0,0,0.04)]">

        {/* Brand header with gradient accent */}
        <div className="relative h-20 flex items-center px-5 overflow-hidden shrink-0">
          {/* Gradient wave accent — mirrors the reference's brand section divider */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/12 via-primary/6 to-transparent pointer-events-none" />
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-primary/8 blur-2xl pointer-events-none" />
          <div className="relative flex flex-col gap-0.5">
            <BrandLogo />
            <p className="text-[10px] font-medium text-primary/60 tracking-wide uppercase pl-0.5">
              {BRAND.tagline}
            </p>
          </div>
        </div>

        <div className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
          {filteredNav.map((item) => {
            const isActive = location === item.href || location.startsWith(item.href + '/');
            return (
              <Link key={item.href} href={item.href} className="block">
                <div className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-primary/8 hover:text-foreground"
                )}>
                  <item.icon size={16} className={cn(isActive ? "opacity-100" : "opacity-70")} />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </div>

        <div className="p-3 border-t border-border space-y-0.5">
          <Link href="/settings" className="block">
            <div className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
              location === "/settings"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-primary/8 hover:text-foreground"
            )}>
              <Settings size={16} className={cn(location === "/settings" ? "opacity-100" : "opacity-70")} />
              Settings
            </div>
          </Link>

          {/* User info + pill-style logout */}
          <div className="mt-2 pt-2 border-t border-border/60">
            <div className="flex items-center justify-between px-3 py-1.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
              </div>
              <button
                onClick={logout}
                title="Log Out"
                className="ml-2 shrink-0 flex items-center justify-center w-8 h-8 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-150"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 sm:px-6 md:hidden">
          <BrandLogo />
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
                  <SheetTitle className="flex items-center gap-2">
                    <img src={BRAND.logoUrl} alt={BRAND.name} className="h-8 w-auto object-contain" />
                  </SheetTitle>
                  <SheetDescription>Pharmacy workspace navigation</SheetDescription>
                </SheetHeader>
                <nav className="space-y-1 overflow-y-auto px-4 py-5">
                  {filteredNav.map((item) => {
                    const isActive = location === item.href || location.startsWith(item.href + '/');
                    return (
                      <SheetClose asChild key={item.href}>
                        <Link href={item.href} className="block">
                          <div className={cn(
                            "flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors",
                            isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}>
                            <item.icon size={18} />
                            {item.label}
                          </div>
                        </Link>
                      </SheetClose>
                    );
                  })}
                  <SheetClose asChild>
                    <Link href="/settings" className="block">
                      <div className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors",
                        location === "/settings" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}>
                        <Settings size={18} />
                        Settings
                      </div>
                    </Link>
                  </SheetClose>
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

        {/* Desktop topbar — page title + user + notifications */}
        <div className="hidden md:flex h-14 border-b border-border bg-card/50 items-center justify-between px-6">
          <span className="text-sm font-semibold text-foreground">
            {navItems.find(n => location === n.href || location.startsWith(n.href + '/'))?.label
              ?? (location === '/settings' ? 'Settings' : '')}
          </span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden lg:block">{user.name}</span>
            <NotificationBell />
          </div>
        </div>

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
                    <SheetClose asChild key={item.href}>
                      <Link href={item.href} className="block">
                        <div className={cn(
                          "flex min-h-16 items-center gap-3 rounded-xl border px-3 text-sm font-medium",
                          isActive ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                        )}>
                          <item.icon size={18} />
                          <span>{item.label}</span>
                        </div>
                      </Link>
                    </SheetClose>
                  );
                })}
                <SheetClose asChild>
                  <Link href="/settings" className="block">
                    <div className={cn(
                      "flex min-h-16 items-center gap-3 rounded-xl border px-3 text-sm font-medium",
                      location === "/settings" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                    )}>
                      <Settings size={18} />
                      <span>Settings</span>
                    </div>
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <button
                    onClick={logout}
                    className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-destructive/40 px-3 text-sm font-medium text-destructive"
                  >
                    <LogOut size={18} />
                    <span>Log Out</span>
                  </button>
                </SheetClose>
              </nav>
            </SheetContent>
          </Sheet>
        </div>

        <main className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
          <div className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
