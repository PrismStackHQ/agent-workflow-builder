-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "depth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "parentRunId" TEXT;
