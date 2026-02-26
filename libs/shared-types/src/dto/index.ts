// Onboarding DTOs
export interface CreateOrgDto {
  name: string;
  orgEmail: string;
}

export interface UpdateOrgDto {
  name?: string;
  orgEmail?: string;
}

// Connection DTOs
export interface ConfigureConnectionEndpointDto {
  connectionEndpointUrl: string;
  connectionEndpointApiKey: string;
}

export interface CreateConnectionRefDto {
  provider: string;
  externalRefId: string;
}

// RAG DTOs
export interface ConfigureRagEndpointDto {
  ragEndpointUrl: string;
  ragEndpointApiKey: string;
}

// Agent DTOs
export interface SubmitAgentCommandDto {
  naturalLanguageCommand: string;
}

// WebSocket DTOs
export interface WsAuthMessage {
  type: 'auth';
  payload: { apiKey: string };
}

export interface WsAgentCommandSubmit {
  type: 'agent_command_submit';
  payload: { naturalLanguageCommand: string };
}

export interface WsOAuthComplete {
  type: 'oauth_complete';
  payload: { connectionRefId: string; provider: string };
}

export interface WsMessage {
  type: string;
  payload?: Record<string, unknown>;
}
