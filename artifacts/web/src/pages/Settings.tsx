import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { UserCircle } from "lucide-react";

export default function Settings() {
  const { user } = useAuth();

  return (
    <div className="space-y-6 max-w-3xl animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account profile.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile Details</CardTitle>
          <CardDescription>Your personal account information.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4 pb-4 border-b border-border">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center text-primary">
              <UserCircle className="w-12 h-12" />
            </div>
            <div>
              <p className="font-bold text-xl">{user?.name}</p>
              <p className="text-muted-foreground capitalize">{user?.role} Account</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={user?.name} readOnly disabled />
            </div>
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input value={user?.email} readOnly disabled />
            </div>
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input value={user?.phone || "Not provided"} readOnly disabled />
            </div>
            <div className="space-y-2">
              <Label>Account Created</Label>
              <Input value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : ""} readOnly disabled />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
