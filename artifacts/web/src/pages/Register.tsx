import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useRegisterUser } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pill, ArrowRight, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [, setLocation] = useLocation();
  const { login, user } = useAuth();
  const { toast } = useToast();

  if (user) {
    setLocation("/dashboard");
    return null;
  }

  const registerMutation = useRegisterUser({
    mutation: {
      onSuccess: (data) => {
        login(data.token);
        toast({ title: "Account created!", description: "Welcome to PharmaCore." });
        setLocation("/dashboard");
      },
      onError: (err: any) => {
        toast({ 
          title: "Registration failed", 
          description: err.response?.data?.error || "Could not create account", 
          variant: "destructive" 
        });
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate({ data: { name, email, password, phone } });
  };

  return (
    <div className="min-h-[100dvh] flex bg-background">
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          <div>
            <div className="flex items-center gap-2 text-primary font-bold text-3xl tracking-tight mb-8">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground">
                <Pill size={24} />
              </div>
              PharmaCore
            </div>
            <h2 className="mt-6 text-3xl font-extrabold text-foreground tracking-tight">
              Create a customer account
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-primary hover:text-primary/80 transition-colors">
                Sign in
              </Link>
            </p>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone number (optional)</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                />
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 text-base" 
              disabled={registerMutation.isPending}
            >
              {registerMutation.isPending ? <Loader2 className="animate-spin mr-2" /> : null}
              Create account
              {!registerMutation.isPending && <ArrowRight className="ml-2 w-4 h-4" />}
            </Button>
          </form>
        </div>
      </div>
      
      <div className="hidden lg:block lg:flex-1 bg-secondary relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1631549916768-4119b2e5f926?auto=format&fit=crop&q=80')] bg-cover bg-center mix-blend-overlay opacity-20"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-secondary via-secondary/80 to-transparent"></div>
        <div className="absolute bottom-12 left-12 right-12 text-secondary-foreground">
          <h3 className="text-3xl font-bold mb-4">Your health, simplified.</h3>
          <p className="text-secondary-foreground/80 text-lg max-w-lg">
            Browse our catalog, securely upload prescriptions, and get medicines delivered right to your door.
          </p>
        </div>
      </div>
    </div>
  );
}
