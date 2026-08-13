-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobStatus" ADD VALUE 'DRAFT';
ALTER TYPE "JobStatus" ADD VALUE 'ARCHIVED';

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "education" JSONB,
ADD COLUMN     "experience" INTEGER,
ADD COLUMN     "linkedinUrl" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "portfolioUrl" TEXT,
ADD COLUMN     "projects" JSONB;

-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'candidates';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "roles" "Role"[] DEFAULT ARRAY[]::"Role"[];

-- CreateTable
CREATE TABLE "InterviewerSlot" (
    "id" TEXT NOT NULL,
    "interviewerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewerSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InterviewerSlot_interviewerId_date_key" ON "InterviewerSlot"("interviewerId", "date");

-- AddForeignKey
ALTER TABLE "InterviewerSlot" ADD CONSTRAINT "InterviewerSlot_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
