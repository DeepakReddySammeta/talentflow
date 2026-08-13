"use client";

import { use } from "react";
import { Breadcrumb } from "@/components/Breadcrumb";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useImportJobDetail } from "@/lib/hooks";
import { ImportRowResult } from "@/lib/types";

export default function ImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: job, isLoading } = useImportJobDetail(id);

  if (isLoading) {
    return <div className="h-32 rounded-lg bg-muted animate-pulse" />;
  }

  if (!job) {
    return <div className="text-center py-20 text-muted-foreground">Import job not found.</div>;
  }

  const columns: ColumnDef<ImportRowResult>[] = [
    {
      key: "rowNumber",
      header: "Row #",
      className: "w-16",
      render: (r) => <span className="text-sm text-muted-foreground">{r.rowNumber}</span>,
    },
    {
      key: "name",
      header: "Name",
      render: (r) => <span className="text-sm">{String((r.rawData as any).name ?? "—")}</span>,
    },
    {
      key: "email",
      header: "Email",
      render: (r) => <span className="text-sm text-muted-foreground">{String((r.rawData as any).email ?? "—")}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={r.status === "IMPORTED" ? "success" : "destructive"}>
          {r.status}
        </Badge>
      ),
    },
    {
      key: "errorReason",
      header: "Error reason",
      render: (r) => (
        r.errorReason ? (
          <span className="text-xs text-destructive font-mono">{r.errorReason}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )
      ),
    },
  ];

  return (
    <div>
      <Breadcrumb items={[{ label: "Imports & Exports", href: "/imports" }, { label: job.fileName }]} />

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground mb-1">{job.fileName}</h1>
        <p className="text-sm text-muted-foreground">
          {new Date(job.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-5">
            <p className="text-2xl font-semibold text-foreground">{job.totalRows}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total rows</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-2xl font-semibold text-green-600">{job.successCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Imported successfully</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className={`text-2xl font-semibold ${job.failureCount > 0 ? "text-destructive" : "text-foreground"}`}>
              {job.failureCount}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Failed rows</p>
          </CardContent>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={job.rows ?? []}
        total={job.rows?.length ?? 0}
        page={1}
        pageSize={job.rows?.length || 20}
        onPageChange={() => {}}
        isLoading={false}
        emptyMessage="No row details available."
        rowKey={(r) => r.id}
      />
    </div>
  );
}
