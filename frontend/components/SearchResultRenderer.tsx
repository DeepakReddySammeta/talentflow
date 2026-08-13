import { SearchResult } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const TOOL_LABELS: Record<string, string> = {
  search_jobs: "Jobs",
  search_candidates: "Candidates",
  search_interviews: "Interviews",
  search_offers: "Offers",
  get_candidate_profile: "Profile",
  schedule_interview: "Schedule",
};

export function SearchResultRenderer({ result }: { result: SearchResult }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-primary/10 px-4 py-3 text-sm text-foreground">
        {result.summary.replace(/\*\*/g, "").replace(/^[-*]\s+/gm, "")}
      </div>

      {result.steps.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {result.steps.map((step, i) => (
            <Badge key={i} variant="outline" className="text-xs">
              {TOOL_LABELS[step.tool] ?? step.tool.replace(/_/g, " ")} · {step.resultCount ?? 0} result{step.resultCount === 1 ? "" : "s"}
            </Badge>
          ))}
        </div>
      )}

      {result.data.length > 0 && (
        <Card className="overflow-hidden">
          <CardContent className="p-0 divide-y divide-border">
            {result.data.map((item: any, i: number) => (
              <ResultRow key={item.id || i} item={item} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ResultRow({ item }: { item: any }) {
  if (item.title && item.department) {
    return (
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">{item.title}</p>
          <p className="text-xs text-muted-foreground">{item.department}</p>
        </div>
        <Badge variant="success">{item.status}</Badge>
      </div>
    );
  }

  if (item.round !== undefined) {
    return (
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">
            {item.candidate?.name || "Candidate"} · Round {item.round}
          </p>
          <p className="text-xs text-muted-foreground">{item.job?.title}</p>
        </div>
        <Badge variant="secondary">{item.status}</Badge>
      </div>
    );
  }

  if (item.salary !== undefined) {
    return (
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">{item.candidate?.name}</p>
          <p className="text-xs text-muted-foreground">{item.job?.title}</p>
        </div>
        <Badge variant="warning">{item.status}</Badge>
      </div>
    );
  }

  if (item.name && item.skillLinks !== undefined) {
    const skillNames = (item.skillLinks ?? []).map((sl: any) => sl.skill.name).join(", ");
    return (
      <div className="px-4 py-3">
        <p className="text-sm font-medium text-foreground">{item.name}</p>
        <p className="text-xs text-muted-foreground">{item.job?.title}{skillNames ? ` · ${skillNames}` : ""}</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 text-sm text-foreground">{item.name || item.id}</div>
  );
}
