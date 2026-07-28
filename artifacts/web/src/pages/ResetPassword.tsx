import { useState } from "react";
import { Link, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pill, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { usePharmacySettings } from "@/hooks/use-pharmacy-settings";

const URL_ENDPOINT = `${import.meta.env.BASE_URL}api/auth/reset-password`.replace(/\/+/g, "/").replace(":/", "://");

export default function ResetPassword() {
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const { toast } = useToast();
  const { data: pharmacy } = usePharmacySettings();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmation) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(URL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Something went wrong");
      setDone(true);
    } catch (err: any) {
      toast({ title: "Reset failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 text-primary font-bold text-2xl tracking-tight mb-8 justify-center">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground overflow-hidden shrink-0">
            {pharmacy?.logoUrl ? <img src={pharmacy.logoUrl} alt="" className="w-full h-full object-contain" /> : <Pill size={20} />}
          </div>
          {pharmacy?.name ?? "My Pharmacy"}
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
          {!token ? (
            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">This reset link is missing its token. Please request a new one.</p>
              <Button asChild className="w-full"><Link href="/forgot-password">Request a new link</Link></Button>
            </div>
          ) : done ? (
            <div className="text-center space-y-3">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
              <h1 className="text-xl font-bold">Password reset</h1>
              <p className="text-sm text-muted-foreground">You can now log in with your new password.</p>
              <Button asChild className="w-full mt-2"><Link href="/login">Go to login</Link></Button>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold mb-1">Set a new password</h1>
              <p className="text-sm text-muted-foreground mb-6">Choose a new password for your account.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input id="new-password" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm new password</Label>
                  <Input id="confirm-password" type="password" minLength={6} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full h-11" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Reset password <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
