"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import {
  Mail, Phone, MapPin, Briefcase, Linkedin, Globe, FileText, GraduationCap,
  Star, Calendar,
} from "lucide-react";
import { Breadcrumb } from "@/components/Breadcrumb";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCandidate, useCandidateDebrief } from "@/lib/hooks";
import { SKILL_CATEGORY_COLORS, SKILL_CATEGORY_LABELS } from "@/components/SkillPicker";
import { Interview } from "@/lib/types";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  APPLIED: "secondary",
  IN_PROCESS: "default",
  OFFERED: "warning",
  HIRED: "success",
  REJECTED: "destructive",
  SCHEDULED: "secondary",
  CLEARED: "success",
  NO_SHOW: "warning",
};

const RECOMMENDATION_LABEL: Record<string, { label: string; color: string }> = {
  STRONG_HIRE:    { label: "Strong Hire",    color: "text-green-600" },
  HIRE:           { label: "Hire",           color: "text-green-500" },
  NO_HIRE:        { label: "No Hire",        color: "text-orange-500" },
  STRONG_NO_HIRE: { label: "Strong No Hire", color: "text-destructive" },
};

export default function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const { data: candidate, isLoading } = useCandidate(id);
  const { data: debrief } = useCandidateDebrief(id);

  if (isLoading) return <div className="h-48 rounded-lg bg-muted animate-pulse" />;
  if (!candidate) return <div className="text-center py-20 text-muted-foreground">Candidate not found.</div>;

  const interviews: Interview[] = debrief?.interviews ?? candidate.interviews ?? [];
  const skillLinks = candidate.skillLinks ?? [];

  const interviewColumns: ColumnDef<Interview>[] = [
    {
      key: "round",
      header: "Round",
      render: (i) => <span className="font-medium text-sm">Round {i.round}</span>,
    },
    {
      key: "stage",
      header: "Stage",
      render: (i) => <span className="text-sm text-muted-foreground">{i.stage?.name ?? "—"}</span>,
    },
    {
      key: "interviewer",
      header: "Interviewer",
      render: (i) => <span className="text-sm text-muted-foreground">{i.interviewer?.name ?? "—"}</span>,
    },
    {
      key: "scheduledAt",
      header: "Date",
      render: (i) => (
        <span className="text-sm text-muted-foreground">
          {new Date(i.scheduledAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (i) => <Badge variant={STATUS_VARIANT[i.status] ?? "outline"}>{i.status.replace("_", " ")}</Badge>,
    },
    {
      key: "recommendation",
      header: "Recommendation",
      render: (i) => {
        const rec = i.scorecard?.recommendation;
        if (!rec) return <span className="text-xs text-muted-foreground italic">Pending</span>;
        const { label, color } = RECOMMENDATION_LABEL[rec] ?? { label: rec, color: "" };
        return <span className={`text-sm font-medium ${color}`}>{label}</span>;
      },
    },
  ];

  return (
    <div>
      <Breadcrumb items={[{ label: "Candidates", href: "/candidates" }, { label: candidate.name }]} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl font-semibold shrink-0">
            {candidate.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{candidate.name}</h1>
            <div className="flex flex-wrap gap-3 mt-1.5 text-sm text-muted-foreground">
              {candidate.email && (
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />{candidate.email}
                </span>
              )}
              {candidate.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />{candidate.phone}
                </span>
              )}
              {candidate.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />{candidate.location}
                </span>
              )}
              {candidate.experience != null && (
                <span className="flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5" />
                  {candidate.experience} yr{candidate.experience !== 1 ? "s" : ""} exp
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {candidate.linkedinUrl && (
                <a
                  href={candidate.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Linkedin className="h-3.5 w-3.5" /> LinkedIn
                </a>
              )}
              {candidate.portfolioUrl && (
                <a
                  href={candidate.portfolioUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Globe className="h-3.5 w-3.5" /> Portfolio
                </a>
              )}
              {candidate.resumeUrl && (
                <a
                  href={candidate.resumeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <FileText className="h-3.5 w-3.5" /> Resume
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {candidate.job && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/jobs/${candidate.jobId}`)}
            >
              {candidate.job.title}
            </Button>
          )}
          <Badge variant={STATUS_VARIANT[candidate.status] ?? "outline"} className="text-sm px-3 py-1">
            {candidate.status.replace("_", " ")}
          </Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-5">
            <p className="text-2xl font-semibold">{interviews.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Interviews</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-2xl font-semibold">{skillLinks.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Skills</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-2xl font-semibold">{(candidate.education ?? []).length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Education entries</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="skills">Skills ({skillLinks.length})</TabsTrigger>
          <TabsTrigger value="education">Education</TabsTrigger>
          <TabsTrigger value="projects">Projects ({(candidate.projects ?? []).length})</TabsTrigger>
          <TabsTrigger value="interviews">Interviews ({interviews.length})</TabsTrigger>
        </TabsList>

        {/* Profile tab */}
        <TabsContent value="profile" className="mt-4 space-y-4">
          <Card>
            <CardContent className="pt-5 space-y-3">
              <p className="text-sm font-medium text-foreground">Contact details</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Email</p>
                  <p className="text-foreground">{candidate.email}</p>
                </div>
                {candidate.phone && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Phone</p>
                    <p className="text-foreground">{candidate.phone}</p>
                  </div>
                )}
                {candidate.location && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Location</p>
                    <p className="text-foreground">{candidate.location}</p>
                  </div>
                )}
                {candidate.experience != null && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Experience</p>
                    <p className="text-foreground">{candidate.experience} year{candidate.experience !== 1 ? "s" : ""}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {candidate.job && (
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm font-medium text-foreground mb-2">Applied position</p>
                <div
                  className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => router.push(`/jobs/${candidate.jobId}`)}
                >
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Briefcase className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{candidate.job.title}</p>
                    <p className="text-xs text-muted-foreground">{candidate.job.department}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Skills tab */}
        <TabsContent value="skills" className="mt-4">
          <Card>
            <CardContent className="pt-5">
              {skillLinks.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {skillLinks.map((sl) => (
                    <span
                      key={sl.id}
                      className={`inline-flex items-center gap-1.5 text-sm px-3 py-1 rounded-full ${SKILL_CATEGORY_COLORS[sl.skill.category]}`}
                      title={SKILL_CATEGORY_LABELS[sl.skill.category]}
                    >
                      {sl.skill.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No skills listed.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Education tab */}
        <TabsContent value="education" className="mt-4">
          {(candidate.education ?? []).length > 0 ? (
            <div className="space-y-3">
              {(candidate.education ?? []).map((edu, idx) => (
                <Card key={idx}>
                  <CardContent className="pt-4 pb-4 flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <GraduationCap className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{edu.degree}</p>
                      <p className="text-sm text-muted-foreground">{edu.institution}</p>
                      {edu.year && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Calendar className="h-3 w-3" /> {edu.year}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-muted-foreground">No education details added.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Projects tab */}
        <TabsContent value="projects" className="mt-4">
          {(candidate.projects ?? []).length > 0 ? (
            <div className="space-y-3">
              {(candidate.projects ?? []).map((proj, idx) => (
                <Card key={idx}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">{proj.title}</p>
                      {proj.url && (
                        <a
                          href={proj.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline shrink-0 flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Globe className="h-3 w-3" /> View
                        </a>
                      )}
                    </div>
                    {proj.description && (
                      <p className="text-sm text-muted-foreground mt-1">{proj.description}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-muted-foreground">No projects listed.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Interviews tab */}
        <TabsContent value="interviews" className="mt-4">
          {interviews.length > 0 ? (
            <>
              {/* Pipeline progress */}
              {debrief?.job?.stages && debrief.job.stages.length > 0 && (
                <Card className="mb-4">
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">Pipeline progress</p>
                    <div className="flex flex-wrap gap-2">
                      {debrief.job.stages.map((stage: any) => {
                        const iv = interviews.find((i) => i.stage?.id === stage.id || i.stageId === stage.id);
                        const variant = iv
                          ? (STATUS_VARIANT[iv.status] ?? "outline")
                          : "outline";
                        return (
                          <Badge key={stage.id} variant={variant}>
                            {stage.name}
                          </Badge>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
              <DataTable
                columns={interviewColumns}
                data={interviews}
                total={interviews.length}
                page={1}
                pageSize={interviews.length || 10}
                onPageChange={() => {}}
                isLoading={false}
                emptyMessage="No interviews yet."
                rowKey={(i) => i.id}
              />
            </>
          ) : (
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-muted-foreground">No interviews scheduled yet.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
