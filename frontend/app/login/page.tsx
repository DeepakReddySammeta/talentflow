"use client";

import { useState, FormEvent } from "react";
import { useAuth } from "@/lib/authContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const DEMO_ACCOUNTS = [
  { role: "Admin", email: "admin@talentflow.dev" },
  { role: "HR", email: "hr@talentflow.dev" },
  { role: "Manager", email: "manager@talentflow.dev" },
  { role: "Interviewer", email: "interviewer@talentflow.dev" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-medium mb-3">
            TF
          </div>
          <h1 className="text-xl font-medium text-foreground">TalentFlow</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to continue</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="hr@talentflow.dev"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground mb-2">Demo accounts (password: password123)</p>
          <div className="flex flex-wrap justify-center gap-2">
            {DEMO_ACCOUNTS.map((acc) => (
              <Button
                key={acc.email}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setEmail(acc.email)}
                className="rounded-full text-xs"
              >
                {acc.role}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
