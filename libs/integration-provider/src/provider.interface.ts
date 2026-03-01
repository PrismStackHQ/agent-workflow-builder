export interface ToolDefinition {
  integrationKey: string;
  actionName: string;
  displayName: string;
  description: string;
  inputSchema: Record<string, unknown> | null;
  outputSchema: Record<string, unknown> | null;
  rawDefinition: Record<string, unknown> | null;
}

export interface ConnectionCheckResult {
  connected: boolean;
  connectionId?: string;
  integrationKey: string;
  error?: string;
}

export interface ActionExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  statusCode?: number;
}

export interface ProviderConnection {
  connectionId: string;
  provider: string;
  providerConfigKey: string;
  endUserId?: string;
  status: 'active' | 'error';
  errors?: string[];
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface IIntegrationProvider {
  readonly providerType: string;

  listTools(
    baseUrl: string,
    apiKey: string,
    integrationKey?: string,
  ): Promise<ToolDefinition[]>;

  listConnections(
    baseUrl: string,
    apiKey: string,
  ): Promise<ProviderConnection[]>;

  checkConnection(
    baseUrl: string,
    apiKey: string,
    connectionId: string,
    integrationKey: string,
  ): Promise<ConnectionCheckResult>;

  executeAction(
    baseUrl: string,
    apiKey: string,
    integrationKey: string,
    connectionId: string,
    actionName: string,
    input: Record<string, unknown>,
  ): Promise<ActionExecutionResult>;
}
