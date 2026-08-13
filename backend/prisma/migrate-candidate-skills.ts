// One-time backfill: links every Candidate's legacy free-text `skills`
// strings to the governed Skill master via the new CandidateSkill relation
// (mirrors JobSkill). Run once, after the `candidate_skills_and_archive`
// migration and before any route/tool/UI code stops reading the old
// `skills` column.
//
// HISTORICAL: this already ran successfully against the dev database
// during that migration. It reads Candidate.skills directly, so it can no
// longer run once that column is dropped — kept here as a record of what
// the migration did, not something to re-run.
//
// Run with: npx tsx prisma/migrate-candidate-skills.ts
//
// Matching is case-insensitive EXACT match against Skill.name — no fuzzy
// matching, so e.g. a candidate's "Postgres" will NOT match a master skill
// named "PostgreSQL"; it gets auto-created as its own Skill instead. This
// is deliberate: fuzzy-merging skill names automatically risks silently
// conflating unrelated skills. Every auto-created skill is logged so an
// admin can review/recategorize or merge duplicates via the Skills Master
// page afterward.
import { PrismaClient, SkillCategory } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const skills = await prisma.skill.findMany({ select: { id: true, name: true } });
  const byLowerName = new Map(skills.map((s) => [s.name.toLowerCase(), s.id]));

  const candidates = await prisma.candidate.findMany({ select: { id: true, name: true, skills: true } });

  let linksCreated = 0;
  let skillsAutoCreated = 0;
  const autoCreatedNames: string[] = [];

  for (const candidate of candidates) {
    for (const rawSkill of candidate.skills) {
      const name = rawSkill.trim();
      if (!name) continue;
      const key = name.toLowerCase();

      let skillId = byLowerName.get(key);
      if (!skillId) {
        const created = await prisma.skill.create({
          data: {
            name,
            category: SkillCategory.TECHNICAL,
            description: "Auto-migrated from legacy candidate free-text skills — verify category and check for near-duplicate names.",
          },
        });
        skillId = created.id;
        byLowerName.set(key, skillId);
        skillsAutoCreated++;
        autoCreatedNames.push(name);
      }

      await prisma.candidateSkill.upsert({
        where: { candidateId_skillId: { candidateId: candidate.id, skillId } },
        update: {},
        create: { candidateId: candidate.id, skillId },
      });
      linksCreated++;
    }
  }

  console.log(`Processed ${candidates.length} candidates.`);
  console.log(`Created/confirmed ${linksCreated} CandidateSkill links.`);
  console.log(`Auto-created ${skillsAutoCreated} new Skill rows (not found in master by exact case-insensitive name):`);
  for (const name of autoCreatedNames) console.log(`  - ${name}`);
  if (skillsAutoCreated > 0) {
    console.log("\nReview these on the Skills Master page — check for near-duplicates of existing skills (e.g. differing punctuation/casing) and recategorize if TECHNICAL is wrong.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
