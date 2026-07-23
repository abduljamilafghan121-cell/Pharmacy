import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useLoginUser } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pill, ArrowRight, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [, setLocation] = useLocation();
  const { login, user } = useAuth();
  const { toast } = useToast();

  if (user) {
    setLocation("/dashboard");
    return null;
  }

  const loginMutation = useLoginUser({
    mutation: {
      onSuccess: (data) => {
        login(data.token);
        toast({ title: "Welcome back!", description: "Successfully logged in." });
        setLocation("/dashboard");
      },
      onError: (err: any) => {
        toast({ 
          title: "Login failed", 
          description: err.response?.data?.error || "Invalid credentials", 
          variant: "destructive" 
        });
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ data: { email, password } });
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
              Sign in to your account
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Staff login — contact your administrator for access.
            </p>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
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
                  placeholder="admin@pharmacore.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 text-base" 
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? <Loader2 className="animate-spin mr-2" /> : null}
              Sign in
              {!loginMutation.isPending && <ArrowRight className="ml-2 w-4 h-4" />}
            </Button>
          </form>
        </div>
      </div>
      
      <div className="hidden lg:block lg:flex-1 bg-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&q=80')] bg-cover bg-center mix-blend-overlay opacity-30"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/80 to-transparent"></div>
        <div className="absolute bottom-12 left-12 right-12 text-primary-foreground">
          <h3 className="text-3xl font-bold mb-4">Precision clinical care.</h3>
          <p className="text-primary-foreground/80 text-lg max-w-lg">
            Manage inventory, verify prescriptions, and serve your community with our authoritative pharmacy platform.
          </p>
        </div>
      </div>
    </div>
  );
}
