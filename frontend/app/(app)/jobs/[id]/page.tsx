"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Calendar, User, CheckCircle2 } from "lucide-react";
import { Breadcrumb } from "@/components/Breadcrumb";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useJob, useJobCandidates, useJobInterviews } from "@/lib/hooks";
import { Candidate, Interview } from "@/lib/types";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  OPEN: "success", CLOSED: "secondary", ON_HOLD: "warning", DRAFT: "outline", ARCHIVED: "secondary",
  APPLIED: "secondary", IN_PROCESS: "default", OFFERED: "warning", HIRED: "success", REJECTED: "destructive",
  SCHEDULED: "secondary", CLEARED: "success", NO_SHOW: "warning",
};

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: job, isLoading } = useJob(id);
  const [candidatePage, setCandidatePage] = useState(1);
  const [interviewPage, setInterviewPage] = useState(1);
  const { data: candidatesData, isLoading: candidatesLoading } = useJobCandidates(id, candidatePage);
  const { data: interviewsData, isLoading: interviewsLoading } = useJobInterviews(id, interviewPage);

  if (isLoading) return <div className="h-48 rounded-lg bg-muted animate-pulse" />;
  if (!job) return <div className="text-center py-20 text-muted-foreground">Job not found.</div>;

  const candidateColumns: ColumnDef<Candidate>[] = [
    { key: "name", header: "Name", render: (c) => <span className="font-medium text-sm">{c.name}</span> },
    { key: "email", header: "Email", render: (c) => <span className="text-sm text-muted-foreground">{c.email}</span> },
    { key: "skills", header: "Skills", render: (c) => { const links = c.skillLinks ?? []; return <div className="flex flex-wrap gap-1">{links.slice(0, 3).map((sl) => <span key={sl.id} className="text-xs bg-muted px-1.5 py-0.5 rounded">{sl.skill.name}</span>)}{links.length > 3 && <span className="text-xs text-muted-foreground">+{links.length - 3}</span>}</div>; } },
    { key: "status", header: "Status", render: (c) => <Badge variant={STATUS_VARIANT[c.status] ?? "outline"}>{c.status}</Badge> },
    { key: "createdAt", header: "Applied", render: (c) => <span className="text-xs text-muted-foreground">{c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-GB") : "—"}</span> },
  ];

  const interviewColumns: ColumnDef<Interview>[] = [
    { key: "candidate", header: "Candidate", render: (i) => <span className="font-medium text-sm">{i.candidate?.name ?? "—"}</span> },
    { key: "round", header: "Round", render: (i) => <span className="text-sm text-muted-foreground">Round {i.round}</span> },
    { key: "stage", header: "Stage", render: (i) => <span className="text-sm text-muted-foreground">{i.stage?.name ?? "—"}</span> },
    { key: "interviewer", header: "Interviewer", render: (i) => <span className="text-sm text-muted-foreground">{i.interviewer?.name ?? "—"}</span> },
    { key: "scheduledAt", header: "Date", render: (i) => <span className="text-sm text-muted-foreground">{new Date(i.scheduledAt).toLocaleDateString("en-GB")}</span> },
    { key: "status", header: "Status", render: (i) => <Badge variant={STATUS_VARIANT[i.status] ?? "outline"}>{i.status}</Badge> },
  ];

  return (
    <div>
      <Breadcrumb items={[{ label: "Jobs", href: "/jobs" }, { label: job.title }]} />

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{job.title}</h1>
          <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><Building2 className="h-4 w-4" />{job.department}</span>
            {job.createdBy && <span className="flex items-center gap-1.5"><User className="h-4 w-4" />{job.createdBy.name}</span>}
            <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" />{new Date(job.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
          </div>
        </div>
        <Badge variant={STATUS_VARIANT[job.status] ?? "outline"} className="text-sm px-3 py-1">{job.status.replace("_", " ")}</Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card><CardContent className="pt-5"><p className="text-2xl font-semibold">{job._count?.candidates ?? 0}</p><p className="text-xs text-muted-foreground mt-0.5">Candidates</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-2xl font-semibold">{job._count?.interviews ?? 0}</p><p className="text-xs text-muted-foreground mt-0.5">Interviews</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-2xl font-semibold">{job.stages?.length ?? job._count?.stages ?? 0}</p><p className="text-xs text-muted-foreground mt-0.5">Pipeline stages</p></CardContent></Card>
      </div>

      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="candidates">Candidates ({job._count?.candidates ?? 0})</TabsTrigger>
          <TabsTrigger value="interviews">Interviews ({job._count?.interviews ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="mt-4">
          {job.stages && job.stages.length > 0 ? (
            <div className="space-y-3">
              {job.stages.map((stage, idx) => (
                <Card key={stage.id}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center h-7 w-7 rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                        {idx + 1}
                      </div>
                      <div>
                        <p className="font-medium text-sm text-foreground">{stage.name}</p>
                        {stage.kras.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {stage.kras.map((kra) => (
                              <span key={kra} className="flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="h-3 w-3 text-muted-foreground" />{kra}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No pipeline stages configured.</p>
          )}
        </TabsContent>

        <TabsContent value="candidates" className="mt-4">
          <DataTable
            columns={candidateColumns}
            data={candidatesData?.data ?? []}
            total={candidatesData?.total ?? 0}
            page={candidatePage}
            pageSize={20}
            onPageChange={setCandidatePage}
            isLoading={candidatesLoading}
            emptyMessage="No candidates for this job."
            onRowClick={(c) => router.push(`/candidates/${c.id}`)}
            rowKey={(c) => c.id}
          />
        </TabsContent>

        <TabsContent value="interviews" className="mt-4">
          <DataTable
            columns={interviewColumns}
            data={interviewsData?.data ?? []}
            total={interviewsData?.total ?? 0}
            page={interviewPage}
            pageSize={20}
            onPageChange={setInterviewPage}
            isLoading={interviewsLoading}
            emptyMessage="No interviews for this job."
            rowKey={(i) => i.id}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
