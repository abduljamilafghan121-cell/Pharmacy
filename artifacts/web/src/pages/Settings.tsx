import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserCircle, Plus, Trash2, Tag } from "lucide-react";
import { useListCategories, useCreateCategory, useDeleteCategory } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListCategoriesQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

      {/* Profile */}
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
          {/* Add form */}
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

          {/* List */}
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
