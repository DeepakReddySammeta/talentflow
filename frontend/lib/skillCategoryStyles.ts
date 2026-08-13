import { SkillCategory } from "./types";

// Shared across SkillPicker, the A2UI CandidateCard, and the candidate
// detail page — one place for the category → label/color mapping so all
// three stay visually consistent. Kept dependency-free (no hooks/components)
// since a2uiCatalog.tsx pulls this in and shouldn't drag in unrelated UI.
export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  TECHNICAL: "Technical",
  HUMAN: "Human",
  MANAGEMENT: "Management",
  DOMAIN: "Domain",
};

export const SKILL_CATEGORY_COLORS: Record<SkillCategory, string> = {
  TECHNICAL: "bg-blue-100 text-blue-700",
  HUMAN: "bg-green-100 text-green-700",
  MANAGEMENT: "bg-purple-100 text-purple-700",
  DOMAIN: "bg-orange-100 text-orange-700",
};
