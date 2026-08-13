"use client";

import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const LANDING_KEY = "tf_default_landing";

function SettingsContent() {
  const [landing, setLanding] = useState<"/dashboard" | "/">("/dashboard");

  useEffect(() => {
    const stored = window.localStorage.getItem(LANDING_KEY);
    if (stored === "/" || stored === "/dashboard") setLanding(stored);
  }, []);

  function updateLanding(value: string) {
    if (value === "/" || value === "/dashboard") {
      setLanding(value);
      window.localStorage.setItem(LANDING_KEY, value);
    }
  }

  return (
    <div className="max-w-md">
      <h1 className="text-xl font-medium text-foreground mb-1">Settings</h1>
      <p className="text-sm text-muted-foreground mb-6">Preferences for how TalentFlow behaves for you.</p>

      <Card>
        <CardContent className="pt-5">
          <p className="text-sm font-medium text-foreground mb-1">Default landing page</p>
          <p className="text-xs text-muted-foreground mb-3">Where you land right after signing in.</p>
          <Tabs value={landing} onValueChange={updateLanding}>
            <TabsList>
              <TabsTrigger value="/dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="/">Search</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsContent />
    </ProtectedRoute>
  );
}
