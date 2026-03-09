import { AgentStep } from '../interfaces';

// Onboarding events
export interface OrgCreatedEvent {
  orgId: string;
  workspaceId: string;
  name: string;
  orgEmail: string;
  apiKey: string;
  workspaceName: string;
  createdAt: string;
}

export interface OrgUpdatedEvent {
  orgId: string;
  changes: Partial<{ name: string; orgEmail: string }>;
  updatedAt: string;
}

// Connection events
export interface ConnectionEndpointConfiguredEvent {
  orgId: string;
  workspaceId: string;
  connectionEndpointUrl: string;
  configuredAt: string;
}

export interface ConnectionRefCreatedEvent {
  orgId: string;
  workspaceId: string;
  connectionRefId: string;
  provider: string;
  externalRefId: string;
  status: string;
}

export interface ConnectionRefReadyEvent {
  orgId: string;
  workspaceId: string;
  connectionRefId: string;
  provider: string;
}

export interface ConnectionOAuthRequiredEvent {
  orgId: string;
  workspaceId: string;
  agentDraftId: string;
  provider: string;
  connectionRefId?: string;
  endUserId?: string;
}

export interface ConnectionOAuthCompletedEvent {
  orgId: string;
  workspaceId: string;
  connectionRefId: string;
  provider: string;
}

export interface ConnectionTokensRequest {
  orgId: string;
  workspaceId: string;
  connectionRefId: string;
}

// RAG events
export interface RagConfiguredEvent {
  orgId: string;
  workspaceId: string;
  ragEndpointUrl: string;
  configuredAt: string;
}

export interface RagQueryRequest {
  orgId: string;
  workspaceId: string;
  query: string;
}

// Connection metadata sent with plan preview
export interface ConnectionInfo {
  providerKey: string;
  displayName: string;
  logoUrl?: string;
}

// Agent plan events
export interface AgentPlanPreviewEvent {
  orgId: string;
  workspaceId: string;
  commandId: string;
  name: string;
  naturalLanguageCommand: string;
  triggerType: string;
  schedule?: string;
  connectors: string[];
  steps: AgentStep[];
  missingConnections: ConnectionInfo[];
  connectorDisplayNames?: Record<string, string>;
  endUserId?: string;
}

export interface AgentPlanConfirmedEvent {
  orgId: string;
  workspaceId: string;
  commandId: string;
  naturalLanguageCommand: string;
  name: string;
  triggerType: string;
  schedule?: string;
  connectors: string[];
  steps: AgentStep[];
  endUserId?: string;
}

// Agent events
export interface AgentCommandSubmittedEvent {
  orgId: string;
  workspaceId: string;
  commandId: string;
  naturalLanguageCommand: string;
  endUserId?: string;
}

export interface AgentDefinitionCreatedEvent {
  orgId: string;
  workspaceId: string;
  agentId: string;
  name: string;
  scheduleCron: string | null;
  requiredConnections: string[];
  steps: AgentStep[];
  status: string;
}

export interface AgentDefinitionReadyEvent {
  orgId: string;
  workspaceId: string;
  agentId: string;
}

// Scheduler events
export interface AgentScheduledEvent {
  orgId: string;
  workspaceId: string;
  agentId: string;
  cronJobName: string;
  namespace: string;
  nextRunAt?: string;
}

export interface AgentRunTriggeredEvent {
  orgId: string;
  workspaceId: string;
  agentId: string;
  runId: string;
  endUserConnectionId?: string;
}

// Runtime events
export interface AgentRunStartedEvent {
  orgId: string;
  workspaceId: string;
  agentId: string;
  runId: string;
  startedAt: string;
}

export interface AgentRunStepCompletedEvent {
  orgId: string;
  workspaceId: string;
  agentId: string;
  runId: string;
  stepIndex: number;
  stepName: string;
  stepDescription?: string;
  result?: unknown;
}

export interface AgentRunSucceededEvent {
  orgId: string;
  workspaceId: string;
  agentId: string;
  runId: string;
  endedAt: string;
  summary: string;
}

export interface AgentRunFailedEvent {
  orgId: string;
  workspaceId: string;
  agentId: string;
  runId: string;
  endedAt: string;
  error: string;
}

export interface AgentRunPausedEvent {
  orgId: string;
  workspaceId: string;
  agentId: string;
  runId: string;
  pausedAtStepIndex: number;
  reason: string;
  integrationKey: string;
  actionName: string;
  connectionId?: string;
  pausedAt: string;
}

export interface AgentRunResumeRequestedEvent {
  orgId: string;
  workspaceId: string;
  runId: string;
  connectionId: string;
}

export interface AgentRunResumedEvent {
  orgId: string;
  workspaceId: string;
  agentId: string;
  runId: string;
  resumedAt: string;
}

// Tool registry events
export interface ToolRegistrySyncedEvent {
  orgId: string;
  workspaceId: string;
  toolCount: number;
  syncedAt: string;
}

// Connection completion (end-user OAuth)
export interface ConnectionCompletedEvent {
  orgId: string;
  workspaceId: string;
  integrationKey: string;
  connectionId: string;
  endUserId: string;
}
