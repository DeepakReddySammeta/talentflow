"use client";

import { useState, FormEvent } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/lib/authContext";
import { apiRequest } from "@/lib/apiClient";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

function ProfileContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiRequest("/auth/change-password", {
        method: "PATCH",
        body: { currentPassword, newPassword },
      });
      toast({ title: "Password updated.", variant: "success" });
      setCurrentPassword("");
      setNewPassword("");
    } catch (err: any) {
      toast({ title: err.message || "Failed to update password", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md">
      <h1 className="text-xl font-medium text-foreground mb-1">Profile</h1>
      <p className="text-sm text-muted-foreground mb-6">Your account details.</p>

      <Card className="mb-6">
        <CardContent className="pt-5 space-y-3">
          <div>
            <p className="text-xs text-muted-foreground">Name</p>
            <p className="text-sm text-foreground">{user?.name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="text-sm text-foreground">{user?.email}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Role</p>
            <p className="text-sm text-foreground">
              {user?.role}
              {user?.department ? ` · ${user.department}` : ""}
            </p>
          </div>
        </CardContent>
      </Card>

      <h2 className="text-sm font-medium text-foreground mb-3">Change password</h2>
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="current-pw">Current password</Label>
              <Input
                id="current-pw"
                type="password"
                required
                placeholder="Current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pw">New password</Label>
              <Input
                id="new-pw"
                type="password"
                required
                minLength={8}
                placeholder="New password (min 8 chars)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Updating..." : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <ProtectedRoute>
      <ProfileContent />
    </ProtectedRoute>
  );
}
