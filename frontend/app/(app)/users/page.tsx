"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Download, Upload, MoreHorizontal, Archive, RotateCcw, Pencil } from "lucide-react";
import { DataTable, ColumnDef } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { FilterBar, FilterSelect } from "@/components/FilterBar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUsers, useCreateUser, useUpdateUser, useArchiveUser, useRestoreUser, useImportUsers } from "@/lib/hooks";
import { AdminUser, Role } from "@/lib/types";

const ROLE_OPTIONS = [
  { label: "Admin", value: "ADMIN" },
  { label: "HR", value: "HR" },
  { label: "Manager", value: "MANAGER" },
  { label: "Interviewer", value: "INTERVIEWER" },
];

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  HR: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  MANAGER: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  INTERVIEWER: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

function RolePill({ role }: { role: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[role] ?? "bg-muted text-muted-foreground"}`}>
      {role}
    </span>
  );
}

export default function UsersPage() {
  const router = useRouter();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [status, setStatus] = useState<"active" | "archived">("active");

  const { data, isLoading } = useUsers({ page, limit, search: search || undefined, role: roleFilter || undefined, status });

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const archiveUser = useArchiveUser();
  const restoreUser = useRestoreUser();
  const importUsers = useImportUsers();

  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "HR" as Role, department: "" });

  function handleSearchChange(v: string) { setSearch(v); setPage(1); }

  function openEdit(u: AdminUser) {
    setEditTarget(u);
    setForm({ name: u.name, email: u.email, password: "", role: u.role, department: u.department ?? "" });
  }

  async function handleSave() {
    if (editTarget) {
      await updateUser.mutateAsync({ id: editTarget.id, name: form.name, email: form.email, role: form.role, roles: [form.role], department: form.department || null });
      setEditTarget(null);
    } else {
      await createUser.mutateAsync({ name: form.name, email: form.email, password: form.password, role: form.role, roles: [form.role], department: form.department || undefined });
      setShowCreate(false);
    }
    setForm({ name: "", email: "", password: "", role: "HR", department: "" });
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) importUsers.mutate(file);
    e.target.value = "";
  }

  function handleExport() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (roleFilter) params.set("role", roleFilter);
    params.set("status", status);
    const token = typeof window !== "undefined" ? localStorage.getItem("ats_token") ?? "" : "";
    params.set("_token", token);
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    const a = document.createElement("a");
    a.href = `${base}/users/export?${params.toString()}`;
    a.download = "users.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const columns: ColumnDef<AdminUser>[] = [
    {
      key: "name",
      header: "Employee",
      render: (u) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="text-xs bg-primary/10 text-primary font-medium">
              {u.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-foreground text-sm">{u.name}</p>
            <p className="text-xs text-muted-foreground">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "roles",
      header: "Role",
      render: (u) => (
        <div className="flex flex-wrap gap-1">
          {(u.roles?.length ? u.roles : [u.role]).map((r) => (
            <RolePill key={r} role={r} />
          ))}
        </div>
      ),
    },
    {
      key: "department",
      header: "Department",
      render: (u) => <span className="text-sm text-muted-foreground">{u.department ?? "—"}</span>,
    },
    {
      key: "interviews",
      header: "Interviews given",
      render: (u) => <span className="text-sm text-muted-foreground">{u._count?.interviewsGiven ?? 0}</span>,
    },
    {
      key: "createdAt",
      header: "Joined",
      render: (u) => (
        <span className="text-sm text-muted-foreground">
          {new Date(u.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      render: (u) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEdit(u); }}>
              <Pencil className="h-4 w-4 mr-2" /> Edit
            </DropdownMenuItem>
            {u.archivedAt ? (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); restoreUser.mutate(u.id); }}>
                <RotateCcw className="h-4 w-4 mr-2" /> Restore
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); archiveUser.mutate(u.id); }}
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

  const isOpen = showCreate || !!editTarget;

  return (
    <div>
      <PageHeader
        title="User Management"
        subtitle="Manage team members, roles, and permissions"
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
                <DropdownMenuItem asChild>
                  <label className="flex items-center gap-2 cursor-pointer px-2 py-1.5 text-sm">
                    <Upload className="h-4 w-4" /> Import users
                    <input type="file" accept=".csv,.xlsx" className="hidden" onChange={handleImport} />
                  </label>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" /> Create User
            </Button>
          </>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search by name or email..."
        filters={
          <>
            <FilterSelect label="All Roles" value={roleFilter} options={ROLE_OPTIONS} onChange={(v) => { setRoleFilter(v); setPage(1); }} />
            <FilterSelect
              label="Status"
              value={status}
              options={[{ label: "Active", value: "active" }, { label: "Archived", value: "archived" }]}
              onChange={(v) => { setStatus(v as "active" | "archived"); setPage(1); }}
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
        emptyMessage="No users found."
        onRowClick={(u) => router.push(`/users/${u.id}`)}
        rowKey={(u) => u.id}
      />

      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { setShowCreate(false); setEditTarget(null); setForm({ name: "", email: "", password: "", role: "HR", department: "" }); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit User" : "Create User"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input autoComplete="off" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Asha Rao" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input autoComplete="off" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="asha@company.com" />
            </div>
            {!editTarget && (
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input autoComplete="new-password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 8 characters" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Department <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input autoComplete="off" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Engineering" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setEditTarget(null); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={createUser.isPending || updateUser.isPending}>
              {editTarget ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
