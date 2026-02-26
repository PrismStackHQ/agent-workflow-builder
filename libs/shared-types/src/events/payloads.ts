import { AgentStep } from '../interfaces';

// Onboarding events
export interface OrgCreatedEvent {
  orgId: string;
  name: string;
  orgEmail: string;
  apiKey: string;
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
  connectionEndpointUrl: string;
  configuredAt: string;
}

export interface ConnectionRefCreatedEvent {
  orgId: string;
  connectionRefId: string;
  provider: string;
  externalRefId: string;
  status: string;
}

export interface ConnectionRefReadyEvent {
  orgId: string;
  connectionRefId: string;
  provider: string;
}

export interface ConnectionOAuthRequiredEvent {
  orgId: string;
  agentDraftId: string;
  provider: string;
  connectionRefId?: string;
}

export interface ConnectionOAuthCompletedEvent {
  orgId: string;
  connectionRefId: string;
  provider: string;
}

export interface ConnectionTokensRequest {
  orgId: string;
  connectionRefId: string;
}

// RAG events
export interface RagConfiguredEvent {
  orgId: string;
  ragEndpointUrl: string;
  configuredAt: string;
}

export interface RagQueryRequest {
  orgId: string;
  query: string;
}

// Agent events
export interface AgentCommandSubmittedEvent {
  orgId: string;
  commandId: string;
  naturalLanguageCommand: string;
}

export interface AgentDefinitionCreatedEvent {
  orgId: string;
  agentId: string;
  name: string;
  scheduleCron: string | null;
  requiredConnections: string[];
  steps: AgentStep[];
  status: string;
}

export interface AgentDefinitionReadyEvent {
  orgId: string;
  agentId: string;
}

// Scheduler events
export interface AgentScheduledEvent {
  orgId: string;
  agentId: string;
  cronJobName: string;
  namespace: string;
  nextRunAt?: string;
}

export interface AgentRunTriggeredEvent {
  orgId: string;
  agentId: string;
  runId: string;
}

// Runtime events
export interface AgentRunStartedEvent {
  orgId: string;
  agentId: string;
  runId: string;
  startedAt: string;
}

export interface AgentRunStepCompletedEvent {
  orgId: string;
  agentId: string;
  runId: string;
  stepIndex: number;
  stepName: string;
  result?: unknown;
}

export interface AgentRunSucceededEvent {
  orgId: string;
  agentId: string;
  runId: string;
  endedAt: string;
  summary: string;
}

export interface AgentRunFailedEvent {
  orgId: string;
  agentId: string;
  runId: string;
  endedAt: string;
  error: string;
}
