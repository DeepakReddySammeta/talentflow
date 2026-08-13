"use client";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/lib/authContext";
import { useDashboardStats } from "@/lib/hooks";
import { DashboardStatsCompany, DashboardStatsPersonal } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import {
  FunnelChart,
  Funnel,
  LabelList,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const CHART_COLORS = {
  primary:     "#f25011",
  success:     "#16a34a",
  destructive: "#dc2626",
  warning:     "#d97706",
  muted:       "#71717a",
};

const STATUS_ORDER = ["APPLIED", "IN_PROCESS", "OFFERED", "HIRED"];
const STATUS_LABEL: Record<string, string> = {
  APPLIED: "Applied",
  IN_PROCESS: "In Process",
  OFFERED: "Offered",
  HIRED: "Hired",
  REJECTED: "Rejected",
};
const FUNNEL_COLORS = [
  `${CHART_COLORS.success}22`,
  `${CHART_COLORS.success}66`,
  CHART_COLORS.success,
  "#0F5C3E",
];
const DONUT_COLORS: Record<string, string> = {
  CLEARED:   CHART_COLORS.success,
  REJECTED:  CHART_COLORS.destructive,
  SCHEDULED: CHART_COLORS.primary,
  NO_SHOW:   CHART_COLORS.warning,
};

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-2xl font-medium text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}

function PersonalDashboard({ stats }: { stats: DashboardStatsPersonal }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <StatCard label="Upcoming interviews" value={stats.upcoming} />
      <StatCard label="Pending feedback" value={stats.pendingFeedback} />
      <StatCard label="Completed" value={stats.completed} />
    </div>
  );
}

function CompanyDashboard({ stats }: { stats: DashboardStatsCompany }) {
  const funnelData = STATUS_ORDER.map((status, i) => ({
    name: STATUS_LABEL[status],
    value: stats.candidatesByStatus.find((c) => c.status === status)?._count || 0,
    fill: FUNNEL_COLORS[i],
  })).filter((d, i) => i === 0 || d.value > 0 || funnelHasUpstream(i));

  function funnelHasUpstream(i: number) {
    return STATUS_ORDER.slice(0, i).some(
      (s) => (stats.candidatesByStatus.find((c) => c.status === s)?._count || 0) > 0
    );
  }

  const donutData = stats.interviewsByStatus.map((s) => ({
    name: s.status,
    value: s._count,
    fill: DONUT_COLORS[s.status] || CHART_COLORS.muted,
  }));

  const barData = stats.topJobs.map((j) => ({ name: j.title, candidates: j.candidateCount }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Open roles" value={stats.openJobCount} />
        <StatCard label="Candidates in pipeline" value={stats.candidatesByStatus.reduce((sum, c) => sum + c._count, 0)} />
        <StatCard label="Offers issued" value={stats.offersByStatus.reduce((sum, o) => sum + o._count, 0)} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm font-medium text-foreground mb-3">Hiring funnel</p>
            <ResponsiveContainer width="100%" height={220}>
              <FunnelChart>
                <Tooltip />
                <Funnel dataKey="value" data={funnelData} isAnimationActive>
                  <LabelList position="right" fill={CHART_COLORS.muted} stroke="none" dataKey="name" />
                </Funnel>
              </FunnelChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <p className="text-sm font-medium text-foreground mb-3">Interview outcomes</p>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Tooltip />
                <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {donutData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-5">
          <p className="text-sm font-medium text-foreground mb-3">Top ongoing hiring processes</p>
          <ResponsiveContainer width="100%" height={Math.max(160, barData.length * 44)}>
            <BarChart data={barData} layout="vertical" margin={{ left: 24 }}>
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="candidates" fill={CHART_COLORS.primary} radius={[0, 6, 6, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardContent() {
  const { user } = useAuth();
  const { data: stats, isLoading, isError } = useDashboardStats();

  return (
    <div>
      <h1 className="text-xl font-medium text-foreground mb-1">Dashboard</h1>
      <p className="text-sm text-muted-foreground mb-6">
        {user?.role === "INTERVIEWER" ? "Your interview workload at a glance." : "Company-wide hiring overview."}
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Loading stats...</p>}
      {isError && <p className="text-sm text-destructive">Failed to load dashboard stats.</p>}

      {stats?.scope === "personal" && <PersonalDashboard stats={stats} />}
      {stats?.scope === "company" && <CompanyDashboard stats={stats} />}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
