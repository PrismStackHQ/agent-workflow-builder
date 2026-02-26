-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'OAUTH_REQUIRED', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('DRAFT', 'WAITING_CONNECTIONS', 'READY', 'SCHEDULED', 'PAUSED', 'FAILED');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orgEmail" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "firebaseUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "connectionEndpointUrl" TEXT,
    "connectionEndpointApiKey" TEXT,
    "ragEndpointUrl" TEXT,
    "ragEndpointApiKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectionRef" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalRefId" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectionRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentDefinition" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "naturalLanguageCommand" TEXT NOT NULL,
    "scheduleCron" TEXT,
    "triggerType" TEXT NOT NULL DEFAULT 'cron',
    "requiredConnections" JSONB NOT NULL DEFAULT '[]',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "status" "AgentStatus" NOT NULL DEFAULT 'DRAFT',
    "k8sCronJobName" TEXT,
    "k8sNamespace" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "stepsCompleted" INTEGER NOT NULL DEFAULT 0,
    "logsPointer" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_orgEmail_key" ON "Organization"("orgEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_apiKey_key" ON "Organization"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_firebaseUid_key" ON "Organization"("firebaseUid");

-- CreateIndex
CREATE INDEX "Organization_apiKey_idx" ON "Organization"("apiKey");

-- CreateIndex
CREATE INDEX "Organization_orgEmail_idx" ON "Organization"("orgEmail");

-- CreateIndex
CREATE INDEX "Organization_firebaseUid_idx" ON "Organization"("firebaseUid");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerConfig_orgId_key" ON "CustomerConfig"("orgId");

-- CreateIndex
CREATE INDEX "ConnectionRef_orgId_provider_idx" ON "ConnectionRef"("orgId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectionRef_orgId_provider_externalRefId_key" ON "ConnectionRef"("orgId", "provider", "externalRefId");

-- CreateIndex
CREATE INDEX "AgentDefinition_orgId_idx" ON "AgentDefinition"("orgId");

-- CreateIndex
CREATE INDEX "AgentDefinition_status_idx" ON "AgentDefinition"("status");

-- CreateIndex
CREATE INDEX "AgentRun_agentId_createdAt_idx" ON "AgentRun"("agentId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AgentRun_status_idx" ON "AgentRun"("status");

-- AddForeignKey
ALTER TABLE "CustomerConfig" ADD CONSTRAINT "CustomerConfig_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectionRef" ADD CONSTRAINT "ConnectionRef_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDefinition" ADD CONSTRAINT "AgentDefinition_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
