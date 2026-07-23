import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, 
  Pill, 
  ShoppingCart, 
  ClipboardList, 
  FileText, 
  Truck, 
  PackageSearch, 
  BarChart3, 
  Settings,
  LogOut
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles: string[];
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["admin", "pharmacist"] },
  { label: "Medicines", href: "/medicines", icon: Pill, roles: ["admin", "pharmacist", "customer"] },
  { label: "Cart", href: "/cart", icon: ShoppingCart, roles: ["customer"] },
  { label: "Orders", href: "/orders", icon: ClipboardList, roles: ["admin", "pharmacist", "customer"] },
  { label: "Prescriptions", href: "/prescriptions", icon: FileText, roles: ["admin", "pharmacist", "customer"] },
  { label: "Suppliers", href: "/suppliers", icon: Truck, roles: ["admin", "pharmacist"] },
  { label: "Purchase Orders", href: "/purchase-orders", icon: PackageSearch, roles: ["admin", "pharmacist"] },
  { label: "Reports", href: "/reports", icon: BarChart3, roles: ["admin", "pharmacist"] },
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
          <div className="flex items-center gap-2 text-primary font-bold text-xl tracking-tight">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
              <Pill size={18} />
            </div>
            PharmaCore
          </div>
        </div>
        
        <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
          {filteredNav.map((item) => {
            const isActive = location.startsWith(item.href);
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
            )
          })}
        </div>

        <div className="p-4 border-t border-border">
          <div className="px-3 mb-4">
            <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
          </div>
          
          <Link href="/settings" className="block mb-1">
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
            onClick={() => logout()}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut size={18} />
            Log Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border bg-card flex items-center px-6 md:hidden">
          <div className="flex items-center gap-2 text-primary font-bold text-xl tracking-tight">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
              <Pill size={18} />
            </div>
            PharmaCore
          </div>
        </header>
        <div className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
