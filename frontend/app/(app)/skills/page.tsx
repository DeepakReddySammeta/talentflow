"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useSkills, useCreateSkill, useUpdateSkill, useDeleteSkill } from "@/lib/hooks";
import { useAuth } from "@/lib/authContext";
import { Skill, SkillCategory } from "@/lib/types";

const CATEGORIES: { value: SkillCategory; label: string; color: string }[] = [
  { value: "TECHNICAL",  label: "Technical",   color: "bg-blue-100 text-blue-700" },
  { value: "HUMAN",      label: "Human",       color: "bg-green-100 text-green-700" },
  { value: "MANAGEMENT", label: "Management",  color: "bg-purple-100 text-purple-700" },
  { value: "DOMAIN",     label: "Domain",      color: "bg-orange-100 text-orange-700" },
];

function categoryColor(cat: SkillCategory) {
  return CATEGORIES.find((c) => c.value === cat)?.color ?? "bg-muted text-muted-foreground";
}

function SkillFormDialog({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Skill | null;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<SkillCategory>(initial?.category ?? "TECHNICAL");
  const [description, setDescription] = useState(initial?.description ?? "");

  const create = useCreateSkill();
  const update = useUpdateSkill();
  const isPending = create.isPending || update.isPending;

  async function handleSave() {
    if (initial) {
      await update.mutateAsync({ id: initial.id, name: name.trim(), category, description: description.trim() || undefined });
    } else {
      await create.mutateAsync({ name: name.trim(), category, description: description.trim() || undefined });
    }
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit skill" : "Add skill"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Skill name <span className="text-destructive">*</span></Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. React, Leadership"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Category <span className="text-destructive">*</span></Label>
            <Select value={category} onValueChange={(v) => setCategory(v as SkillCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Description <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this skill..."
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending || !name.trim()}>
            {isPending ? "Saving..." : initial ? "Save changes" : "Add skill"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SkillsMasterPage() {
  const { user } = useAuth();
  // Add/Edit/Delete are ADMIN-only server-side (POST/PATCH/DELETE /skills
  // all require allowRoles("ADMIN")) — hide the controls for everyone else
  // rather than showing interactive buttons that would just 403 on submit.
  const isAdmin = user?.role === "ADMIN";

  const [tab, setTab] = useState<SkillCategory | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Skill | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null);

  const { data: allSkills, isLoading } = useSkills(
    tab !== "ALL" ? tab : undefined,
    search || undefined
  );
  const deleteSkill = useDeleteSkill();

  function openCreate() { setEditTarget(null); setDialogOpen(true); }
  function openEdit(s: Skill) { setEditTarget(s); setDialogOpen(true); }
  function closeDialog() { setDialogOpen(false); setEditTarget(null); }

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteSkill.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  }

  // Group skills by category for ALL tab
  const grouped = CATEGORIES.map((cat) => ({
    ...cat,
    skills: (allSkills ?? []).filter((s) => s.category === cat.value),
  })).filter((g) => g.skills.length > 0);

  const flatList = allSkills ?? [];

  return (
    <div>
      <PageHeader
        title="Skills Master"
        subtitle="All approved skills — technical, human, management & domain"
        actions={
          isAdmin ? (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Add skill
            </Button>
          ) : undefined
        }
      />

      {/* Search + tabs */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); }}
            placeholder="Search skills..."
            className="pl-9"
          />
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as SkillCategory | "ALL")}>
          <TabsList>
            <TabsTrigger value="ALL">All</TabsTrigger>
            {CATEGORIES.map((c) => (
              <TabsTrigger key={c.value} value={c.value}>{c.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && flatList.length === 0 && (
        <div className="text-center py-20 text-muted-foreground text-sm">
          No skills found.
          {search && <> Try clearing the search.</>}
        </div>
      )}

      {/* When ALL tab and no search — group by category */}
      {!isLoading && tab === "ALL" && !search && (
        <div className="space-y-8">
          {grouped.map((group) => (
            <div key={group.value}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${group.color}`}>
                  {group.label}
                </span>
                <span className="text-xs text-muted-foreground">{group.skills.length} skills</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {group.skills.map((skill) => (
                  <SkillChip key={skill.id} skill={skill} onEdit={openEdit} onDelete={setDeleteTarget} editable={isAdmin} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Flat list for a specific category or when searching */}
      {!isLoading && (tab !== "ALL" || search) && flatList.length > 0 && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap gap-2">
              {flatList.map((skill) => (
                <SkillChip key={skill.id} skill={skill} onEdit={openEdit} onDelete={setDeleteTarget} editable={isAdmin} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create / Edit dialog */}
      <SkillFormDialog
        open={dialogOpen}
        onClose={closeDialog}
        initial={editTarget}
      />

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete skill</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Remove <span className="font-medium text-foreground">{deleteTarget?.name}</span> from the skills master? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteSkill.isPending}>
              {deleteSkill.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SkillChip({
  skill,
  onEdit,
  onDelete,
  editable,
}: {
  skill: Skill;
  onEdit: (s: Skill) => void;
  onDelete: (s: Skill) => void;
  editable: boolean;
}) {
  return (
    <div className="group inline-flex items-center gap-1 rounded-full border border-border bg-card pl-3 pr-1.5 py-1 text-sm text-foreground transition-colors hover:border-primary/40">
      <span>{skill.name}</span>
      {editable && (
      <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
        <button
          onClick={() => onEdit(skill)}
          className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          title="Edit"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={() => onDelete(skill)}
          className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
          title="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </span>
      )}
    </div>
  );
}
