-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('NANGO', 'UNIPILE', 'MERGE');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'OAUTH_REQUIRED', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('DRAFT', 'WAITING_CONNECTIONS', 'READY', 'SCHEDULED', 'PAUSED', 'FAILED');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'RUNNING', 'PAUSED', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orgEmail" TEXT NOT NULL,
    "firebaseUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

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
CREATE TABLE "CustomerConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "integrationProvider" "IntegrationProvider",
    "connectionEndpointUrl" TEXT,
    "connectionEndpointApiKey" TEXT,
    "ragEndpointUrl" TEXT,
    "ragEndpointApiKey" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailableIntegration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "integrationProvider" "IntegrationProvider" NOT NULL,
    "providerConfigKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "logoUrl" TEXT,
    "rawMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailableIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectionRef" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "providerConfigKey" TEXT NOT NULL,
    "externalRefId" TEXT NOT NULL,
    "connectionId" TEXT,
    "metadata" JSONB,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectionRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentDefinition" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "naturalLanguageCommand" TEXT NOT NULL,
    "endUserId" TEXT,
    "scheduleCron" TEXT,
    "triggerType" TEXT NOT NULL DEFAULT 'cron',
    "requiredConnections" JSONB NOT NULL DEFAULT '[]',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "instructions" TEXT,
    "planDescription" TEXT,
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
    "endUserConnectionId" TEXT,
    "pausedAt" TIMESTAMP(3),
    "pausedAtStepIndex" INTEGER,
    "pauseReason" TEXT,
    "pauseMetadata" JSONB,
    "parentRunId" TEXT,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "resumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolRegistryEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "integrationProvider" "IntegrationProvider" NOT NULL,
    "providerConfigKey" TEXT NOT NULL,
    "actionName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT,
    "inputSchema" JSONB,
    "outputSchema" JSONB,
    "rawDefinition" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToolRegistryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProxyActionDefinition" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "providerConfigKey" TEXT NOT NULL,
    "actionName" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'proxy',
    "method" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "paramsConfig" JSONB,
    "bodyConfig" JSONB,
    "headersConfig" JSONB,
    "responseConfig" JSONB,
    "postProcessConfig" JSONB,
    "transformerName" TEXT,
    "inputSchema" JSONB,
    "outputSchema" JSONB,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProxyActionDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_orgEmail_key" ON "Organization"("orgEmail");
CREATE UNIQUE INDEX "Organization_firebaseUid_key" ON "Organization"("firebaseUid");
CREATE INDEX "Organization_orgEmail_idx" ON "Organization"("orgEmail");
CREATE INDEX "Organization_firebaseUid_idx" ON "Organization"("firebaseUid");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_apiKey_key" ON "Workspace"("apiKey");
CREATE INDEX "Workspace_apiKey_idx" ON "Workspace"("apiKey");
CREATE INDEX "Workspace_orgId_idx" ON "Workspace"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerConfig_workspaceId_key" ON "CustomerConfig"("workspaceId");

-- CreateIndex
CREATE INDEX "AvailableIntegration_workspaceId_idx" ON "AvailableIntegration"("workspaceId");
CREATE UNIQUE INDEX "AvailableIntegration_workspaceId_integrationProvider_provi_key" ON "AvailableIntegration"("workspaceId", "integrationProvider", "providerConfigKey");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectionRef_workspaceId_providerConfigKey_externalRefId_key" ON "ConnectionRef"("workspaceId", "providerConfigKey", "externalRefId");
CREATE INDEX "ConnectionRef_workspaceId_providerConfigKey_idx" ON "ConnectionRef"("workspaceId", "providerConfigKey");
CREATE INDEX "ConnectionRef_workspaceId_externalRefId_idx" ON "ConnectionRef"("workspaceId", "externalRefId");

-- CreateIndex
CREATE INDEX "AgentDefinition_workspaceId_idx" ON "AgentDefinition"("workspaceId");
CREATE INDEX "AgentDefinition_workspaceId_endUserId_idx" ON "AgentDefinition"("workspaceId", "endUserId");
CREATE INDEX "AgentDefinition_status_idx" ON "AgentDefinition"("status");

-- CreateIndex
CREATE INDEX "AgentRun_agentId_createdAt_idx" ON "AgentRun"("agentId", "createdAt" DESC);
CREATE INDEX "AgentRun_status_idx" ON "AgentRun"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ToolRegistryEntry_workspaceId_integrationProvider_actionNa_key" ON "ToolRegistryEntry"("workspaceId", "integrationProvider", "actionName");
CREATE INDEX "ToolRegistryEntry_workspaceId_providerConfigKey_idx" ON "ToolRegistryEntry"("workspaceId", "providerConfigKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProxyActionDefinition_workspaceId_providerConfigKey_action_key" ON "ProxyActionDefinition"("workspaceId", "providerConfigKey", "actionName");
CREATE INDEX "ProxyActionDefinition_workspaceId_providerConfigKey_idx" ON "ProxyActionDefinition"("workspaceId", "providerConfigKey");
CREATE INDEX "ProxyActionDefinition_workspaceId_isEnabled_idx" ON "ProxyActionDefinition"("workspaceId", "isEnabled");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerConfig" ADD CONSTRAINT "CustomerConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AvailableIntegration" ADD CONSTRAINT "AvailableIntegration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConnectionRef" ADD CONSTRAINT "ConnectionRef_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentDefinition" ADD CONSTRAINT "AgentDefinition_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ToolRegistryEntry" ADD CONSTRAINT "ToolRegistryEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProxyActionDefinition" ADD CONSTRAINT "ProxyActionDefinition_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
