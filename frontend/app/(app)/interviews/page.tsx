"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, MoreHorizontal, Archive, RotateCcw } from "lucide-react";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { FilterBar, FilterSelect } from "@/components/FilterBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/lib/authContext";
import {
  useInterviews, useCreateInterview, useRescheduleInterview, useSubmitScorecard,
  useCandidates, useUsers, useJobs, useArchiveInterview, useRestoreInterview,
} from "@/lib/hooks";
import { Interview, Recommendation } from "@/lib/types";

const STATUS_OPTIONS = [
  { label: "Scheduled", value: "SCHEDULED" },
  { label: "Cleared", value: "CLEARED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "No Show", value: "NO_SHOW" },
];

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  SCHEDULED: "secondary",
  CLEARED: "success",
  REJECTED: "destructive",
  NO_SHOW: "warning",
};

const RECOMMENDATION_COLOR: Record<string, string> = {
  STRONG_HIRE:    "text-green-600",
  HIRE:           "text-green-500",
  NO_HIRE:        "text-orange-500",
  STRONG_NO_HIRE: "text-destructive",
};

const RECOMMENDATIONS: Recommendation[] = ["STRONG_HIRE", "HIRE", "NO_HIRE", "STRONG_NO_HIRE"];

// ── Scorecard dialog ──────────────────────────────────────────────────────────

function ScorecardDialog({
  interview,
  open,
  onClose,
}: {
  interview: Interview | null;
  open: boolean;
  onClose: () => void;
}) {
  const kras = interview?.stage?.kras?.length ? interview.stage.kras : ["Overall"];
  const [ratings, setRatings] = useState<Record<string, string>>(
    Object.fromEntries(kras.map((k) => [k, "3"]))
  );
  const [recommendation, setRecommendation] = useState<Recommendation>("HIRE");
  const [notes, setNotes] = useState("");
  const submit = useSubmitScorecard();

  function handleSubmit() {
    if (!interview) return;
    const kraRatings = Object.fromEntries(
      Object.entries(ratings).map(([k, v]) => [k, parseInt(v)])
    );
    submit.mutate(
      { interviewId: interview.id, recommendation, kraRatings, notes },
      { onSuccess: onClose }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Submit scorecard</DialogTitle>
        </DialogHeader>
        {interview && (
          <div className="text-sm text-muted-foreground mb-2">
            {interview.candidate?.name} · Round {interview.round}
            {interview.stage ? ` · ${interview.stage.name}` : ""}
          </div>
        )}
        <div className="space-y-4 py-1">
          {kras.map((kra) => (
            <div key={kra} className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{kra}</span>
              <ToggleGroup
                type="single"
                value={ratings[kra]}
                onValueChange={(val) => val && setRatings((r) => ({ ...r, [kra]: val }))}
                className="gap-1"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <ToggleGroupItem key={n} value={String(n)} className="h-7 w-7 rounded-full text-xs p-0">
                    {n}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          ))}

          <div className="space-y-1.5">
            <Label>Recommendation</Label>
            <Select value={recommendation} onValueChange={(v) => setRecommendation(v as Recommendation)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RECOMMENDATIONS.map((r) => (
                  <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Strengths, concerns, specific observations..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submit.isPending || !notes.trim()}>
            {submit.isPending ? "Saving..." : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Reschedule dialog ─────────────────────────────────────────────────────────

function RescheduleDialog({
  interview,
  open,
  onClose,
}: {
  interview: Interview | null;
  open: boolean;
  onClose: () => void;
}) {
  const [scheduledAt, setScheduledAt] = useState(
    interview?.scheduledAt ? interview.scheduledAt.slice(0, 16) : ""
  );
  const [interviewerId, setInterviewerId] = useState(interview?.interviewerId ?? "");
  const { data: usersData } = useUsers({ role: "INTERVIEWER", limit: 100 });
  const reschedule = useRescheduleInterview();

  function handleSubmit() {
    if (!interview) return;
    reschedule.mutate(
      { id: interview.id, scheduledAt: new Date(scheduledAt).toISOString(), interviewerId: interviewerId || undefined },
      { onSuccess: onClose }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reschedule interview</DialogTitle>
        </DialogHeader>
        {interview && (
          <div className="text-sm text-muted-foreground mb-2">
            {interview.candidate?.name} · Round {interview.round}
          </div>
        )}
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>New date & time</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Interviewer <span className="text-xs text-muted-foreground">(optional change)</span></Label>
            <Select value={interviewerId} onValueChange={setInterviewerId}>
              <SelectTrigger><SelectValue placeholder="Keep current" /></SelectTrigger>
              <SelectContent>
                {(usersData?.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={reschedule.isPending || !scheduledAt}>
            {reschedule.isPending ? "Saving..." : "Reschedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Schedule dialog ───────────────────────────────────────────────────────────

function ScheduleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({
    candidateId: "",
    jobId: "",
    interviewerId: "",
    stageId: "",
    round: "1",
    scheduledAt: "",
  });

  const { data: candidatesData } = useCandidates({ limit: 200 });
  const { data: jobsData } = useJobs({ limit: 100 });
  const { data: usersData } = useUsers({ role: "INTERVIEWER", limit: 100 });
  const create = useCreateInterview();

  const selectedCandidate = (candidatesData?.data ?? []).find((c) => c.id === form.candidateId);
  const selectedJob = (jobsData?.data ?? []).find((j) => j.id === (selectedCandidate?.jobId ?? form.jobId));

  function handleSubmit() {
    create.mutate(
      {
        candidateId: form.candidateId,
        jobId: selectedCandidate?.jobId ?? form.jobId,
        interviewerId: form.interviewerId,
        stageId: form.stageId || undefined,
        round: parseInt(form.round),
        scheduledAt: new Date(form.scheduledAt).toISOString(),
      },
      { onSuccess: onClose }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule interview</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Candidate <span className="text-destructive">*</span></Label>
            <Select value={form.candidateId} onValueChange={(v) => setForm({ ...form, candidateId: v })}>
              <SelectTrigger><SelectValue placeholder="Select candidate" /></SelectTrigger>
              <SelectContent>
                {(candidatesData?.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} — {c.job?.title ?? ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedJob?.stages && selectedJob.stages.length > 0 && (
            <div className="space-y-1.5">
              <Label>Pipeline stage</Label>
              <Select value={form.stageId} onValueChange={(v) => setForm({ ...form, stageId: v })}>
                <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
                <SelectContent>
                  {selectedJob.stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Round <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                min={1}
                value={form.round}
                onChange={(e) => setForm({ ...form, round: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date & time <span className="text-destructive">*</span></Label>
              <Input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Interviewer <span className="text-destructive">*</span></Label>
            <Select value={form.interviewerId} onValueChange={(v) => setForm({ ...form, interviewerId: v })}>
              <SelectTrigger><SelectValue placeholder="Select interviewer" /></SelectTrigger>
              <SelectContent>
                {(usersData?.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={
              create.isPending ||
              !form.candidateId ||
              !form.interviewerId ||
              !form.scheduledAt ||
              !form.round
            }
          >
            {create.isPending ? "Scheduling..." : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InterviewsPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [archived, setArchived] = useState<"active" | "archived">("active");

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scorecardTarget, setScorecardTarget] = useState<Interview | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<Interview | null>(null);

  const { data, isLoading } = useInterviews({
    page, limit,
    search: search || undefined,
    status: statusFilter || undefined,
    archived,
  });
  const archiveInterview = useArchiveInterview();
  const restoreInterview = useRestoreInterview();
  const canArchive = user?.role === "ADMIN" || user?.role === "HR";

  const columns: ColumnDef<Interview>[] = [
    {
      key: "candidate",
      header: "Candidate",
      render: (i) => (
        <div
          className="cursor-pointer hover:underline"
          onClick={(e) => { e.stopPropagation(); if (i.candidateId) router.push(`/candidates/${i.candidateId}`); }}
        >
          <p className="font-medium text-sm text-foreground">{i.candidate?.name ?? "—"}</p>
          <p className="text-xs text-muted-foreground">{i.job?.title ?? ""}</p>
        </div>
      ),
    },
    {
      key: "round",
      header: "Round",
      render: (i) => (
        <div>
          <p className="text-sm text-foreground">Round {i.round}</p>
          <p className="text-xs text-muted-foreground">{i.stage?.name ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "interviewer",
      header: "Interviewer",
      render: (i) => <span className="text-sm text-muted-foreground">{i.interviewer?.name ?? "—"}</span>,
    },
    {
      key: "scheduledAt",
      header: "Date & Time",
      render: (i) => (
        <span className="text-sm text-muted-foreground">
          {new Date(i.scheduledAt).toLocaleString("en-GB", {
            day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit",
          })}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (i) => (
        <Badge variant={STATUS_VARIANT[i.status] ?? "outline"}>
          {i.status.replace("_", " ")}
        </Badge>
      ),
    },
    {
      key: "scorecard",
      header: "Recommendation",
      render: (i) => {
        const rec = i.scorecard?.recommendation;
        if (!rec) return <span className="text-xs text-muted-foreground italic">Pending</span>;
        return (
          <span className={`text-sm font-medium ${RECOMMENDATION_COLOR[rec] ?? ""}`}>
            {rec.replace(/_/g, " ")}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      render: (i) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {i.status === "SCHEDULED" && !i.scorecard && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setScorecardTarget(i); }}>
                Submit feedback
              </DropdownMenuItem>
            )}
            {i.status === "SCHEDULED" && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setRescheduleTarget(i); }}>
                Reschedule
              </DropdownMenuItem>
            )}
            {i.candidateId && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/candidates/${i.candidateId}`); }}>
                View candidate
              </DropdownMenuItem>
            )}
            {canArchive && (
              i.archivedAt ? (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); restoreInterview.mutate(i.id); }}>
                  <RotateCcw className="h-4 w-4 mr-2" /> Restore
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); archiveInterview.mutate(i.id); }}
                  className="text-destructive focus:text-destructive"
                >
                  <Archive className="h-4 w-4 mr-2" /> Archive
                </DropdownMenuItem>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Interviews"
        subtitle={user?.role === "INTERVIEWER" ? "Your assigned interviews" : "All scheduled interviews"}
        actions={
          (user?.role === "ADMIN" || user?.role === "HR") ? (
            <Button size="sm" onClick={() => setScheduleOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Schedule interview
            </Button>
          ) : undefined
        }
      />

      <FilterBar
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search by candidate or job..."
        filters={
          <>
            <FilterSelect
              label="All Statuses"
              value={statusFilter}
              options={STATUS_OPTIONS}
              onChange={(v) => { setStatusFilter(v); setPage(1); }}
            />
            {canArchive && (
              <FilterSelect
                label="Active"
                value={archived}
                options={[{ label: "Active", value: "active" }, { label: "Archived", value: "archived" }]}
                onChange={(v) => { setArchived(v as "active" | "archived"); setPage(1); }}
              />
            )}
          </>
        }
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={page}
        pageSize={limit}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
        isLoading={isLoading}
        emptyMessage="No interviews found."
        rowKey={(i) => i.id}
      />

      <ScheduleDialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} />
      <ScorecardDialog
        interview={scorecardTarget}
        open={!!scorecardTarget}
        onClose={() => setScorecardTarget(null)}
      />
      <RescheduleDialog
        interview={rescheduleTarget}
        open={!!rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
      />
    </div>
  );
}
