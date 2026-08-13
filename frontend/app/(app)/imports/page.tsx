"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { useAllImportJobs } from "@/lib/hooks";
import { ImportJobResult } from "@/lib/types";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  COMPLETED: "success",
  PROCESSING: "secondary",
  FAILED: "destructive",
};

const TYPE_LABELS: Record<string, string> = {
  candidates: "Candidates",
  users: "Users",
  jobs: "Jobs",
};

export default function ImportsPage() {
  const router = useRouter();
  const { data: jobs, isLoading } = useAllImportJobs();

  const columns: ColumnDef<ImportJobResult>[] = [
    {
      key: "fileName",
      header: "File",
      render: (j) => <span className="text-sm font-medium text-foreground">{j.fileName}</span>,
    },
    {
      key: "type",
      header: "Type",
      render: (j) => <span className="text-sm text-muted-foreground">{TYPE_LABELS[j.type] ?? j.type}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (j) => <Badge variant={STATUS_VARIANT[j.status] ?? "outline"}>{j.status}</Badge>,
    },
    {
      key: "totalRows",
      header: "Total rows",
      render: (j) => <span className="text-sm text-muted-foreground">{j.totalRows}</span>,
    },
    {
      key: "successCount",
      header: "Success",
      render: (j) => <span className="text-sm text-green-600 font-medium">{j.successCount}</span>,
    },
    {
      key: "failureCount",
      header: "Failed",
      render: (j) => (
        <span className={`text-sm font-medium ${j.failureCount > 0 ? "text-destructive" : "text-muted-foreground"}`}>
          {j.failureCount}
        </span>
      ),
    },
    {
      key: "uploadedBy",
      header: "Uploaded by",
      render: (j) => <span className="text-sm text-muted-foreground">{j.uploadedBy?.name ?? "—"}</span>,
    },
    {
      key: "createdAt",
      header: "Date",
      render: (j) => (
        <span className="text-sm text-muted-foreground">
          {new Date(j.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Imports & Exports"
        subtitle="Track all file imports and their results"
      />

      <DataTable
        columns={columns}
        data={jobs ?? []}
        total={jobs?.length ?? 0}
        page={1}
        pageSize={jobs?.length || 20}
        onPageChange={() => {}}
        isLoading={isLoading}
        emptyMessage="No imports yet."
        onRowClick={(j) => router.push(`/imports/${j.id}`)}
        rowKey={(j) => j.id}
      />
    </div>
  );
}
