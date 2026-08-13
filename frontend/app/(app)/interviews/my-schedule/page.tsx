"use client";

import { useState } from "react";
import { CalendarDays, Trash2, Plus } from "lucide-react";
import { Breadcrumb } from "@/components/Breadcrumb";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/authContext";
import {
  useInterviews, useInterviewerSlots, useCreateSlot, useDeleteSlot, useSubmitScorecard,
} from "@/lib/hooks";
import { Interview, InterviewerSlot, Recommendation } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  SCHEDULED: "secondary",
  CLEARED: "success",
  REJECTED: "destructive",
  NO_SHOW: "warning",
};

const RECOMMENDATIONS: Recommendation[] = ["STRONG_HIRE", "HIRE", "NO_HIRE", "STRONG_NO_HIRE"];

function ScorecardInline({ interview, onDone }: { interview: Interview; onDone: () => void }) {
  const kras = interview.stage?.kras?.length ? interview.stage.kras : ["Overall"];
  const [ratings, setRatings] = useState<Record<string, string>>(
    Object.fromEntries(kras.map((k) => [k, "3"]))
  );
  const [recommendation, setRecommendation] = useState<Recommendation>("HIRE");
  const [notes, setNotes] = useState("");
  const submit = useSubmitScorecard();

  function handleSubmit() {
    const kraRatings = Object.fromEntries(
      Object.entries(ratings).map(([k, v]) => [k, parseInt(v)])
    );
    submit.mutate({ interviewId: interview.id, recommendation, kraRatings, notes }, { onSuccess: onDone });
  }

  return (
    <div className="mt-3 border-t border-border pt-3 space-y-3">
      {kras.map((kra) => (
        <div key={kra} className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{kra}</span>
          <ToggleGroup
            type="single"
            value={ratings[kra]}
            onValueChange={(val) => val && setRatings((r) => ({ ...r, [kra]: val }))}
            className="gap-1"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <ToggleGroupItem key={n} value={String(n)} className="h-6 w-6 rounded-full text-xs p-0">
                {n}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      ))}
      <Select value={recommendation} onValueChange={(v) => setRecommendation(v as Recommendation)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {RECOMMENDATIONS.map((r) => (
            <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Observations, strengths, concerns..."
        rows={2}
      />
      <Button size="sm" onClick={handleSubmit} disabled={submit.isPending || !notes.trim()}>
        {submit.isPending ? "Saving..." : "Submit scorecard"}
      </Button>
    </div>
  );
}

export default function MySchedulePage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [addSlotOpen, setAddSlotOpen] = useState(false);
  const [slotDate, setSlotDate] = useState("");
  const [slotNote, setSlotNote] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: interviewsData, isLoading } = useInterviews({
    page,
    interviewerId: user?.id,
    status: "SCHEDULED",
  });
  const { data: slots } = useInterviewerSlots(user?.id);
  const createSlot = useCreateSlot();
  const deleteSlot = useDeleteSlot();

  function handleAddSlot() {
    createSlot.mutate(
      { date: new Date(slotDate).toISOString(), note: slotNote || undefined },
      {
        onSuccess: () => {
          setAddSlotOpen(false);
          setSlotDate("");
          setSlotNote("");
        },
      }
    );
  }

  const upcomingColumns: ColumnDef<Interview>[] = [
    {
      key: "candidate",
      header: "Candidate",
      render: (i) => (
        <div>
          <p className="font-medium text-sm text-foreground">{i.candidate?.name ?? "—"}</p>
          <p className="text-xs text-muted-foreground">{i.job?.title ?? ""}</p>
        </div>
      ),
    },
    {
      key: "round",
      header: "Round / Stage",
      render: (i) => (
        <div>
          <p className="text-sm text-foreground">Round {i.round}</p>
          <p className="text-xs text-muted-foreground">{i.stage?.name ?? "—"}</p>
        </div>
      ),
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
        <Badge variant={STATUS_VARIANT[i.status] ?? "secondary"}>
          {i.status.replace("_", " ")}
        </Badge>
      ),
    },
    {
      key: "feedback",
      header: "",
      render: (i) =>
        i.status === "SCHEDULED" && !i.scorecard ? (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === i.id ? null : i.id); }}
          >
            Submit feedback
          </Button>
        ) : i.scorecard ? (
          <span className="text-xs text-muted-foreground italic">Feedback submitted</span>
        ) : null,
    },
  ];

  const slotColumns: ColumnDef<InterviewerSlot>[] = [
    {
      key: "date",
      header: "Date",
      render: (s) => (
        <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          {new Date(s.date).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
        </span>
      ),
    },
    {
      key: "note",
      header: "Note",
      render: (s) => (
        <span className="text-sm text-muted-foreground">{s.note ?? "—"}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      render: (s) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={(e) => { e.stopPropagation(); deleteSlot.mutate(s.id); }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Breadcrumb items={[{ label: "Interviews", href: "/interviews" }, { label: "My Schedule" }]} />
      <h1 className="text-2xl font-semibold text-foreground mb-6">My Schedule</h1>

      {/* Upcoming interviews */}
      <div className="mb-8">
        <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">
          Upcoming interviews
        </h2>
        <div className="space-y-3">
          {(interviewsData?.data ?? []).length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground">No upcoming interviews assigned to you.</p>
          )}
          {(interviewsData?.data ?? []).map((i) => (
            <Card key={i.id}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {i.candidate?.name ?? "—"} · Round {i.round}
                      {i.stage ? ` · ${i.stage.name}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {i.job?.title ?? ""} · {new Date(i.scheduledAt).toLocaleString("en-GB", {
                        day: "2-digit", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[i.status] ?? "secondary"}>
                      {i.status.replace("_", " ")}
                    </Badge>
                    {i.status === "SCHEDULED" && !i.scorecard && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setExpandedId(expandedId === i.id ? null : i.id)}
                      >
                        {expandedId === i.id ? "Hide" : "Submit feedback"}
                      </Button>
                    )}
                    {i.scorecard && (
                      <span className="text-xs text-muted-foreground italic">Feedback submitted</span>
                    )}
                  </div>
                </div>
                {expandedId === i.id && (
                  <ScorecardInline interview={i} onDone={() => setExpandedId(null)} />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Unavailability slots */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Unavailable dates
          </h2>
          <Button variant="outline" size="sm" onClick={() => setAddSlotOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Mark unavailable
          </Button>
        </div>

        {(slots ?? []).length > 0 ? (
          <DataTable
            columns={slotColumns}
            data={slots ?? []}
            total={slots?.length ?? 0}
            page={1}
            pageSize={(slots?.length ?? 0) || 10}
            onPageChange={() => {}}
            isLoading={false}
            emptyMessage="No unavailability marked."
            rowKey={(s) => s.id}
          />
        ) : (
          <p className="text-sm text-muted-foreground">No unavailability marked.</p>
        )}
      </div>

      {/* Add slot dialog */}
      <Dialog open={addSlotOpen} onOpenChange={setAddSlotOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark unavailable date</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Date <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={slotDate}
                onChange={(e) => setSlotDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Note <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Input
                value={slotNote}
                onChange={(e) => setSlotNote(e.target.value)}
                placeholder="e.g. Off-site, Annual leave"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSlotOpen(false)}>Cancel</Button>
            <Button onClick={handleAddSlot} disabled={createSlot.isPending || !slotDate}>
              {createSlot.isPending ? "Saving..." : "Mark"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
