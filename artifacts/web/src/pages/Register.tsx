import { useState } from "react";
import { useLocation } from "wouter";
import { useRegisterUser } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pill, ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();

  const registerMutation = useRegisterUser({
    mutation: {
      onSuccess: (data) => {
        login(data.token);
        toast({ title: "Admin account created!", description: "Welcome to PharmaCore." });
        setLocation("/dashboard");
      },
      onError: (err: any) => {
        toast({
          title: "Registration failed",
          description: err.response?.data?.error || "Something went wrong.",
          variant: "destructive",
        });
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    registerMutation.mutate({ data: { name, email, password, role: "admin" } });
  };

  return (
    <div className="min-h-[100dvh] flex bg-background">
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          {/* Logo */}
          <div>
            <div className="flex items-center gap-2 text-primary font-bold text-3xl tracking-tight mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground">
                <Pill size={24} />
              </div>
              PharmaCore
            </div>

            {/* First-run badge */}
            <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-primary/10 text-primary w-fit text-sm font-medium">
              <ShieldCheck size={16} />
              First-time setup
            </div>

            <h2 className="text-3xl font-extrabold text-foreground tracking-tight">
              Create your admin account
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              No accounts exist yet. Set up the first administrator to get started.
            </p>
          </div>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Admin name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@pharmacy.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat your password"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base"
              disabled={registerMutation.isPending}
            >
              {registerMutation.isPending ? (
                <Loader2 className="animate-spin mr-2" />
              ) : null}
              Create admin account
              {!registerMutation.isPending && <ArrowRight className="ml-2 w-4 h-4" />}
            </Button>
          </form>
        </div>
      </div>

      <div className="hidden lg:block lg:flex-1 bg-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&q=80')] bg-cover bg-center mix-blend-overlay opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/80 to-transparent" />
        <div className="absolute bottom-12 left-12 right-12 text-primary-foreground">
          <h3 className="text-3xl font-bold mb-4">Ready for day one.</h3>
          <p className="text-primary-foreground/80 text-lg max-w-lg">
            Create your administrator account to unlock the full pharmacy management platform.
          </p>
        </div>
      </div>
    </div>
  );
}
