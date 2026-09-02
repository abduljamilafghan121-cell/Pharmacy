import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateUser, useListUsers, getListUsersQueryKey, type UserRegisterInputRole } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ShieldCheck, UserPlus, Users as UsersIcon, Loader2, Pencil, KeyRound, Power } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { useAuth } from "@/hooks/use-auth";

const ALL_ROLES = ["admin", "pharmacist", "cashier", "viewer"] as const;
type Role = typeof ALL_ROLES[number];

function roleLabel(role: string) {
  return { admin: "Administrator", pharmacist: "Pharmacist", cashier: "Cashier", viewer: "Viewer (read-only)" }[role] ?? role;
}

function authHeaders(): HeadersInit {
  let token: string | null = null;
  try { token = localStorage.getItem("pharma_token"); } catch { /* sandboxed */ }
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function apiUrl(path: string) {
  return `${import.meta.env.BASE_URL}${path}`.replace(/\/+/g, "/").replace(":/", "://");
}

export default function Users() {
  const { toast } = useToast();
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const { data: users = [], isLoading, isError, refetch } = useListUsers();

  const createUser = useCreateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setCreateOpen(false);
        toast({ title: "Staff account created" });
      },
      onError: (error) => toast({ title: "Could not create account", description: getErrorMessage(error), variant: "destructive" }),
    },
  });

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (password !== confirmation) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    const rawRole = String(form.get("role") ?? "pharmacist");
    const parsedRole =
      rawRole === "admin" || rawRole === "pharmacist" || rawRole === "cashier" || rawRole === "viewer"
        ? rawRole
        : "pharmacist";
    // UserRegisterInputRole only models admin/pharmacist; the server also
    // accepts cashier/viewer (see UserRole in the auth schema).
    const role = parsedRole as UserRegisterInputRole;
    createUser.mutate({
      data: {
        name: String(form.get("name") ?? "").trim(),
        email: String(form.get("email") ?? "").trim(),
        password,
        phone: String(form.get("phone") ?? "").trim() || undefined,
        role,
      },
    });
  }

  async function patchUser(id: number, payload: Record<string, unknown>) {
    const res = await fetch(apiUrl(`api/users/${id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Update failed");
    return body;
  }

  async function resetPassword(id: number, newPassword: string) {
    const res = await fetch(apiUrl(`api/users/${id}/reset-password`), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ newPassword }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Reset failed");
    return body;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User management</h1>
          <p className="mt-1 text-muted-foreground">Create staff accounts and assign the right access level.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><UserPlus className="mr-2 h-4 w-4" /> Add staff member</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Create staff account</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 py-3">
              <div className="space-y-2"><Label htmlFor="user-name">Full name</Label><Input id="user-name" name="name" required /></div>
              <div className="space-y-2"><Label htmlFor="user-email">Email</Label><Input id="user-email" name="email" type="email" required /></div>
              <div className="space-y-2"><Label htmlFor="user-phone">Phone <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="user-phone" name="phone" type="tel" /></div>
              <div className="space-y-2">
                <Label htmlFor="user-role">Access level</Label>
                <select id="user-role" name="role" defaultValue="pharmacist" className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {ALL_ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
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
          <CardDescription>Only administrators can create, edit, or deactivate staff accounts.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="py-10 text-center text-muted-foreground">Loading accounts…</div> :
            isError ? <div className="py-10 text-center"><p className="text-destructive">Could not load staff accounts.</p><Button variant="outline" className="mt-3" onClick={() => refetch()}>Try again</Button></div> :
            users.length === 0 ? <div className="py-10 text-center text-muted-foreground">No staff accounts yet.</div> :
            <div className="divide-y divide-border">{users.map((staff: any) => (
              <StaffRow
                key={staff.id}
                staff={staff}
                isSelf={staff.id === me?.id}
                onPatch={async (payload) => {
                  await patchUser(staff.id, payload);
                  queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
                }}
                onResetPassword={async (newPassword) => {
                  await resetPassword(staff.id, newPassword);
                }}
                toast={toast}
              />
            ))}</div>}
        </CardContent>
      </Card>
    </div>
  );
}

function StaffRow({ staff, isSelf, onPatch, onResetPassword, toast }: {
  staff: any;
  isSelf: boolean;
  onPatch: (payload: Record<string, unknown>) => Promise<void>;
  onResetPassword: (newPassword: string) => Promise<void>;
  toast: any;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setSaving(true);
    try {
      await onPatch({
        name: String(form.get("name") ?? "").trim(),
        phone: String(form.get("phone") ?? "").trim() || null,
        role: String(form.get("role") ?? ""),
        isActive: form.get("isActive") === "true",
      });
      setEditOpen(false);
      toast({ title: "Account updated" });
    } catch (err: any) {
      toast({ title: "Couldn't update account", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const pw = String(form.get("newPassword") ?? "");
    const conf = String(form.get("confirm") ?? "");
    if (pw !== conf) { toast({ title: "Passwords do not match", variant: "destructive" }); return; }
    setResetting(true);
    try {
      await onResetPassword(pw);
      setResetOpen(false);
      toast({ title: `Password reset for ${staff.name}` });
    } catch (err: any) {
      toast({ title: "Couldn't reset password", description: err.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  }

  const isActive = staff.isActive !== false;

  return (
    <div className={`flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between ${!isActive ? "opacity-50" : ""}`}>
      <div>
        <p className="font-semibold">{staff.name} {isSelf && <span className="text-xs text-muted-foreground">(you)</span>}</p>
        <p className="text-sm text-muted-foreground">{staff.email}{staff.phone ? ` · ${staff.phone}` : ""}</p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={staff.role === "admin" ? "default" : "secondary"} className="capitalize">
          {staff.role === "admin" && <ShieldCheck className="mr-1 h-3.5 w-3.5" />}{staff.role}
        </Badge>
        {!isActive && <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>}

        {/* Edit dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground">
              <Pencil size={14} className="mr-1" /> Edit
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader><DialogTitle>Edit {staff.name}</DialogTitle></DialogHeader>
            <form onSubmit={handleEdit} className="space-y-4 py-2">
              <div className="space-y-2"><Label>Full name</Label><Input name="name" defaultValue={staff.name} required /></div>
              <div className="space-y-2"><Label>Phone</Label><Input name="phone" type="tel" defaultValue={staff.phone ?? ""} /></div>
              <div className="space-y-2">
                <Label>Access level</Label>
                <select name="role" defaultValue={staff.role} disabled={isSelf} className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50">
                  {ALL_ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                </select>
                {isSelf && <p className="text-xs text-muted-foreground">You cannot change your own role.</p>}
              </div>
              <div className="space-y-2">
                <Label>Account status</Label>
                <select name="isActive" defaultValue={isActive ? "true" : "false"} disabled={isSelf} className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50">
                  <option value="true">Active</option>
                  <option value="false">Deactivated</option>
                </select>
                {isSelf && <p className="text-xs text-muted-foreground">You cannot deactivate your own account.</p>}
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button type="submit" className="flex-1" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save changes
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Reset password dialog */}
        <Dialog open={resetOpen} onOpenChange={setResetOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground">
              <KeyRound size={14} className="mr-1" /> Reset PW
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader><DialogTitle>Reset password for {staff.name}</DialogTitle></DialogHeader>
            <form onSubmit={handleReset} className="space-y-4 py-2">
              <div className="space-y-2"><Label>New password</Label><Input name="newPassword" type="password" minLength={6} required /></div>
              <div className="space-y-2"><Label>Confirm new password</Label><Input name="confirm" type="password" minLength={6} required /></div>
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setResetOpen(false)}>Cancel</Button>
                <Button type="submit" className="flex-1" disabled={resetting}>
                  {resetting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Power size={14} className="mr-1" /> Set password
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
