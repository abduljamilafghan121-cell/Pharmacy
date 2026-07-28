import { useState, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserCircle, Plus, Trash2, Tag, Save, Lock, Building2, ImagePlus, X, Loader2 } from "lucide-react";
import {
  useListCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateProfile,
  useChangePassword,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListCategoriesQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { usePharmacySettings, useUpdatePharmacySettings } from "@/hooks/use-pharmacy-settings";

export default function Settings() {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Pharmacy Settings ──────────────────────────────────────────────────
  const { data: pharmacySettings, isLoading: settingsLoading } = usePharmacySettings();
  const updatePharmacySettings = useUpdatePharmacySettings();
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [pharmName, setPharmName] = useState("");
  const [pharmAddress, setPharmAddress] = useState("");
  const [pharmPhone, setPharmPhone] = useState("");
  const [pharmEmail, setPharmEmail] = useState("");
  const [pharmLicense, setPharmLicense] = useState("");
  const [pharmTax, setPharmTax] = useState("");
  const [pharmLogo, setPharmLogo] = useState<string | null>(null);
  const [settingsInitialised, setSettingsInitialised] = useState(false);

  // Populate form once data arrives
  if (pharmacySettings && !settingsInitialised) {
    setPharmName(pharmacySettings.name ?? "");
    setPharmAddress(pharmacySettings.address ?? "");
    setPharmPhone(pharmacySettings.phone ?? "");
    setPharmEmail(pharmacySettings.email ?? "");
    setPharmLicense(pharmacySettings.licenseNumber ?? "");
    setPharmTax(pharmacySettings.taxRatePercent ?? "0");
    setPharmLogo(pharmacySettings.logoUrl ?? null);
    setSettingsInitialised(true);
  }

  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Logo must be under 2 MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPharmLogo(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleSavePharmacy(e: React.FormEvent) {
    e.preventDefault();
    const taxVal = parseFloat(pharmTax);
    if (isNaN(taxVal) || taxVal < 0 || taxVal > 100) {
      toast({ title: "Tax rate must be between 0 and 100", variant: "destructive" });
      return;
    }
    updatePharmacySettings.mutate(
      {
        name: pharmName.trim() || "My Pharmacy",
        address: pharmAddress.trim() || null,
        phone: pharmPhone.trim() || null,
        email: pharmEmail.trim() || null,
        licenseNumber: pharmLicense.trim() || null,
        taxRatePercent: taxVal.toFixed(2),
        logoUrl: pharmLogo || null,
      },
      {
        onSuccess: () => toast({ title: "Pharmacy settings saved" }),
        onError: (err) => toast({ title: err.message ?? "Save failed", variant: "destructive" }),
      }
    );
  }

  // ── Profile ────────────────────────────────────────────────────────────
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");

  const updateProfile = useUpdateProfile({
    mutation: {
      onSuccess: (updated) => {
        updateUser({ name: updated.name, phone: updated.phone ?? undefined });
        toast({ title: "Profile updated" });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? "Failed to update profile";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    updateProfile.mutate({ data: { name: name.trim(), phone: phone.trim() || null } });
  }

  // ── Password ───────────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changePassword = useChangePassword({
    mutation: {
      onSuccess: () => {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        toast({ title: "Password changed successfully" });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? "Failed to change password";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "New passwords do not match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "New password must be at least 6 characters", variant: "destructive" });
      return;
    }
    changePassword.mutate({ data: { currentPassword, newPassword } });
  }

  // ── Categories ─────────────────────────────────────────────────────────
  const { data: categories = [], isLoading: categoriesLoading } = useListCategories();
  const createCategory = useCreateCategory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        setNewCategoryName("");
        setNewCategoryDescription("");
        toast({ title: "Category created" });
      },
      onError: () => toast({ title: "Failed to create category", variant: "destructive" }),
    },
  });
  const deleteCategory = useDeleteCategory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        toast({ title: "Category deleted" });
      },
      onError: () => toast({ title: "Failed to delete category", variant: "destructive" }),
    },
  });

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");

  function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    createCategory.mutate({ data: { name: newCategoryName.trim(), description: newCategoryDescription.trim() || undefined } });
  }

  return (
    <div className="space-y-6 max-w-3xl animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account and system configuration.</p>
      </div>

      {/* Pharmacy Settings — admin only */}
      {user?.role === "admin" && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              <div>
                <CardTitle>Pharmacy Settings</CardTitle>
                <CardDescription>Name, contact info, logo, and tax rate printed on every receipt.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {settingsLoading ? (
              <div className="flex items-center gap-2 py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : (
              <form onSubmit={handleSavePharmacy} className="space-y-5">

                {/* Logo upload */}
                <div className="space-y-2">
                  <Label>Logo</Label>
                  <div className="flex items-center gap-4">
                    {pharmLogo ? (
                      <div className="relative h-16 w-16 rounded-lg border border-border overflow-hidden bg-muted/30 flex items-center justify-center">
                        <img src={pharmLogo} alt="Logo preview" className="h-full w-full object-contain p-1" />
                        <button
                          type="button"
                          onClick={() => { setPharmLogo(null); if (logoInputRef.current) logoInputRef.current.value = ""; }}
                          className="absolute top-0.5 right-0.5 rounded-full bg-background/80 p-0.5 hover:bg-destructive/10 text-destructive"
                        ><X size={12} /></button>
                      </div>
                    ) : (
                      <div className="h-16 w-16 rounded-lg border-2 border-dashed border-border bg-muted/20 flex items-center justify-center text-muted-foreground">
                        <ImagePlus size={20} />
                      </div>
                    )}
                    <div>
                      <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                        <ImagePlus size={14} className="mr-1.5" /> {pharmLogo ? "Change logo" : "Upload logo"}
                      </Button>
                      <p className="text-xs text-muted-foreground mt-1">PNG or SVG, max 2 MB</p>
                      <input ref={logoInputRef} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" className="hidden" onChange={handleLogoFile} />
                    </div>
                  </div>
                </div>

                {/* Name + License */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pharm-name">Pharmacy name <span className="text-destructive">*</span></Label>
                    <Input id="pharm-name" value={pharmName} onChange={e => setPharmName(e.target.value)} placeholder="My Pharmacy" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pharm-license">Licence / registration number</Label>
                    <Input id="pharm-license" value={pharmLicense} onChange={e => setPharmLicense(e.target.value)} placeholder="e.g. PHA-00123" />
                  </div>
                </div>

                {/* Address */}
                <div className="space-y-2">
                  <Label htmlFor="pharm-address">Address</Label>
                  <Input id="pharm-address" value={pharmAddress} onChange={e => setPharmAddress(e.target.value)} placeholder="123 Main St, City, Country" />
                </div>

                {/* Phone + Email */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pharm-phone">Phone</Label>
                    <Input id="pharm-phone" type="tel" value={pharmPhone} onChange={e => setPharmPhone(e.target.value)} placeholder="+1 555 000 0000" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pharm-email">Email</Label>
                    <Input id="pharm-email" type="email" value={pharmEmail} onChange={e => setPharmEmail(e.target.value)} placeholder="info@mypharmacy.com" />
                  </div>
                </div>

                {/* Tax rate */}
                <div className="space-y-2 max-w-[200px]">
                  <Label htmlFor="pharm-tax">Tax rate (%)</Label>
                  <div className="relative">
                    <Input
                      id="pharm-tax"
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={pharmTax}
                      onChange={e => setPharmTax(e.target.value)}
                      placeholder="0.00"
                      className="pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Applied automatically to every sale. Set to 0 to disable.</p>
                </div>

                <div className="flex justify-end pt-1">
                  <Button type="submit" disabled={updatePharmacySettings.isPending}>
                    {updatePharmacySettings.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    {updatePharmacySettings.isPending ? "Saving…" : "Save pharmacy settings"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {/* Profile */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserCircle className="w-5 h-5 text-primary" />
            <div>
              <CardTitle>Profile Details</CardTitle>
              <CardDescription>Update your name and phone number.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 pb-5 mb-5 border-b border-border">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary">
              <UserCircle className="w-10 h-10" />
            </div>
            <div>
              <p className="font-bold text-lg">{user?.name}</p>
              <p className="text-sm text-muted-foreground capitalize">{user?.role} Account</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="profile-name">Full Name</Label>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your full name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-phone">Phone Number</Label>
                <Input
                  id="profile-phone"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="e.g. +1 555 000 0000"
                />
              </div>
              <div className="space-y-2">
                <Label>Email Address</Label>
                <Input value={user?.email ?? ""} readOnly disabled className="opacity-60" />
                <p className="text-xs text-muted-foreground">Email cannot be changed here.</p>
              </div>
              <div className="space-y-2">
                <Label>Member Since</Label>
                <Input
                  value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : ""}
                  readOnly
                  disabled
                  className="opacity-60"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={updateProfile.isPending}>
                <Save className="w-4 h-4 mr-2" />
                {updateProfile.isPending ? "Saving…" : "Save Profile"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" />
            <div>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Enter your current password then choose a new one.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Your current password"
                required
                autoComplete="current-password"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  required
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={changePassword.isPending}>
                <Lock className="w-4 h-4 mr-2" />
                {changePassword.isPending ? "Changing…" : "Change Password"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Medicine Categories */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-primary" />
            <div>
              <CardTitle>Medicine Categories</CardTitle>
              <CardDescription>Categories available when adding medicines.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAddCategory} className="flex gap-2">
            <Input
              placeholder="Category name (e.g. Antibiotics)"
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              className="flex-1"
              required
            />
            <Input
              placeholder="Description (optional)"
              value={newCategoryDescription}
              onChange={e => setNewCategoryDescription(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" disabled={createCategory.isPending || !newCategoryName.trim()}>
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </form>

          {categoriesLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : categories.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No categories yet. Add one above to get started.</p>
          ) : (
            <div className="divide-y divide-border rounded-md border">
              {categories.map(cat => (
                <div key={cat.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="font-medium">{cat.name}</p>
                    {cat.description && <p className="text-xs text-muted-foreground">{cat.description}</p>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    disabled={deleteCategory.isPending}
                    onClick={() => deleteCategory.mutate({ id: cat.id })}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
