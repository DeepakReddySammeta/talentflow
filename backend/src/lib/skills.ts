import { prisma } from "./prisma";
import { SkillCategory } from "@prisma/client";

/**
 * Resolves free-text skill names to Skill master ids, case-insensitive
 * exact match. Auto-creates a new Skill (category TECHNICAL, flagged for
 * review) for any name with no match — deliberately no fuzzy matching,
 * since silently merging skill names risks conflating unrelated skills.
 * Used wherever skills arrive as typed text rather than a picked skillId
 * (CSV import today) — same approach as prisma/migrate-candidate-skills.ts.
 */
export async function resolveOrCreateSkillIds(names: string[]): Promise<string[]> {
  const trimmed = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (trimmed.length === 0) return [];

  const allSkills = await prisma.skill.findMany({ select: { id: true, name: true } });
  const byLowerName = new Map(allSkills.map((s) => [s.name.toLowerCase(), s.id]));

  const ids: string[] = [];
  for (const name of trimmed) {
    const key = name.toLowerCase();
    let id = byLowerName.get(key);
    if (!id) {
      const created = await prisma.skill.create({
        data: {
          name,
          category: SkillCategory.TECHNICAL,
          description: "Auto-created from an import — verify category and check for near-duplicate names.",
        },
      });
      id = created.id;
      byLowerName.set(key, id);
    }
    ids.push(id);
  }
  return ids;
}
