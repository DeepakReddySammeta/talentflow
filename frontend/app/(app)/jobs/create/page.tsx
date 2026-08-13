"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ChevronRight } from "lucide-react";
import { Breadcrumb } from "@/components/Breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateJob, CreateJobPayload } from "@/lib/hooks";
import { SkillPicker } from "@/components/SkillPicker";
import { Skill } from "@/lib/types";

const STEPS = ["General info", "Description", "Pipeline stages", "Required skills"];

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  FREELANCE: "Freelance",
  INTERNSHIP: "Internship",
};

const JOB_LEVEL_LABELS: Record<string, string> = {
  INTERN: "Intern",
  JUNIOR: "Junior",
  MID: "Mid",
  SENIOR: "Senior",
  LEAD: "Lead",
  MANAGER: "Manager",
  DIRECTOR: "Director",
};

interface Stage {
  name: string;
  kras: string[];
  kraInput: string;
}

export default function CreateJobPage() {
  const router = useRouter();
  const createJob = useCreateJob();
  const [step, setStep] = useState(0);

  // Step 1 — general info
  const [form, setForm] = useState({
    title: "",
    department: "",
    status: "OPEN",
    employmentType: "",
    jobLevel: "",
    payMin: "",
    payMax: "",
    payCurrency: "INR",
  });

  // Step 2 — description
  const [description, setDescription] = useState("");

  // Step 3 — pipeline stages
  const [stages, setStages] = useState<Stage[]>([{ name: "Screening", kras: [], kraInput: "" }]);

  // Step 4 — skills
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(new Set());

  function toggleSkill(skill: Skill) {
    setSelectedSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(skill.id)) next.delete(skill.id);
      else next.add(skill.id);
      return next;
    });
  }

  // Stage helpers
  function addStage() {
    setStages([...stages, { name: "", kras: [], kraInput: "" }]);
  }
  function removeStage(i: number) {
    setStages(stages.filter((_, idx) => idx !== i));
  }
  function updateStage(i: number, field: keyof Stage, value: string | string[]) {
    setStages(stages.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  }
  function addKra(i: number) {
    const kra = stages[i].kraInput.trim();
    if (!kra) return;
    updateStage(i, "kras", [...stages[i].kras, kra]);
    updateStage(i, "kraInput", "");
  }
  function removeKra(stageIdx: number, kraIdx: number) {
    updateStage(stageIdx, "kras", stages[stageIdx].kras.filter((_, i) => i !== kraIdx));
  }

  async function handleSubmit(asDraft = false) {
    const payload: CreateJobPayload = {
      title: form.title,
      department: form.department,
      status: asDraft ? "DRAFT" : form.status,
      description: description || undefined,
      employmentType: form.employmentType || undefined,
      jobLevel: form.jobLevel || undefined,
      payMin: form.payMin ? parseFloat(form.payMin) : undefined,
      payMax: form.payMax ? parseFloat(form.payMax) : undefined,
      payCurrency: form.payCurrency || undefined,
      stages: stages.filter((s) => s.name.trim()).map((s) => ({ name: s.name.trim(), kras: s.kras })),
      skillIds: Array.from(selectedSkillIds),
    };
    await createJob.mutateAsync(payload);
    router.push("/jobs");
  }

  const step0Valid = !!form.title.trim() && !!form.department.trim();

  return (
    <div className="max-w-2xl">
      <Breadcrumb items={[{ label: "Jobs", href: "/jobs" }, { label: "Create job definition" }]} />
      <h1 className="text-2xl font-semibold text-foreground mb-6">Create job definition</h1>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8 flex-wrap">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <button
              onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-2 text-sm ${i === step ? "font-semibold text-foreground" : i < step ? "text-primary cursor-pointer" : "text-muted-foreground"}`}
            >
              <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs border-2 ${i === step ? "border-primary bg-primary text-primary-foreground" : i < step ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"}`}>
                {i + 1}
              </span>
              <span className="hidden sm:block">{label}</span>
            </button>
            {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6 space-y-5">

          {/* ── Step 0: General info ── */}
          {step === 0 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <Label>Job title <span className="text-destructive">*</span></Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Senior Frontend Engineer" />
                </div>
                <div className="space-y-1.5">
                  <Label>Department <span className="text-destructive">*</span></Label>
                  <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. Engineering" />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OPEN">Open</SelectItem>
                      <SelectItem value="DRAFT">Draft</SelectItem>
                      <SelectItem value="ON_HOLD">On Hold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Employment type</Label>
                  <Select value={form.employmentType} onValueChange={(v) => setForm({ ...form, employmentType: v })}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Job level</Label>
                  <Select value={form.jobLevel} onValueChange={(v) => setForm({ ...form, jobLevel: v })}>
                    <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(JOB_LEVEL_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Pay range */}
              <div className="space-y-1.5">
                <Label>Pay range <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <div className="flex items-center gap-2">
                  <Select value={form.payCurrency} onValueChange={(v) => setForm({ ...form, payCurrency: v })}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INR">₹ INR</SelectItem>
                      <SelectItem value="USD">$ USD</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    value={form.payMin}
                    onChange={(e) => setForm({ ...form, payMin: e.target.value })}
                    placeholder="Min"
                    className="flex-1"
                  />
                  <span className="text-muted-foreground text-sm">–</span>
                  <Input
                    type="number"
                    min={0}
                    value={form.payMax}
                    onChange={(e) => setForm({ ...form, payMax: e.target.value })}
                    placeholder="Max"
                    className="flex-1"
                  />
                </div>
              </div>
            </>
          )}

          {/* ── Step 1: Description ── */}
          {step === 1 && (
            <div className="space-y-1.5">
              <Label>Job description <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the role, responsibilities, and requirements..."
                rows={12}
              />
            </div>
          )}

          {/* ── Step 2: Pipeline stages ── */}
          {step === 2 && (
            <div className="space-y-4">
              {stages.map((stage, i) => (
                <Card key={i} className="bg-muted/30">
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground w-16">Stage {i + 1}</span>
                      <Input
                        value={stage.name}
                        onChange={(e) => updateStage(i, "name", e.target.value)}
                        placeholder="e.g. Technical Round"
                        className="flex-1"
                      />
                      {stages.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeStage(i)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">KRAs (evaluation competencies)</Label>
                      <div className="flex gap-2">
                        <Input
                          value={stage.kraInput}
                          onChange={(e) => updateStage(i, "kraInput", e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKra(i))}
                          placeholder="Type KRA and press Enter"
                          className="flex-1"
                        />
                        <Button type="button" variant="outline" size="sm" onClick={() => addKra(i)}>Add</Button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {stage.kras.map((kra, ki) => (
                          <span key={ki} className="inline-flex items-center gap-1 text-xs bg-background border rounded-full px-2.5 py-0.5">
                            {kra}
                            <button onClick={() => removeKra(i, ki)} className="text-muted-foreground hover:text-destructive ml-1">×</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addStage}>
                <Plus className="h-4 w-4 mr-1" /> Add stage
              </Button>
            </div>
          )}

          {/* ── Step 3: Required skills ── */}
          {step === 3 && (
            <SkillPicker selectedSkillIds={selectedSkillIds} onToggle={toggleSkill} />
          )}

        </CardContent>
      </Card>

      {/* Footer nav */}
      <div className="flex items-center justify-between mt-6">
        <Button variant="ghost" onClick={() => step > 0 ? setStep(step - 1) : router.push("/jobs")}>
          {step > 0 ? "Back" : "Cancel"}
        </Button>
        <div className="flex gap-2">
          {step === STEPS.length - 1 ? (
            <>
              <Button variant="outline" onClick={() => handleSubmit(true)} disabled={createJob.isPending}>
                Save as draft
              </Button>
              <Button onClick={() => handleSubmit(false)} disabled={createJob.isPending || !form.title || !form.department}>
                {createJob.isPending ? "Creating..." : "Create"}
              </Button>
            </>
          ) : (
            <Button onClick={() => setStep(step + 1)} disabled={step === 0 && !step0Valid}>
              Next
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
