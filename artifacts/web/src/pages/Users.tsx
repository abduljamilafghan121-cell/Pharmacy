import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateUser, useListUsers, getListUsersQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ShieldCheck, UserPlus, Users as UsersIcon, Loader2, MoreVertical, KeyRound, UserX, UserCheck, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { useAuth } from "@/hooks/use-auth";
import { useUpdateStaffUser, useResetStaffPassword } from "@/hooks/use-staff-management";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export default function Users() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any | null>(null);
  const [resettingStaff, setResettingStaff] = useState<any | null>(null);
  const { data: users = [], isLoading, isError, refetch } = useListUsers();
  const updateStaff = useUpdateStaffUser();
  const resetPassword = useResetStaffPassword();
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
        role: String(form.get("role") ?? "pharmacist") as "admin" | "pharmacist" | "cashier" | "viewer",
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
                  <option value="pharmacist">Pharmacist — inventory, prescriptions, sales</option>
                  <option value="cashier">Cashier — checkout and sales only</option>
                  <option value="viewer">Viewer — read-only visibility, no changes</option>
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
            <div className="divide-y divide-border">{users.map((staff: any) => {
              const isSelf = currentUser?.id === staff.id;
              return (
              <div key={staff.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold flex items-center gap-2">
                    {staff.name}
                    {isSelf && <span className="text-xs text-muted-foreground font-normal">(you)</span>}
                  </p>
                  <p className="text-sm text-muted-foreground">{staff.email}{staff.phone ? ` · ${staff.phone}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={staff.role === "admin" ? "default" : "secondary"} className="w-fit capitalize">
                    {staff.role === "admin" && <ShieldCheck className="mr-1 h-3.5 w-3.5" />}{staff.role}
                  </Badge>
                  <Badge variant="outline" className={staff.isActive === false ? "border-destructive/40 text-destructive" : "border-emerald-500/40 text-emerald-600"}>
                    {staff.isActive === false ? "Deactivated" : "Active"}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditingStaff(staff)}>
                        <Pencil className="mr-2 h-4 w-4" /> Edit details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setResettingStaff(staff)}>
                        <KeyRound className="mr-2 h-4 w-4" /> Reset password
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {staff.isActive === false ? (
                        <DropdownMenuItem
                          onClick={() => updateStaff.mutate(
                            { id: staff.id, data: { isActive: true } },
                            { onSuccess: () => toast({ title: "Account reactivated" }), onError: (e) => toast({ title: "Failed", description: getErrorMessage(e), variant: "destructive" }) }
                          )}
                        >
                          <UserCheck className="mr-2 h-4 w-4" /> Reactivate
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          disabled={isSelf}
                          className="text-destructive focus:text-destructive"
                          onClick={() => {
                            if (confirm(`Deactivate ${staff.name}? They won't be able to log in until reactivated.`)) {
                              updateStaff.mutate(
                                { id: staff.id, data: { isActive: false } },
                                { onSuccess: () => toast({ title: "Account deactivated" }), onError: (e) => toast({ title: "Failed", description: getErrorMessage(e), variant: "destructive" }) }
                              );
                            }
                          }}
                        >
                          <UserX className="mr-2 h-4 w-4" /> {isSelf ? "Can't deactivate self" : "Deactivate"}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );})}</div>}
        </CardContent>
      </Card>

      {/* Edit staff dialog */}
      <Dialog open={!!editingStaff} onOpenChange={(o) => !o && setEditingStaff(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader><DialogTitle>Edit staff account</DialogTitle></DialogHeader>
          {editingStaff && (
            <form
              className="space-y-4 py-2"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                updateStaff.mutate(
                  {
                    id: editingStaff.id,
                    data: {
                      name: String(fd.get("name") ?? "").trim(),
                      phone: String(fd.get("phone") ?? "").trim() || null,
                      role: String(fd.get("role") ?? editingStaff.role) as "admin" | "pharmacist" | "cashier" | "viewer",
                    },
                  },
                  {
                    onSuccess: () => { toast({ title: "Staff account updated" }); setEditingStaff(null); },
                    onError: (err) => toast({ title: "Update failed", description: getErrorMessage(err), variant: "destructive" }),
                  }
                );
              }}
            >
              <div className="space-y-2"><Label htmlFor="edit-name">Full name</Label><Input id="edit-name" name="name" defaultValue={editingStaff.name} required /></div>
              <div className="space-y-2"><Label htmlFor="edit-phone">Phone</Label><Input id="edit-phone" name="phone" type="tel" defaultValue={editingStaff.phone ?? ""} /></div>
              <div className="space-y-2">
                <Label htmlFor="edit-role">Access level</Label>
                <select
                  id="edit-role" name="role" defaultValue={editingStaff.role}
                  disabled={currentUser?.id === editingStaff.id}
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
                >
                  <option value="pharmacist">Pharmacist — inventory, prescriptions, sales</option>
                  <option value="cashier">Cashier — checkout and sales only</option>
                  <option value="viewer">Viewer — read-only visibility, no changes</option>
                  <option value="admin">Administrator — full system access</option>
                </select>
                {currentUser?.id === editingStaff.id && (
                  <p className="text-xs text-muted-foreground">You can't change your own access level.</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={updateStaff.isPending}>
                {updateStaff.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save changes
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={!!resettingStaff} onOpenChange={(o) => !o && setResettingStaff(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader><DialogTitle>Reset password for {resettingStaff?.name}</DialogTitle></DialogHeader>
          <form
            className="space-y-4 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const newPassword = String(fd.get("newPassword") ?? "");
              const confirmation = String(fd.get("confirmation") ?? "");
              if (newPassword !== confirmation) {
                toast({ title: "Passwords do not match", variant: "destructive" });
                return;
              }
              resetPassword.mutate(
                { id: resettingStaff.id, newPassword },
                {
                  onSuccess: () => { toast({ title: "Password reset successfully" }); setResettingStaff(null); },
                  onError: (err) => toast({ title: "Reset failed", description: getErrorMessage(err), variant: "destructive" }),
                }
              );
            }}
          >
            <p className="text-sm text-muted-foreground">
              This immediately sets a new password for this account. Share it with them securely — they won't be notified automatically.
            </p>
            <div className="space-y-2"><Label htmlFor="reset-password">New password</Label><Input id="reset-password" name="newPassword" type="password" minLength={6} required /></div>
            <div className="space-y-2"><Label htmlFor="reset-confirmation">Confirm new password</Label><Input id="reset-confirmation" name="confirmation" type="password" minLength={6} required /></div>
            <Button type="submit" className="w-full" disabled={resetPassword.isPending}>
              {resetPassword.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reset password
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}