"use client";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useFeatureFlags, useSetFeatureFlag } from "@/lib/hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

const FLAG_LABELS: Record<string, { title: string; description: string }> = {
  voice_search_enabled: {
    title: "Voice search",
    description: "Shows the mic button in the search bar (Web Speech API).",
  },
  agent_actions_enabled: {
    title: "Agent actions (Level 3)",
    description: "Lets the search agent take write actions (e.g. scheduling) instead of read-only lookups.",
  },
  dashboard_charts_beta: {
    title: "Dashboard charts",
    description: "Shows the funnel/donut/bar visualizations on the Dashboard page.",
  },
};

function FeatureFlagsContent() {
  const { data, isLoading } = useFeatureFlags();
  const setFlag = useSetFeatureFlag();

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-medium text-foreground mb-1">Feature flags</h1>
      <p className="text-sm text-muted-foreground mb-6">Admin only — roll capabilities out without a redeploy.</p>

      {isLoading && <p className="text-sm text-muted-foreground">Loading flags...</p>}

      <Card className="overflow-hidden">
        <CardContent className="p-0 divide-y divide-border">
          {data?.map((flag) => {
            const meta = FLAG_LABELS[flag.key] || { title: flag.key, description: "" };
            return (
              <div key={flag.key} className="px-4 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{meta.title}</p>
                  {meta.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
                  )}
                </div>
                <Switch
                  checked={flag.enabled}
                  onCheckedChange={(checked) => setFlag.mutate({ key: flag.key, enabled: checked })}
                  className="shrink-0"
                />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

export default function FeatureFlagsPage() {
  return (
    <ProtectedRoute allowedRoles={["ADMIN"]}>
      <FeatureFlagsContent />
    </ProtectedRoute>
  );
}
