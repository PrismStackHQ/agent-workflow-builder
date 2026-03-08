/*
  Warnings:

  - You are about to drop the column `orgId` on the `AgentDefinition` table. All the data in the column will be lost.
  - You are about to drop the column `orgId` on the `ConnectionRef` table. All the data in the column will be lost.
  - You are about to drop the column `orgId` on the `CustomerConfig` table. All the data in the column will be lost.
  - You are about to drop the column `apiKey` on the `Organization` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[workspaceId,provider,externalRefId]` on the table `ConnectionRef` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[workspaceId]` on the table `CustomerConfig` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `workspaceId` to the `AgentDefinition` table without a default value. This is not possible if the table is not empty.
  - Added the required column `workspaceId` to the `ConnectionRef` table without a default value. This is not possible if the table is not empty.
  - Added the required column `workspaceId` to the `CustomerConfig` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('NANGO', 'UNIPILE', 'MERGE');

-- AlterEnum
ALTER TYPE "RunStatus" ADD VALUE 'PAUSED';

-- DropForeignKey
ALTER TABLE "AgentDefinition" DROP CONSTRAINT "AgentDefinition_orgId_fkey";

-- DropForeignKey
ALTER TABLE "ConnectionRef" DROP CONSTRAINT "ConnectionRef_orgId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerConfig" DROP CONSTRAINT "CustomerConfig_orgId_fkey";

-- DropIndex
DROP INDEX "AgentDefinition_orgId_idx";

-- DropIndex
DROP INDEX "ConnectionRef_orgId_provider_externalRefId_key";

-- DropIndex
DROP INDEX "ConnectionRef_orgId_provider_idx";

-- DropIndex
DROP INDEX "CustomerConfig_orgId_key";

-- DropIndex
DROP INDEX "Organization_apiKey_idx";

-- DropIndex
DROP INDEX "Organization_apiKey_key";

-- AlterTable
ALTER TABLE "AgentDefinition" DROP COLUMN "orgId",
ADD COLUMN     "endUserId" TEXT,
ADD COLUMN     "workspaceId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "endUserConnectionId" TEXT,
ADD COLUMN     "pauseMetadata" JSONB,
ADD COLUMN     "pauseReason" TEXT,
ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "pausedAtStepIndex" INTEGER,
ADD COLUMN     "resumedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ConnectionRef" DROP COLUMN "orgId",
ADD COLUMN     "connectionId" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "workspaceId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "CustomerConfig" DROP COLUMN "orgId",
ADD COLUMN     "integrationProvider" "IntegrationProvider",
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "workspaceId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Organization" DROP COLUMN "apiKey";

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailableIntegration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "integrationProvider" "IntegrationProvider" NOT NULL,
    "providerKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "logoUrl" TEXT,
    "rawMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailableIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolRegistryEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "integrationProvider" "IntegrationProvider" NOT NULL,
    "integrationKey" TEXT NOT NULL,
    "actionName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "inputSchema" JSONB,
    "outputSchema" JSONB,
    "rawDefinition" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToolRegistryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_apiKey_key" ON "Workspace"("apiKey");

-- CreateIndex
CREATE INDEX "Workspace_apiKey_idx" ON "Workspace"("apiKey");

-- CreateIndex
CREATE INDEX "Workspace_orgId_idx" ON "Workspace"("orgId");

-- CreateIndex
CREATE INDEX "AvailableIntegration_workspaceId_idx" ON "AvailableIntegration"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "AvailableIntegration_workspaceId_integrationProvider_provid_key" ON "AvailableIntegration"("workspaceId", "integrationProvider", "providerKey");

-- CreateIndex
CREATE INDEX "ToolRegistryEntry_workspaceId_integrationKey_idx" ON "ToolRegistryEntry"("workspaceId", "integrationKey");

-- CreateIndex
CREATE UNIQUE INDEX "ToolRegistryEntry_workspaceId_integrationProvider_actionNam_key" ON "ToolRegistryEntry"("workspaceId", "integrationProvider", "actionName");

-- CreateIndex
CREATE INDEX "AgentDefinition_workspaceId_idx" ON "AgentDefinition"("workspaceId");

-- CreateIndex
CREATE INDEX "AgentDefinition_workspaceId_endUserId_idx" ON "AgentDefinition"("workspaceId", "endUserId");

-- CreateIndex
CREATE INDEX "ConnectionRef_workspaceId_provider_idx" ON "ConnectionRef"("workspaceId", "provider");

-- CreateIndex
CREATE INDEX "ConnectionRef_workspaceId_externalRefId_idx" ON "ConnectionRef"("workspaceId", "externalRefId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectionRef_workspaceId_provider_externalRefId_key" ON "ConnectionRef"("workspaceId", "provider", "externalRefId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerConfig_workspaceId_key" ON "CustomerConfig"("workspaceId");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerConfig" ADD CONSTRAINT "CustomerConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailableIntegration" ADD CONSTRAINT "AvailableIntegration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectionRef" ADD CONSTRAINT "ConnectionRef_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDefinition" ADD CONSTRAINT "AgentDefinition_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolRegistryEntry" ADD CONSTRAINT "ToolRegistryEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
