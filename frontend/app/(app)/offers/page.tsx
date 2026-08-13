"use client";

import { useState } from "react";
import { Archive, RotateCcw, MoreHorizontal } from "lucide-react";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { FilterBar, FilterSelect } from "@/components/FilterBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useApproveOffer, useArchiveOffer, useRestoreOffer, useOffers } from "@/lib/hooks";
import { useAuth } from "@/lib/authContext";
import { Offer } from "@/lib/types";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  DRAFT: "warning",
  SENT: "secondary",
  ACCEPTED: "success",
  DECLINED: "destructive",
};

export default function OffersPage() {
  const [archived, setArchived] = useState<"active" | "archived">("active");
  const { data, isLoading } = useOffers(archived);
  const approveOffer = useApproveOffer();
  const archiveOffer = useArchiveOffer();
  const restoreOffer = useRestoreOffer();
  const { user } = useAuth();

  const canApprove = user?.role === "ADMIN" || user?.role === "MANAGER";
  const canArchive = user?.role === "ADMIN" || user?.role === "HR";

  const columns: ColumnDef<Offer>[] = [
    {
      key: "candidate",
      header: "Candidate",
      render: (o) => (
        <div>
          <p className="font-medium text-sm text-foreground">{o.candidate?.name ?? "—"}</p>
          <p className="text-xs text-muted-foreground">{o.job?.title ?? ""}</p>
        </div>
      ),
    },
    {
      key: "salary",
      header: "Salary",
      render: (o) => (
        <span className="text-sm font-medium text-foreground">
          ₹{Number(o.salary).toLocaleString("en-IN")}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (o) => (
        <Badge variant={STATUS_VARIANT[o.status] ?? "outline"}>
          {o.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-28",
      render: (o) => (
        <div className="flex items-center justify-end gap-1">
          {canApprove && o.status === "DRAFT" && (
            <Button
              size="sm"
              onClick={(e) => { e.stopPropagation(); approveOffer.mutate(o.id); }}
              disabled={approveOffer.isPending}
            >
              Approve
            </Button>
          )}
          {canArchive && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {o.archivedAt ? (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); restoreOffer.mutate(o.id); }}>
                    <RotateCcw className="h-4 w-4 mr-2" /> Restore
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={(e) => { e.stopPropagation(); archiveOffer.mutate(o.id); }}
                    className="text-destructive focus:text-destructive"
                  >
                    <Archive className="h-4 w-4 mr-2" /> Archive
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Offers"
        subtitle="Salary-sensitive data — not visible to interviewers"
      />

      {canArchive && (
        <FilterBar
          filters={
            <FilterSelect
              label="Active"
              value={archived}
              options={[{ label: "Active", value: "active" }, { label: "Archived", value: "archived" }]}
              onChange={(v) => setArchived(v as "active" | "archived")}
            />
          }
        />
      )}

      <DataTable
        columns={columns}
        data={data ?? []}
        total={data?.length ?? 0}
        page={1}
        pageSize={(data?.length ?? 0) || 20}
        onPageChange={() => {}}
        isLoading={isLoading}
        emptyMessage="No offers yet."
        rowKey={(o) => o.id}
      />
    </div>
  );
}
