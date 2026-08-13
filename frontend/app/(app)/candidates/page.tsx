"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Download, Upload, MoreHorizontal, Archive, RotateCcw } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCandidates, useCreateCandidate, useImportCandidates, useJobs, useArchiveCandidate, useRestoreCandidate } from "@/lib/hooks";
import { SkillPicker } from "@/components/SkillPicker";
import { SKILL_CATEGORY_LABELS } from "@/lib/skillCategoryStyles";
import { Candidate, Skill } from "@/lib/types";

const SKILL_CATEGORY_OPTIONS = Object.entries(SKILL_CATEGORY_LABELS).map(([value, label]) => ({ label, value }));

const STATUS_OPTIONS = [
  { label: "Applied", value: "APPLIED" },
  { label: "In Process", value: "IN_PROCESS" },
  { label: "Offered", value: "OFFERED" },
  { label: "Hired", value: "HIRED" },
  { label: "Rejected", value: "REJECTED" },
];

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  APPLIED: "secondary",
  IN_PROCESS: "default",
  OFFERED: "warning",
  HIRED: "success",
  REJECTED: "destructive",
};

interface AddCandidateForm {
  name: string;
  email: string;
  phone: string;
  jobId: string;
  experience: string;
  location: string;
  linkedinUrl: string;
}

const EMPTY_FORM: AddCandidateForm = {
  name: "", email: "", phone: "", jobId: "",
  experience: "", location: "", linkedinUrl: "",
};

export default function CandidatesPage() {
  const router = useRouter();
  const importRef = useRef<HTMLInputElement>(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [jobFilter, setJobFilter] = useState("");
  const [skillCategoryFilter, setSkillCategoryFilter] = useState("");
  const [archived, setArchived] = useState<"active" | "archived">("active");

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<AddCandidateForm>(EMPTY_FORM);
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(new Set());

  const { data, isLoading } = useCandidates({
    page, limit,
    search: search || undefined,
    status: statusFilter || undefined,
    jobId: jobFilter || undefined,
    skillCategory: skillCategoryFilter || undefined,
    archived,
  });
  const { data: jobsData } = useJobs({ limit: 100 });
  const createCandidate = useCreateCandidate();
  const importCandidates = useImportCandidates();
  const archiveCandidate = useArchiveCandidate();
  const restoreCandidate = useRestoreCandidate();

  function toggleSkill(skill: Skill) {
    setSelectedSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(skill.id)) next.delete(skill.id);
      else next.add(skill.id);
      return next;
    });
  }

  function handleExport() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    if (jobFilter) params.set("jobId", jobFilter);
    const token = typeof window !== "undefined" ? localStorage.getItem("ats_token") ?? "" : "";
    params.set("_token", token);
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    const a = document.createElement("a");
    a.href = `${base}/candidates/export?${params.toString()}`;
    a.download = "candidates.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    importCandidates.mutate(file);
    e.target.value = "";
  }

  async function handleAdd() {
    await createCandidate.mutateAsync({
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      jobId: form.jobId,
      skillIds: Array.from(selectedSkillIds),
      experience: form.experience ? parseInt(form.experience) : undefined,
      location: form.location.trim() || undefined,
      linkedinUrl: form.linkedinUrl.trim() || undefined,
    });
    setAddOpen(false);
    setForm(EMPTY_FORM);
    setSelectedSkillIds(new Set());
  }

  const jobOptions = (jobsData?.data ?? []).map((j) => ({ label: j.title, value: j.id }));

  const columns: ColumnDef<Candidate>[] = [
    {
      key: "name",
      header: "Candidate",
      render: (c) => (
        <div>
          <p className="font-medium text-sm text-foreground">{c.name}</p>
          <p className="text-xs text-muted-foreground">{c.email}</p>
        </div>
      ),
    },
    {
      key: "job",
      header: "Applied for",
      render: (c) => (
        <div>
          <p className="text-sm text-foreground">{c.job?.title ?? "—"}</p>
          {c.job?.department && <p className="text-xs text-muted-foreground">{c.job.department}</p>}
        </div>
      ),
    },
    {
      key: "skills",
      header: "Skills",
      render: (c) => {
        const links = c.skillLinks ?? [];
        return (
          <div className="flex flex-wrap gap-1">
            {links.slice(0, 3).map((sl) => (
              <span key={sl.id} className="text-xs bg-muted px-1.5 py-0.5 rounded">{sl.skill.name}</span>
            ))}
            {links.length > 3 && (
              <span className="text-xs text-muted-foreground">+{links.length - 3}</span>
            )}
            {links.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
          </div>
        );
      },
    },
    {
      key: "experience",
      header: "Exp.",
      render: (c) => (
        <span className="text-sm text-muted-foreground">
          {c.experience != null ? `${c.experience} yr${c.experience !== 1 ? "s" : ""}` : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (c) => (
        <Badge variant={STATUS_VARIANT[c.status] ?? "outline"}>
          {c.status.replace("_", " ")}
        </Badge>
      ),
    },
    {
      key: "createdAt",
      header: "Applied",
      render: (c) => (
        <span className="text-xs text-muted-foreground">
          {c.createdAt
            ? new Date(c.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
            : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      render: (c) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/candidates/${c.id}`); }}>
              View profile
            </DropdownMenuItem>
            {c.archivedAt ? (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); restoreCandidate.mutate(c.id); }}>
                <RotateCcw className="h-4 w-4 mr-2" /> Restore
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); archiveCandidate.mutate(c.id); }}
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
        title="Candidates"
        subtitle="Everyone currently in your hiring pipeline"
        actions={
          <>
            <input ref={importRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={handleImport} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">More actions</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExport}>
                  <Download className="h-4 w-4 mr-2" /> Download CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => importRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" /> Import candidates
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add candidate
            </Button>
          </>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search candidates..."
        filters={
          <>
            <FilterSelect
              label="All Statuses"
              value={statusFilter}
              options={STATUS_OPTIONS}
              onChange={(v) => { setStatusFilter(v); setPage(1); }}
            />
            <FilterSelect
              label="All Jobs"
              value={jobFilter}
              options={jobOptions}
              onChange={(v) => { setJobFilter(v); setPage(1); }}
            />
            <FilterSelect
              label="All Skill Types"
              value={skillCategoryFilter}
              options={SKILL_CATEGORY_OPTIONS}
              onChange={(v) => { setSkillCategoryFilter(v); setPage(1); }}
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
        emptyMessage="No candidates found."
        onRowClick={(c) => router.push(`/candidates/${c.id}`)}
        rowKey={(c) => c.id}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add candidate</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Full name <span className="text-destructive">*</span></Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Asha Rao" />
              </div>
              <div className="space-y-1.5">
                <Label>Email <span className="text-destructive">*</span></Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="asha@example.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765 43210" />
              </div>
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Bengaluru, India" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Job <span className="text-destructive">*</span></Label>
              <Select value={form.jobId} onValueChange={(v) => setForm({ ...form, jobId: v })}>
                <SelectTrigger><SelectValue placeholder="Select job" /></SelectTrigger>
                <SelectContent>
                  {jobOptions.map((j) => (
                    <SelectItem key={j.value} value={j.value}>{j.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Years of experience</Label>
              <Input type="number" min={0} value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} placeholder="4" className="max-w-[160px]" />
            </div>
            <div className="space-y-1.5">
              <Label>Skills</Label>
              <SkillPicker selectedSkillIds={selectedSkillIds} onToggle={toggleSkill} />
            </div>
            <div className="space-y-1.5">
              <Label>LinkedIn URL</Label>
              <Input value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} placeholder="https://linkedin.com/in/..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              onClick={handleAdd}
              disabled={createCandidate.isPending || !form.name || !form.email || !form.jobId}
            >
              {createCandidate.isPending ? "Adding..." : "Add candidate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
