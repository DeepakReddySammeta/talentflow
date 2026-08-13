-- CreateEnum
CREATE TYPE "SkillCategory" AS ENUM ('TECHNICAL', 'HUMAN', 'MANAGEMENT', 'DOMAIN');

-- CreateEnum
CREATE TYPE "SkillProficiency" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');

-- CreateEnum
CREATE TYPE "ReferenceSource" AS ENUM ('LINKEDIN', 'INTERNAL', 'REFERRAL', 'JOB_BOARD', 'OTHER');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'FREELANCE', 'INTERNSHIP');

-- CreateEnum
CREATE TYPE "JobLevel" AS ENUM ('INTERN', 'JUNIOR', 'MID', 'SENIOR', 'LEAD', 'MANAGER', 'DIRECTOR');

-- CreateEnum
CREATE TYPE "PayCurrency" AS ENUM ('INR', 'USD');

-- CreateEnum
CREATE TYPE "PayType" AS ENUM ('ANNUAL', 'MONTHLY', 'HOURLY');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "description" TEXT,
ADD COLUMN     "employmentType" "EmploymentType",
ADD COLUMN     "jobCode" TEXT,
ADD COLUMN     "jobLevel" "JobLevel",
ADD COLUMN     "payCurrency" "PayCurrency" DEFAULT 'INR',
ADD COLUMN     "payMax" DECIMAL(65,30),
ADD COLUMN     "payMin" DECIMAL(65,30),
ADD COLUMN     "payType" "PayType" DEFAULT 'ANNUAL',
ADD COLUMN     "referenceId" TEXT,
ADD COLUMN     "referenceSource" "ReferenceSource";

-- AlterTable
ALTER TABLE "PipelineStage" ADD COLUMN     "interviewerId" TEXT;

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "SkillCategory" NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSkill" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "proficiency" "SkillProficiency" NOT NULL DEFAULT 'INTERMEDIATE',

    CONSTRAINT "JobSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobReviewer" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "JobReviewer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Skill_name_key" ON "Skill"("name");

-- CreateIndex
CREATE UNIQUE INDEX "JobSkill_jobId_skillId_key" ON "JobSkill"("jobId", "skillId");

-- CreateIndex
CREATE UNIQUE INDEX "JobReviewer_jobId_userId_key" ON "JobReviewer"("jobId", "userId");

-- AddForeignKey
ALTER TABLE "JobSkill" ADD CONSTRAINT "JobSkill_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSkill" ADD CONSTRAINT "JobSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobReviewer" ADD CONSTRAINT "JobReviewer_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobReviewer" ADD CONSTRAINT "JobReviewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
