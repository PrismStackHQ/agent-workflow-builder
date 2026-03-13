import { Injectable, Logger } from '@nestjs/common';
import {
  IIntegrationProvider,
  ToolDefinition,
  ConnectionCheckResult,
  ActionExecutionResult,
  ProviderConnection,
} from '../provider.interface';
import { ProxyActionConfig } from '../proxy/proxy-action.types';

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
          type: action.type || 'action',
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
          type: sync.type || 'sync',
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
          'Connection-Id': connectionId,
          'Provider-Config-Key': integrationKey,
        },
        body: JSON.stringify({
          action_name: actionName,
          input,
        }),
      });

      const data: any = await res.json();

      if (!res.ok) {
        const rawError = data.error || data.message || `Nango action error: ${res.status}`;
        const errorStr = typeof rawError === 'string' ? rawError : JSON.stringify(rawError);
        this.logger.error(`Nango action ${actionName} failed (${res.status}): ${errorStr}`);
        return {
          success: false,
          error: errorStr,
          statusCode: res.status,
        };
      }

      return { success: true, data, statusCode: res.status };
    } catch (err) {
      this.logger.error(`Failed to execute Nango action ${actionName}: ${err}`);
      return { success: false, error: String(err) };
    }
  }

  /**
   * Execute an action via Nango's proxy API, which forwards requests directly
   * to the third-party provider's REST API using Nango-managed OAuth credentials.
   *
   * Unlike executeAction (which calls Nango's /action/trigger), this method
   * calls the provider's native endpoint through Nango's /proxy path.
   *
   * @see https://nango.dev/docs/guides/primitives/proxy
   */
  async executeProxy(
    baseUrl: string,
    apiKey: string,
    connectionId: string,
    providerConfigKey: string,
    config: ProxyActionConfig,
    input: Record<string, unknown>,
  ): Promise<ActionExecutionResult> {
    const nangoBase = this.nangoBaseUrl(baseUrl);

    try {
      // Resolve {{param}} template placeholders in the endpoint path
      let endpoint = config.endpoint;
      endpoint = endpoint.replace(/\{\{(\w+)\}\}/g, (_, paramName) => {
        let value = input[paramName];
        if (value === undefined) {
          throw new Error(`Missing required path parameter: ${paramName}`);
        }
        // If value is an array (e.g. from a map() pipe), use only the first element
        if (Array.isArray(value)) {
          this.logger.warn(`Path param "${paramName}" is an array (${value.length} items), using first element`);
          value = value[0];
        }
        return encodeURIComponent(String(value));
      });

      // Build query string from paramsBuilder
      const queryParams = config.paramsBuilder?.(input) || {};
      const queryString = new URLSearchParams(queryParams).toString();
      const fullUrl = queryString
        ? `${nangoBase}/proxy${endpoint}?${queryString}`
        : `${nangoBase}/proxy${endpoint}`;

      // Build headers — use the actual Nango provider config key (e.g., "google-drive-4"),
      // not the registry's base key (e.g., "google-drive")
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        'Connection-Id': connectionId,
        'Provider-Config-Key': providerConfigKey,
        ...(config.headersBuilder?.(input) || {}),
      };

      // Build fetch options
      const fetchOptions: RequestInit = { method: config.method, headers };

      // Add body for methods that support it
      if (['POST', 'PUT', 'PATCH'].includes(config.method) && config.bodyBuilder) {
        headers['Content-Type'] = 'application/json';
        fetchOptions.body = JSON.stringify(config.bodyBuilder(input));
      }

      this.logger.log(
        `Nango proxy ${config.method} ${endpoint} [${config.actionType}] for ${providerConfigKey} | input: ${JSON.stringify(input)} | url: ${fullUrl}`,
      );

      const res = await fetch(fullUrl, fetchOptions);
      const data: any = await res.json();

      if (!res.ok) {
        const rawError = data.error || data.message || `Nango proxy error: ${res.status}`;
        const errorStr = typeof rawError === 'string' ? rawError : JSON.stringify(rawError);
        this.logger.error(
          `Nango proxy ${config.actionName} failed (${res.status}): ${errorStr}`,
        );
        return { success: false, error: errorStr, statusCode: res.status };
      }

      // Apply response mapper if defined
      let mapped = config.responseMapper ? config.responseMapper(data) : data;

      // Apply post-processor for enrichment (e.g., fetching full details for search result IDs)
      if (config.postProcessor) {
        const proxyFetch = async (method: string, ep: string, params?: Record<string, string>) => {
          const qs = params ? new URLSearchParams(params).toString() : '';
          const url = qs ? `${nangoBase}/proxy${ep}?${qs}` : `${nangoBase}/proxy${ep}`;
          const r = await fetch(url, { method, headers });
          return r.json();
        };
        mapped = await config.postProcessor(mapped, proxyFetch);
      }

      return { success: true, data: mapped, statusCode: res.status };
    } catch (err) {
      this.logger.error(`Failed to execute Nango proxy ${config.actionName}: ${err}`);
      return { success: false, error: String(err) };
    }
  }
}
