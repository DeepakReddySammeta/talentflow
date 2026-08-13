-- Drop the legacy free-text Candidate.skills column now that every
-- candidate's skills are governed via the CandidateSkill relation
-- (backfilled in prisma/migrate-candidate-skills.ts, already run).
ALTER TABLE "Candidate" DROP COLUMN "skills";
