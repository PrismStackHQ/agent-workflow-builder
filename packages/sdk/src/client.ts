import { RestClient } from './rest-client';
import { WsClient } from './ws-client';
import {
  ClientOptions,
  Agent,
  CreateAgentInput,
  Run,
  TriggerRunInput,
  TriggerRunResult,
  Integration,
  Tool,
  ConnectionCheckResult,
  ConnectionEndpointConfig,
  EventMap,
  EventName,
} from './types';

export class AgentWorkflowClient {
  private readonly rest: RestClient;
  private readonly wsClient: WsClient;

  readonly agents: AgentsResource;
  readonly runs: RunsResource;
  readonly integrations: IntegrationsResource;
  readonly tools: ToolsResource;
  readonly connections: ConnectionsResource;
  readonly config: ConfigResource;

  constructor(options: ClientOptions) {
    if (!options.apiKey) throw new Error('apiKey is required');
    this.rest = new RestClient(options);
    this.wsClient = new WsClient(options);

    this.agents = new AgentsResource(this.rest, options.endUserId);
    this.runs = new RunsResource(this.rest);
    this.integrations = new IntegrationsResource(this.rest);
    this.tools = new ToolsResource(this.rest);
    this.connections = new ConnectionsResource(this.rest, options.endUserId);
    this.config = new ConfigResource(this.rest);
  }

  on<E extends EventName>(
    event: E,
    handler: (payload: EventMap[E]) => void,
  ): void {
    this.wsClient.on(event, handler);
  }

  off<E extends EventName>(
    event: E,
    handler: (payload: EventMap[E]) => void,
  ): void {
    this.wsClient.off(event, handler);
  }

  async connect(): Promise<void> {
    return this.wsClient.connect();
  }

  disconnect(): void {
    this.wsClient.disconnect();
  }
}

class AgentsResource {
  constructor(
    private rest: RestClient,
    private endUserId?: string,
  ) {}

  create(input: CreateAgentInput): Promise<Agent> {
    return this.rest.post<Agent>('/agents', input);
  }

  list(): Promise<Agent[]> {
    return this.rest.get<Agent[]>('/agents');
  }

  get(agentId: string): Promise<Agent> {
    return this.rest.get<Agent>(`/agents/${agentId}`);
  }

  async delete(agentId: string): Promise<void> {
    await this.rest.del(`/agents/${agentId}`);
  }

  submitCommand(
    command: string,
    endUserId?: string,
  ): Promise<{ commandId: string; status: string }> {
    return this.rest.post('/agents/command', {
      naturalLanguageCommand: command,
      endUserId: endUserId ?? this.endUserId,
    });
  }
}

class RunsResource {
  constructor(private rest: RestClient) {}

  trigger(
    agentId: string,
    input?: TriggerRunInput,
  ): Promise<TriggerRunResult> {
    return this.rest.post<TriggerRunResult>(
      `/agents/${agentId}/runs`,
      input || {},
    );
  }

  list(agentId: string): Promise<Run[]> {
    return this.rest.get<Run[]>(`/agents/${agentId}/runs`);
  }

  get(agentId: string, runId: string): Promise<Run> {
    return this.rest.get<Run>(`/agents/${agentId}/runs/${runId}`);
  }

  async resume(
    agentId: string,
    runId: string,
    connectionId: string,
  ): Promise<void> {
    await this.rest.post(`/agents/${agentId}/runs/${runId}/resume`, {
      connectionId,
    });
  }
}

class IntegrationsResource {
  constructor(private rest: RestClient) {}

  list(): Promise<Integration[]> {
    return this.rest.get<Integration[]>('/integrations');
  }

  sync(): Promise<{
    ok: boolean;
    integrations: Integration[];
    lastSyncedAt: string;
  }> {
    return this.rest.post('/integrations/sync');
  }
}

class ToolsResource {
  constructor(private rest: RestClient) {}

  list(integrationKey?: string): Promise<Tool[]> {
    const qs = integrationKey
      ? `?integrationKey=${encodeURIComponent(integrationKey)}`
      : '';
    return this.rest.get<Tool[]>(`/tools${qs}`);
  }

  sync(): Promise<{ ok: boolean; toolCount: number }> {
    return this.rest.post('/tools/sync');
  }

  get(actionName: string): Promise<Tool> {
    return this.rest.get<Tool>(`/tools/${encodeURIComponent(actionName)}`);
  }
}

class ConnectionsResource {
  constructor(
    private rest: RestClient,
    private defaultEndUserId?: string,
  ) {}

  check(
    integrationKey: string,
    connectionId: string,
  ): Promise<ConnectionCheckResult> {
    return this.rest.post<ConnectionCheckResult>('/connections/check', {
      integrationKey,
      connectionId,
    });
  }

  async complete(
    integrationKey: string,
    connectionId: string,
    endUserId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const resolvedEndUserId = endUserId ?? this.defaultEndUserId;
    if (!resolvedEndUserId) throw new Error('endUserId is required for connections.complete()');
    await this.rest.post('/connections/complete', {
      integrationKey,
      connectionId,
      endUserId: resolvedEndUserId,
      metadata,
    });
  }
}

class ConfigResource {
  constructor(private rest: RestClient) {}

  getConnectionEndpoint(): Promise<ConnectionEndpointConfig> {
    return this.rest.get<ConnectionEndpointConfig>(
      '/config/connection-endpoint',
    );
  }

  setConnectionEndpoint(
    provider: string,
    url: string,
    apiKey: string,
  ): Promise<unknown> {
    return this.rest.put('/config/connection-endpoint', {
      integrationProvider: provider,
      connectionEndpointUrl: url,
      connectionEndpointApiKey: apiKey,
    });
  }
}
