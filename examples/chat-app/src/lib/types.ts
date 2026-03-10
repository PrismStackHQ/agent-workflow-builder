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
    description?: string;
    subAgentId?: string;
    subAgentName?: string;
    steps?: Array<{
      index: number;
      action: string;
      connector: string;
      params: Record<string, unknown>;
      description?: string;
    }>;
    outputSchema?: Record<string, unknown>;
  }>;
  missingConnections: string[];
  connectorDisplayNames?: Record<string, string>;
  instructions?: string;
  endUserId?: string;
}

export interface WorkflowResultItem {
  stepIndex: number;
  stepName: string;
  description?: string;
  data: unknown;
}

export type NextActionType = 'schedule' | 'actions_on_data' | 'save';

export interface NextActionsData {
  agentId: string;
  runId: string;
  workflowName?: string;
  dismissed?: boolean;
  selectedActions?: NextActionType[];
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
  nextActions?: NextActionsData;
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
