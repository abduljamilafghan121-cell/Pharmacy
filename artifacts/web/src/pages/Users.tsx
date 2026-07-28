import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateUser, useListUsers, getListUsersQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ShieldCheck, UserPlus, Users as UsersIcon, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

export default function Users() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: users = [], isLoading, isError, refetch } = useListUsers();
  const createUser = useCreateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setOpen(false);
        toast({ title: "Staff account created" });
      },
      onError: (error) => toast({ title: "Could not create account", description: getErrorMessage(error), variant: "destructive" }),
    },
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (password !== confirmation) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    createUser.mutate({
      data: {
        name: String(form.get("name") ?? "").trim(),
        email: String(form.get("email") ?? "").trim(),
        password,
        phone: String(form.get("phone") ?? "").trim() || undefined,
        role: String(form.get("role") ?? "pharmacist") as "admin" | "pharmacist",
      },
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User management</h1>
          <p className="mt-1 text-muted-foreground">Create staff accounts and assign the right access level.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><UserPlus className="mr-2 h-4 w-4" /> Add staff member</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Create staff account</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-3">
              <div className="space-y-2"><Label htmlFor="user-name">Full name</Label><Input id="user-name" name="name" required /></div>
              <div className="space-y-2"><Label htmlFor="user-email">Email</Label><Input id="user-email" name="email" type="email" required /></div>
              <div className="space-y-2"><Label htmlFor="user-phone">Phone <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="user-phone" name="phone" type="tel" /></div>
              <div className="space-y-2">
                <Label htmlFor="user-role">Access level</Label>
                <select id="user-role" name="role" defaultValue="pharmacist" className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="pharmacist">Pharmacist — daily pharmacy operations</option>
                  <option value="admin">Administrator — full system access</option>
                </select>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="user-password">Password</Label><Input id="user-password" name="password" type="password" minLength={6} required /></div>
                <div className="space-y-2"><Label htmlFor="user-confirmation">Confirm password</Label><Input id="user-confirmation" name="confirmation" type="password" minLength={6} required /></div>
              </div>
              <Button type="submit" className="w-full" disabled={createUser.isPending}>
                {createUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create account
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UsersIcon className="h-5 w-5 text-primary" /> Staff accounts</CardTitle>
          <CardDescription>Only administrators can create staff accounts or assign administrator access.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="py-10 text-center text-muted-foreground">Loading accounts…</div> :
            isError ? <div className="py-10 text-center"><p className="text-destructive">Could not load staff accounts.</p><Button variant="outline" className="mt-3" onClick={() => refetch()}>Try again</Button></div> :
            users.length === 0 ? <div className="py-10 text-center text-muted-foreground">No staff accounts yet.</div> :
            <div className="divide-y divide-border">{users.map((staff) => (
              <div key={staff.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{staff.name}</p>
                  <p className="text-sm text-muted-foreground">{staff.email}{staff.phone ? ` · ${staff.phone}` : ""}</p>
                </div>
                <Badge variant={staff.role === "admin" ? "default" : "secondary"} className="w-fit capitalize">
                  {staff.role === "admin" && <ShieldCheck className="mr-1 h-3.5 w-3.5" />}{staff.role}
                </Badge>
              </div>
            ))}</div>}
        </CardContent>
      </Card>
    </div>
  );
}