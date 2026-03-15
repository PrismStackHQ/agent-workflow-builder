-- Rename AvailableIntegration.providerKey -> providerConfigKey
ALTER TABLE "AvailableIntegration" RENAME COLUMN "providerKey" TO "providerConfigKey";

-- Rename ConnectionRef.provider -> providerConfigKey
ALTER TABLE "ConnectionRef" RENAME COLUMN "provider" TO "providerConfigKey";

-- Rename ToolRegistryEntry.integrationKey -> providerConfigKey
ALTER TABLE "ToolRegistryEntry" RENAME COLUMN "integrationKey" TO "providerConfigKey";
