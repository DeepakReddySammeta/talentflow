"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSkills } from "@/lib/hooks";
import { Skill, SkillCategory } from "@/lib/types";
import { SKILL_CATEGORY_LABELS, SKILL_CATEGORY_COLORS } from "@/lib/skillCategoryStyles";

export { SKILL_CATEGORY_LABELS, SKILL_CATEGORY_COLORS };

/**
 * Category-tabs + search + multi-select picker against the Skill master.
 * Shared between job creation/edit and candidate creation/edit so both
 * write to the same governed CandidateSkill/JobSkill relations instead of
 * free text — this was originally built for jobs/create and is now the
 * one picker every entity's skill selection uses.
 *
 * `knownSkills` lets a caller pass full Skill objects for ids that were
 * already selected before this component mounted (e.g. editing an
 * existing candidate) so the "Selected" pills render correctly even for
 * skills not present in the current search/category-filtered fetch.
 */
export function SkillPicker({
  selectedSkillIds,
  onToggle,
  knownSkills,
}: {
  selectedSkillIds: Set<string>;
  onToggle: (skill: Skill) => void;
  knownSkills?: Skill[];
}) {
  const [skillSearch, setSkillSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<SkillCategory | "ALL">("ALL");

  const { data: allSkills } = useSkills(
    activeCategory !== "ALL" ? activeCategory : undefined,
    skillSearch || undefined
  );
  const displayedSkills = allSkills ?? [];

  const groupedByCategory = useMemo(() => {
    const cats: SkillCategory[] = ["TECHNICAL", "HUMAN", "MANAGEMENT", "DOMAIN"];
    return cats
      .map((cat) => ({
        cat,
        skills: displayedSkills.filter((s) => s.category === cat && !selectedSkillIds.has(s.id)),
      }))
      .filter((g) => g.skills.length > 0);
  }, [displayedSkills, selectedSkillIds]);

  const selectedSkills = useMemo(() => {
    const byId = new Map<string, Skill>();
    for (const s of knownSkills ?? []) byId.set(s.id, s);
    for (const s of allSkills ?? []) byId.set(s.id, s);
    return Array.from(selectedSkillIds)
      .map((id) => byId.get(id))
      .filter((s): s is Skill => !!s);
  }, [selectedSkillIds, knownSkills, allSkills]);

  return (
    <div className="space-y-4">
      {selectedSkills.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">
            Selected ({selectedSkills.length})
          </Label>
          <div className="flex flex-wrap gap-1.5 p-3 rounded-lg border border-border bg-muted/30 min-h-[48px]">
            {selectedSkills.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 cursor-pointer hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 transition-colors"
                onClick={() => onToggle(s)}
                title="Click to remove"
              >
                {s.name}
                <X className="h-3 w-3" />
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={skillSearch}
            onChange={(e) => setSkillSearch(e.target.value)}
            placeholder="Search skills..."
            className="pl-9"
          />
        </div>
        <Select value={activeCategory} onValueChange={(v) => setActiveCategory(v as SkillCategory | "ALL")}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All categories</SelectItem>
            {(["TECHNICAL", "HUMAN", "MANAGEMENT", "DOMAIN"] as SkillCategory[]).map((c) => (
              <SelectItem key={c} value={c}>{SKILL_CATEGORY_LABELS[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {displayedSkills.length === 0 && (
        <p className="text-sm text-muted-foreground">No skills match your search.</p>
      )}

      {activeCategory !== "ALL" || skillSearch ? (
        <div className="flex flex-wrap gap-2">
          {displayedSkills.filter((s) => !selectedSkillIds.has(s.id)).map((s) => (
            <SkillPill key={s.id} skill={s} onClick={() => onToggle(s)} />
          ))}
        </div>
      ) : (
        <div className="space-y-4 max-h-64 overflow-y-auto pr-1">
          {groupedByCategory.map(({ cat, skills }) => (
            <div key={cat}>
              <p className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium mb-2 ${SKILL_CATEGORY_COLORS[cat]}`}>
                {SKILL_CATEGORY_LABELS[cat]}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((s) => (
                  <SkillPill key={s.id} skill={s} onClick={() => onToggle(s)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SkillPill({ skill, onClick }: { skill: Skill; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs rounded-full border px-2.5 py-1 transition-colors bg-card text-foreground border-border hover:border-primary/40 hover:bg-primary/5"
    >
      {skill.name}
    </button>
  );
}
