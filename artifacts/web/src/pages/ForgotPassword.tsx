import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Loader2, ArrowLeft, MailCheck } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { BRAND } from "@/lib/brand";

const URL_ENDPOINT = `${import.meta.env.BASE_URL}api/auth/forgot-password`.replace(/\/+/g, "/").replace(":/", "://");

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [devResetLink, setDevResetLink] = useState<string | null>(null);
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch(URL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Something went wrong");
      setSubmitted(true);
      if (body.resetLink) setDevResetLink(body.resetLink); // only present outside production
    } catch (err: any) {
      toast({ title: "Request failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8 gap-1">
          <img src={BRAND.logoUrl} alt={BRAND.name} className="h-14 w-auto object-contain" />
          <p className="text-[10px] font-medium text-primary/60 tracking-wide uppercase">{BRAND.tagline}</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
          {submitted ? (
            <div className="text-center space-y-3">
              <MailCheck className="w-10 h-10 text-primary mx-auto" />
              <h1 className="text-xl font-bold">Check your email</h1>
              <p className="text-sm text-muted-foreground">
                A password reset link has been sent to <span className="font-medium">{email}</span>. The link expires in 1 hour.
              </p>
              {devResetLink && (
                <div className="text-left mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-400/30 text-xs">
                  <p className="font-semibold text-amber-700 mb-1">Dev mode only — no email provider is configured yet:</p>
                  <Link href={devResetLink.replace(/^https?:\/\/[^/]+/, "")} className="text-primary underline break-all">
                    {devResetLink}
                  </Link>
                </div>
              )}
              <Button variant="outline" asChild className="mt-4 w-full">
                <Link href="/login"><ArrowLeft className="w-4 h-4 mr-2" /> Back to login</Link>
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold mb-1">Forgot your password?</h1>
              <p className="text-sm text-muted-foreground mb-6">Enter your email and we'll send you a reset link.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fp-email">Email</Label>
                  <Input id="fp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@pharmacy.com" />
                </div>
                <Button type="submit" className="w-full h-11" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Send reset link <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </form>
              <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mt-4 justify-center">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to login
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
