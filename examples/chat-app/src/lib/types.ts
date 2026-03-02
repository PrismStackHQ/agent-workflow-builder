export type MessageRole = 'user' | 'agent' | 'system';
export type MessageStatus = 'sending' | 'processing' | 'complete' | 'error';
export type StepStatus = 'running' | 'completed' | 'failed';

export interface ChatStep {
  id: string;
  label: string;
  status: StepStatus;
  icon?: 'check' | 'search' | 'link' | 'cog' | 'play' | 'pause' | 'zap';
  detail?: string;
  expandable?: boolean;
  expanded?: boolean;
}

export interface ConnectionCardData {
  provider: string;
  displayName: string;
  description?: string;
  logoUrl?: string;
  connectionRefId: string;
  agentDraftId: string;
  connected: boolean;
  userEmail?: string;
  tools?: string[];
  endUserId?: string;
}

export interface ToolResultData {
  actionName: string;
  stepIndex: number;
  arguments?: Record<string, unknown>;
  result?: unknown;
  status: 'running' | 'completed' | 'failed';
}

export interface PlanPreviewData {
  commandId: string;
  name: string;
  naturalLanguageCommand: string;
  triggerType: string;
  schedule?: string;
  connectors: string[];
  steps: Array<{
    index: number;
    action: string;
    connector: string;
    params: Record<string, unknown>;
  }>;
  missingConnections: string[];
  endUserId?: string;
}

export interface WorkflowResultItem {
  stepIndex: number;
  stepName: string;
  data: unknown;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  status?: MessageStatus;
  steps?: ChatStep[];
  connectionCard?: ConnectionCardData;
  toolResult?: ToolResultData;
  planPreview?: PlanPreviewData;
  workflowResults?: WorkflowResultItem[];
  agentId?: string;
  runId?: string;
  elapsedMs?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  preview: string;
  timestamp: Date;
  messageCount: number;
}

// WebSocket message types from server
export interface WsServerMessage {
  type: string;
  payload?: Record<string, unknown>;
}
