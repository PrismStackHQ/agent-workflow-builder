export enum ConnectionStatus {
  PENDING = 'PENDING',
  OAUTH_REQUIRED = 'OAUTH_REQUIRED',
  READY = 'READY',
  FAILED = 'FAILED',
}

export enum AgentStatus {
  DRAFT = 'DRAFT',
  WAITING_CONNECTIONS = 'WAITING_CONNECTIONS',
  READY = 'READY',
  SCHEDULED = 'SCHEDULED',
  PAUSED = 'PAUSED',
  FAILED = 'FAILED',
}

export enum RunStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum TriggerType {
  CRON = 'cron',
  EVENT = 'event',
  MANUAL = 'manual',
}
