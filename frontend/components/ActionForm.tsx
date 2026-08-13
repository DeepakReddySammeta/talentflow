"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PendingActionFormField, PendingActionState } from "@/lib/useAgenticSearchStream";

/**
 * Inline (non-modal) renderer for a "form"-kind proposed write action —
 * create/update/schedule. Rendered directly under the chat turn that
 * proposed it, not in a popup: the user reviews and edits real fields with
 * Submit/Cancel at the bottom, matching how every other response in this
 * app shows up in-line under the search bar. Modals stay reserved for
 * "confirm"-kind actions (archive/restore/approve/delete) — see ChatWindow.
 *
 * Multi-field tools (Jobs) declare a `step`/`stepTitle` per field; this
 * groups them into a stepper with Next/Back, mirroring the REST wizard at
 * jobs/create. Single-step tools get every field on one page, no stepper
 * chips shown.
 */

interface Stage {
  name: string;
  kras: string[];
}

function StageListEditor({ value, onChange }: { value: string; onChange: (json: string) => void }) {
  const stages: Stage[] = useMemo(() => {
    try {
      const parsed = JSON.parse(value || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [value]);
  const [kraInputs, setKraInputs] = useState<Record<number, string>>({});

  function commit(next: Stage[]) {
    onChange(JSON.stringify(next));
  }
  function addStage() {
    commit([...stages, { name: "", kras: [] }]);
  }
  function removeStage(i: number) {
    commit(stages.filter((_, idx) => idx !== i));
  }
  function updateName(i: number, name: string) {
    commit(stages.map((s, idx) => (idx === i ? { ...s, name } : s)));
  }
  function addKra(i: number) {
    const kra = (kraInputs[i] || "").trim();
    if (!kra) return;
    commit(stages.map((s, idx) => (idx === i ? { ...s, kras: [...s.kras, kra] } : s)));
    setKraInputs((prev) => ({ ...prev, [i]: "" }));
  }
  function removeKra(stageIdx: number, kraIdx: number) {
    commit(stages.map((s, idx) => (idx === stageIdx ? { ...s, kras: s.kras.filter((_, k) => k !== kraIdx) } : s)));
  }

  return (
    <div className="space-y-3">
      {stages.map((stage, i) => (
        <div key={i} className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-14 shrink-0">Stage {i + 1}</span>
            <Input
              value={stage.name}
              onChange={(e) => updateName(i, e.target.value)}
              placeholder="e.g. Technical Round"
              className="flex-1 h-8 text-sm"
            />
            {stages.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => removeStage(i)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={kraInputs[i] ?? ""}
              onChange={(e) => setKraInputs((prev) => ({ ...prev, [i]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKra(i);
                }
              }}
              placeholder="Type KRA and press Enter"
              className="flex-1 h-8 text-sm"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => addKra(i)}>
              Add
            </Button>
          </div>
          {stage.kras.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {stage.kras.map((kra, ki) => (
                <span key={ki} className="inline-flex items-center gap-1 text-xs bg-background border rounded-full px-2 py-0.5">
                  {kra}
                  <button type="button" onClick={() => removeKra(i, ki)} className="text-muted-foreground hover:text-destructive">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addStage}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add stage
      </Button>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: PendingActionFormField;
  value: string | number | undefined;
  onChange: (value: string | number) => void;
}) {
  if (field.type === "stageList") {
    return <StageListEditor value={String(value ?? "")} onChange={onChange} />;
  }
  if (field.type === "select") {
    return (
      <Select value={String(value ?? "")} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={field.placeholder} />
        </SelectTrigger>
        <SelectContent>
          {(field.options ?? []).map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field.type === "textarea") {
    return (
      <Textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} rows={4} />
    );
  }
  if (field.type === "number") {
    return (
      <Input type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} />
    );
  }
  if (field.type === "datetime") {
    return <Input type="datetime-local" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }
  if (field.type === "password") {
    return (
      <Input type="password" value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} />
    );
  }
  return <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} />;
}

function isFieldFilled(field: PendingActionFormField, value: string | number | undefined): boolean {
  if (field.type === "stageList") {
    try {
      const parsed = JSON.parse(String(value ?? "[]"));
      return Array.isArray(parsed) && parsed.some((s: any) => s?.name?.trim());
    } catch {
      return false;
    }
  }
  return String(value ?? "").trim().length > 0;
}

export function ActionForm({
  pendingAction,
  values,
  onChange,
  onSubmit,
  onCancel,
  submitting,
}: {
  pendingAction: PendingActionState;
  values: Record<string, string | number>;
  onChange: (key: string, value: string | number) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const steps = useMemo(() => {
    const byStep = new Map<number, { title: string; fields: PendingActionFormField[] }>();
    for (const f of pendingAction.fields ?? []) {
      const idx = f.step ?? 0;
      if (!byStep.has(idx)) byStep.set(idx, { title: f.stepTitle ?? "Details", fields: [] });
      byStep.get(idx)!.fields.push(f);
    }
    return Array.from(byStep.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => v);
  }, [pendingAction.fields]);

  const [step, setStep] = useState(0);
  useEffect(() => setStep(0), [pendingAction.actionId]);

  if (steps.length === 0) return null;

  const isMultiStep = steps.length > 1;
  const current = steps[Math.min(step, steps.length - 1)];
  const isLastStep = step === steps.length - 1;
  const currentStepValid = current.fields.every((f) => !f.required || isFieldFilled(f, values[f.key]));

  return (
    <div className="rounded-xl border border-border bg-card p-4 max-w-xl space-y-4">
      <div>
        <p className="font-medium text-foreground text-sm">{pendingAction.submitLabel}</p>
        {pendingAction.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{pendingAction.description}</p>
        )}
      </div>

      {isMultiStep && (
        <div className="flex items-center gap-2 flex-wrap">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => i < step && setStep(i)}
                className={`flex items-center gap-1.5 text-xs ${
                  i === step ? "font-semibold text-foreground" : i < step ? "text-primary cursor-pointer" : "text-muted-foreground"
                }`}
              >
                <span
                  className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] border ${
                    i === step
                      ? "border-primary bg-primary text-primary-foreground"
                      : i < step
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="hidden sm:inline">{s.title}</span>
              </button>
              {i < steps.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {current.fields.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {f.label}
              {f.required && <span className="text-destructive"> *</span>}
            </Label>
            <FieldInput field={f} value={values[f.key]} onChange={(v) => onChange(f.key, v)} />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1">
        <Button variant="ghost" size="sm" onClick={() => (step > 0 ? setStep(step - 1) : onCancel())} disabled={submitting}>
          {step > 0 ? "Back" : "Cancel"}
        </Button>
        {isMultiStep && !isLastStep ? (
          <Button size="sm" onClick={() => setStep(step + 1)} disabled={!currentStepValid}>
            Next
          </Button>
        ) : (
          <Button size="sm" onClick={onSubmit} disabled={submitting || !currentStepValid}>
            {submitting && <Loader2 size={14} className="animate-spin mr-1" />}
            {pendingAction.submitLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
