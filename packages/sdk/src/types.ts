// --- Client options ---

export interface ClientOptions {
  apiKey: string;
  baseUrl?: string;
  wsUrl?: string;
}

// --- Agent types ---

export interface CreateAgentInput {
  name: string;
  triggerType: 'cron' | 'event' | 'manual';
  scheduleCron?: string;
  steps: AgentStepInput[];
}

export interface AgentStepInput {
  index: number;
  action: string;
  connector: string;
  params: Record<string, unknown>;
}

export interface Agent {
  id: string;
  workspaceId: string;
  name: string;
  naturalLanguageCommand: string | null;
  triggerType: string;
  scheduleCron: string | null;
  requiredConnections: string[];
  steps: AgentStepInput[];
  status: AgentStatus;
  k8sCronJobName: string | null;
  k8sNamespace: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AgentStatus =
  | 'DRAFT'
  | 'WAITING_CONNECTIONS'
  | 'READY'
  | 'SCHEDULED'
  | 'PAUSED'
  | 'FAILED';

// --- Run types ---

export interface Run {
  id: string;
  agentId: string;
  status: RunStatus;
  stepsCompleted: number;
  startedAt: string | null;
  endedAt: string | null;
  errorMessage: string | null;
  endUserConnectionId: string | null;
  pausedAt: string | null;
  pausedAtStepIndex: number | null;
  pauseReason: string | null;
  pauseMetadata: unknown;
  resumedAt: string | null;
  createdAt: string;
}

export type RunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'PAUSED'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED';

export interface TriggerRunInput {
  endUserConnectionId?: string;
}

export interface TriggerRunResult {
  runId: string;
  status: string;
}

// --- Integration types ---

export interface Integration {
  id: string;
  workspaceId: string;
  integrationProvider: string;
  providerKey: string;
  displayName: string;
  logoUrl: string | null;
  rawMetadata: unknown;
  createdAt: string;
  updatedAt: string;
}

// --- Tool types ---

export interface Tool {
  id: string;
  workspaceId: string;
  integrationProvider: string;
  integrationKey: string;
  actionName: string;
  displayName: string;
  description: string | null;
  inputSchema: unknown;
  outputSchema: unknown;
  rawDefinition: unknown;
  syncedAt: string;
  createdAt: string;
  updatedAt: string;
}

// --- Connection types ---

export interface ConnectionCheckResult {
  connected: boolean;
  connectionId?: string;
  integrationKey: string;
  error?: string;
}

// --- Config types ---

export interface ConnectionEndpointConfig {
  integrationProvider: string | null;
  connectionEndpointUrl: string | null;
  connectionEndpointApiKey: string | null;
  lastSyncedAt: string | null;
}

// --- WebSocket event types ---

export interface RunStartedEvent {
  agentId: string;
  runId: string;
  startedAt: string;
}

export interface RunStepCompletedEvent {
  agentId: string;
  runId: string;
  stepIndex: number;
  stepName: string;
}

export interface RunSucceededEvent {
  agentId: string;
  runId: string;
  summary: string;
}

export interface RunFailedEvent {
  agentId: string;
  runId: string;
  error: string;
}

export interface RunPausedEvent {
  agentId: string;
  runId: string;
  reason: string;
  integrationKey: string;
  actionName: string;
  pausedAt: string;
}

export interface RunResumedEvent {
  agentId: string;
  runId: string;
  resumedAt: string;
}

export interface AgentCreatedEvent {
  agentId: string;
  name: string;
  scheduleCron: string | null;
  status: string;
}

export interface AgentScheduledEvent {
  agentId: string;
  cronJobName: string;
  nextRunAt?: string;
}

export interface EventMap {
  'run:started': RunStartedEvent;
  'run:step_completed': RunStepCompletedEvent;
  'run:succeeded': RunSucceededEvent;
  'run:failed': RunFailedEvent;
  'run:paused': RunPausedEvent;
  'run:resumed': RunResumedEvent;
  'agent:created': AgentCreatedEvent;
  'agent:scheduled': AgentScheduledEvent;
}

export type EventName = keyof EventMap;
