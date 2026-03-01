import { Injectable, Logger } from '@nestjs/common';
import {
  IIntegrationProvider,
  ToolDefinition,
  ConnectionCheckResult,
  ActionExecutionResult,
  ProviderConnection,
} from '../provider.interface';

@Injectable()
export class NangoProvider implements IIntegrationProvider {
  readonly providerType = 'NANGO';
  private readonly logger = new Logger(NangoProvider.name);

  private nangoBaseUrl(endpointUrl: string): string {
    // The endpointUrl stored in DB may point to /integrations or similar.
    // Extract the base URL (e.g. https://api.nango.dev)
    const url = new URL(endpointUrl);
    return `${url.protocol}//${url.host}`;
  }

  async listTools(
    baseUrl: string,
    apiKey: string,
    integrationKey?: string,
  ): Promise<ToolDefinition[]> {
    const nangoBase = this.nangoBaseUrl(baseUrl);
    const res = await fetch(`${nangoBase}/scripts/config`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      throw new Error(`Nango scripts/config error: ${res.status} ${res.statusText}`);
    }

    const body: any = await res.json();
    const configs: any[] = body.data || body || [];
    const tools: ToolDefinition[] = [];

    for (const config of configs) {
      const providerConfigKey = config.providerConfigKey || config.provider_config_key || '';

      if (integrationKey && providerConfigKey !== integrationKey) {
        continue;
      }

      const actions: any[] = config.actions || [];
      for (const action of actions) {
        tools.push({
          integrationKey: providerConfigKey,
          actionName: action.name,
          displayName: action.name,
          description: action.description || '',
          inputSchema: action.json_schema?.input || action.input || null,
          outputSchema: action.json_schema?.output || action.returns || null,
          rawDefinition: action,
        });
      }

      const syncs: any[] = config.syncs || [];
      for (const sync of syncs) {
        tools.push({
          integrationKey: providerConfigKey,
          actionName: sync.name,
          displayName: sync.name,
          description: sync.description || '',
          inputSchema: sync.json_schema?.input || sync.input || null,
          outputSchema: sync.json_schema?.output || sync.returns || null,
          rawDefinition: sync,
        });
      }
    }

    return tools;
  }

  async listConnections(
    baseUrl: string,
    apiKey: string,
  ): Promise<ProviderConnection[]> {
    const nangoBase = this.nangoBaseUrl(baseUrl);

    try {
      const res = await fetch(`${nangoBase}/connections`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!res.ok) {
        throw new Error(`Nango connections error: ${res.status} ${res.statusText}`);
      }

      const body: any = await res.json();
      const connections: any[] = body.connections || [];

      return connections.map((c: any) => ({
        connectionId: c.connection_id,
        provider: c.provider,
        providerConfigKey: c.provider_config_key,
        endUserId: c.tags?.end_user_id || undefined,
        status: (c.errors && c.errors.length > 0) ? 'error' as const : 'active' as const,
        errors: c.errors?.map((e: any) => e.type || e.message),
        metadata: { nangoId: c.id, tags: c.tags, created: c.created, provider: c.provider },
        createdAt: c.created,
      }));
    } catch (err) {
      this.logger.error(`Failed to list Nango connections: ${err}`);
      throw err;
    }
  }

  async checkConnection(
    baseUrl: string,
    apiKey: string,
    connectionId: string,
    integrationKey: string,
  ): Promise<ConnectionCheckResult> {
    const nangoBase = this.nangoBaseUrl(baseUrl);

    try {
      const res = await fetch(
        `${nangoBase}/connections?connectionId=${encodeURIComponent(connectionId)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );

      if (!res.ok) {
        return { connected: false, integrationKey, error: `Nango API error: ${res.status}` };
      }

      const body: any = await res.json();
      const connections: any[] = body.connections || [];

      const match = connections.find(
        (c: any) =>
          c.provider_config_key === integrationKey ||
          c.provider === integrationKey,
      );

      if (match && (!match.errors || match.errors.length === 0)) {
        return { connected: true, connectionId: match.connection_id, integrationKey };
      }

      return { connected: false, integrationKey };
    } catch (err) {
      this.logger.error(`Failed to check Nango connection: ${err}`);
      return { connected: false, integrationKey, error: String(err) };
    }
  }

  async executeAction(
    baseUrl: string,
    apiKey: string,
    integrationKey: string,
    connectionId: string,
    actionName: string,
    input: Record<string, unknown>,
  ): Promise<ActionExecutionResult> {
    const nangoBase = this.nangoBaseUrl(baseUrl);

    try {
      const res = await fetch(`${nangoBase}/action/trigger`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action_name: actionName,
          connection_id: connectionId,
          provider_config_key: integrationKey,
          input,
        }),
      });

      const data: any = await res.json();

      if (!res.ok) {
        return {
          success: false,
          error: data.error || data.message || `Nango action error: ${res.status}`,
          statusCode: res.status,
        };
      }

      return { success: true, data, statusCode: res.status };
    } catch (err) {
      this.logger.error(`Failed to execute Nango action ${actionName}: ${err}`);
      return { success: false, error: String(err) };
    }
  }
}
