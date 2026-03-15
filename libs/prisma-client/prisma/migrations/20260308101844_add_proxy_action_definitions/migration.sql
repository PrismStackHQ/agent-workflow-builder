-- CreateTable
CREATE TABLE "ProxyActionDefinition" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "providerConfigKey" TEXT NOT NULL,
    "actionName" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
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
CREATE INDEX "ProxyActionDefinition_workspaceId_providerConfigKey_idx" ON "ProxyActionDefinition"("workspaceId", "providerConfigKey");

-- CreateIndex
CREATE INDEX "ProxyActionDefinition_workspaceId_isEnabled_idx" ON "ProxyActionDefinition"("workspaceId", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "ProxyActionDefinition_workspaceId_providerConfigKey_actionN_key" ON "ProxyActionDefinition"("workspaceId", "providerConfigKey", "actionName");

-- AddForeignKey
ALTER TABLE "ProxyActionDefinition" ADD CONSTRAINT "ProxyActionDefinition_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
