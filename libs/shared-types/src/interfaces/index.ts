export interface AgentStep {
  index: number;
  action: string;
  connector: string;
  params: Record<string, unknown>;
}

export interface ParsedIntent {
  trigger: {
    type: 'cron' | 'event';
    schedule?: string;
    event?: string;
  };
  connectors: string[];
  steps: AgentStep[];
}

export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  metadata?: Record<string, unknown>;
}

export interface OAuthRequestResponse {
  externalRefId: string;
  authUrl: string;
}
