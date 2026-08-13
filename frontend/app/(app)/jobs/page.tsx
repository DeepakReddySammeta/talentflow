"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Download, MoreHorizontal, Archive, RotateCcw } from "lucide-react";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { FilterBar, FilterSelect } from "@/components/FilterBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useJobs, useUpdateJob, useArchiveJob, useRestoreJob } from "@/lib/hooks";
import { Job } from "@/lib/types";

const STATUS_OPTIONS = [
  { label: "Open", value: "OPEN" },
  { label: "Closed", value: "CLOSED" },
  { label: "On Hold", value: "ON_HOLD" },
  { label: "Draft", value: "DRAFT" },
];

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "outline"> = {
  OPEN: "success",
  CLOSED: "secondary",
  ON_HOLD: "warning",
  DRAFT: "outline",
};

export default function JobsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [archived, setArchived] = useState<"active" | "archived">("active");

  const { data, isLoading } = useJobs({ page, limit, search: search || undefined, status: statusFilter || undefined, archived });
  const updateJob = useUpdateJob();
  const archiveJob = useArchiveJob();
  const restoreJob = useRestoreJob();

  function handleExport() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    const token = typeof window !== "undefined" ? localStorage.getItem("ats_token") ?? "" : "";
    params.set("_token", token);
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    const a = document.createElement("a");
    a.href = `${base}/jobs/export?${params.toString()}`;
    a.download = "jobs.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const columns: ColumnDef<Job>[] = [
    {
      key: "title",
      header: "Job",
      render: (j) => (
        <div>
          <p className="font-medium text-sm text-foreground">{j.title}</p>
          <p className="text-xs text-muted-foreground">{j.department}</p>
        </div>
      ),
    },
    {
      key: "id",
      header: "Reference ID",
      render: (j) => <span className="text-xs text-muted-foreground font-mono">{j.id.split("-")[0].toUpperCase()}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (j) => <Badge variant={STATUS_VARIANT[j.status] ?? "outline"}>{j.status.replace("_", " ")}</Badge>,
    },
    {
      key: "candidates",
      header: "Candidates",
      render: (j) => <span className="text-sm text-muted-foreground">{j._count?.candidates ?? 0}</span>,
    },
    {
      key: "stages",
      header: "Pipeline stages",
      render: (j) => <span className="text-sm text-muted-foreground">{j._count?.stages ?? 0}</span>,
    },
    {
      key: "createdBy",
      header: "Created by",
      render: (j) => <span className="text-sm text-muted-foreground">{j.createdBy?.name ?? "—"}</span>,
    },
    {
      key: "createdAt",
      header: "Created",
      render: (j) => (
        <span className="text-sm text-muted-foreground">
          {new Date(j.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      render: (j) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/jobs/${j.id}`); }}>
              View details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); updateJob.mutate({ id: j.id, status: "CLOSED" }); }}>
              Close job
            </DropdownMenuItem>
            {j.archivedAt ? (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); restoreJob.mutate(j.id); }}>
                <RotateCcw className="h-4 w-4 mr-2" /> Restore
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); archiveJob.mutate(j.id); }}
                className="text-destructive focus:text-destructive"
              >
                <Archive className="h-4 w-4 mr-2" /> Archive
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Job Definitions"
        subtitle="Manage open requisitions and pipeline stages"
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">More actions</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExport}>
                  <Download className="h-4 w-4 mr-2" /> Download CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={() => router.push("/jobs/create")}>
              <Plus className="h-4 w-4 mr-1" /> Create
            </Button>
          </>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search jobs..."
        filters={
          <>
            <FilterSelect
              label="All Statuses"
              value={statusFilter}
              options={STATUS_OPTIONS}
              onChange={(v) => { setStatusFilter(v); setPage(1); }}
            />
            <FilterSelect
              label="Active"
              value={archived}
              options={[{ label: "Active", value: "active" }, { label: "Archived", value: "archived" }]}
              onChange={(v) => { setArchived(v as "active" | "archived"); setPage(1); }}
            />
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
        emptyMessage="No jobs found."
        onRowClick={(j) => router.push(`/jobs/${j.id}`)}
        rowKey={(j) => j.id}
      />
    </div>
  );
}
