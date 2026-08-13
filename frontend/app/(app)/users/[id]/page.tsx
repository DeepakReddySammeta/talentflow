"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Mail, Building2, Calendar, BarChart2 } from "lucide-react";
import { Breadcrumb } from "@/components/Breadcrumb";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useUser } from "@/lib/hooks";
import { Interview } from "@/lib/types";

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-red-100 text-red-700",
  HR: "bg-blue-100 text-blue-700",
  MANAGER: "bg-purple-100 text-purple-700",
  INTERVIEWER: "bg-green-100 text-green-700",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  SCHEDULED: "secondary",
  CLEARED: "success",
  REJECTED: "destructive",
  NO_SHOW: "warning",
};

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: user, isLoading } = useUser(id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-40 rounded bg-muted animate-pulse" />
        <div className="h-32 rounded-lg bg-muted animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        User not found.
        <br />
        <Button variant="link" onClick={() => router.back()}>Go back</Button>
      </div>
    );
  }

  const initials = user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const roles = user.roles?.length ? user.roles : [user.role];

  const interviewColumns: ColumnDef<Interview>[] = [
    {
      key: "candidate",
      header: "Candidate",
      render: (i) => <span className="text-sm font-medium">{i.candidate?.name ?? "—"}</span>,
    },
    {
      key: "job",
      header: "Job",
      render: (i) => <span className="text-sm text-muted-foreground">{i.job?.title ?? "—"}</span>,
    },
    {
      key: "round",
      header: "Round",
      render: (i) => <span className="text-sm text-muted-foreground">Round {i.round}</span>,
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
      render: (i) => <Badge variant={STATUS_VARIANT[i.status] ?? "outline"}>{i.status}</Badge>,
    },
    {
      key: "scorecard",
      header: "Feedback",
      render: (i) => (
        <span className="text-xs text-muted-foreground">
          {i.scorecard ? i.scorecard.recommendation.replace(/_/g, " ") : "Pending"}
        </span>
      ),
    },
  ];

  const interviews = user.interviewsGiven ?? [];

  return (
    <div>
      <Breadcrumb items={[{ label: "User Management", href: "/users" }, { label: user.name }]} />

      <div className="flex items-start gap-6 mb-6">
        <Avatar className="h-16 w-16 shrink-0">
          <AvatarFallback className="text-xl bg-primary/10 text-primary font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold text-foreground">{user.name}</h1>
            {user.archivedAt && <Badge variant="secondary">Archived</Badge>}
          </div>
          <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><Mail className="h-4 w-4" />{user.email}</span>
            {user.department && <span className="flex items-center gap-1.5"><Building2 className="h-4 w-4" />{user.department}</span>}
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              Joined {new Date(user.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {roles.map((r) => (
              <span key={r} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_COLORS[r] ?? "bg-muted text-muted-foreground"}`}>
                {r}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="flex items-center gap-3 pt-5">
            <BarChart2 className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-semibold text-foreground">{user._count?.interviewsGiven ?? 0}</p>
              <p className="text-xs text-muted-foreground">Interviews given</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-5">
            <BarChart2 className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-2xl font-semibold text-foreground">
                {interviews.filter((i) => i.scorecard?.recommendation === "HIRE" || i.scorecard?.recommendation === "STRONG_HIRE").length}
              </p>
              <p className="text-xs text-muted-foreground">Hire recommendations</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-5">
            <BarChart2 className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-2xl font-semibold text-foreground">
                {interviews.filter((i) => i.scorecard).length}
              </p>
              <p className="text-xs text-muted-foreground">Scorecards submitted</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="interviews">
        <TabsList>
          <TabsTrigger value="interviews">Interviews Given ({interviews.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="interviews" className="mt-4">
          <DataTable
            columns={interviewColumns}
            data={interviews}
            total={interviews.length}
            page={1}
            pageSize={interviews.length || 10}
            onPageChange={() => {}}
            isLoading={false}
            emptyMessage="This user hasn't conducted any interviews yet."
            rowKey={(i) => i.id}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
