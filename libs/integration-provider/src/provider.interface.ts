export interface ToolDefinition {
  providerConfigKey: string;
  actionName: string;
  displayName: string;
  description: string;
  type: string | null;
  inputSchema: Record<string, unknown> | null;
  outputSchema: Record<string, unknown> | null;
  rawDefinition: Record<string, unknown> | null;
}

export interface ConnectionCheckResult {
  connected: boolean;
  connectionId?: string;
  providerConfigKey: string;
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
    providerConfigKey?: string,
  ): Promise<ToolDefinition[]>;

  listConnections(
    baseUrl: string,
    apiKey: string,
  ): Promise<ProviderConnection[]>;

  checkConnection(
    baseUrl: string,
    apiKey: string,
    connectionId: string,
    providerConfigKey: string,
  ): Promise<ConnectionCheckResult>;

  executeAction(
    baseUrl: string,
    apiKey: string,
    providerConfigKey: string,
    connectionId: string,
    actionName: string,
    input: Record<string, unknown>,
  ): Promise<ActionExecutionResult>;
}
