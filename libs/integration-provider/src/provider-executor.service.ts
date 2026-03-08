import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@agent-workflow/prisma-client';
import { ProviderFactory } from './provider-factory.service';
import { ActionExecutionResult, ConnectionCheckResult, ProviderConnection } from './provider.interface';
import { ProxyActionRegistry } from './proxy/proxy-action.registry';
import { NangoProvider } from './providers/nango.provider';

@Injectable()
export class ProviderExecutorService {
  private readonly logger = new Logger(ProviderExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: ProviderFactory,
    private readonly proxyRegistry: ProxyActionRegistry,
  ) {}

  private async getWorkspaceConfig(workspaceId: string) {
    const config = await this.prisma.customerConfig.findUnique({
      where: { workspaceId },
    });

    if (!config?.integrationProvider || !config?.connectionEndpointUrl || !config?.connectionEndpointApiKey) {
      throw new Error(`No integration provider configured for workspace ${workspaceId}`);
    }

    return config;
  }

  async checkConnection(
    workspaceId: string,
    connectionId: string,
    integrationKey: string,
  ): Promise<ConnectionCheckResult> {
    const config = await this.getWorkspaceConfig(workspaceId);
    const provider = this.providerFactory.getProvider(config.integrationProvider!);
    return provider.checkConnection(
      config.connectionEndpointUrl!,
      config.connectionEndpointApiKey!,
      connectionId,
      integrationKey,
    );
  }

  async listConnections(workspaceId: string): Promise<ProviderConnection[]> {
    const config = await this.getWorkspaceConfig(workspaceId);
    const provider = this.providerFactory.getProvider(config.integrationProvider!);
    return provider.listConnections(
      config.connectionEndpointUrl!,
      config.connectionEndpointApiKey!,
    );
  }

  async executeViaProvider(
    workspaceId: string,
    integrationKey: string,
    connectionId: string,
    actionName: string,
    input: Record<string, unknown>,
  ): Promise<ActionExecutionResult> {
    const config = await this.getWorkspaceConfig(workspaceId);
    const provider = this.providerFactory.getProvider(config.integrationProvider!);

    // Check if this action has a proxy configuration (Nango-specific)
    this.logger.log(
      `executeViaProvider: integration="${integrationKey}" action="${actionName}" connection="${connectionId}" input=${JSON.stringify(input)}`,
    );
    await this.proxyRegistry.ensureLoaded(workspaceId);
    const proxyConfig = this.proxyRegistry.find(workspaceId, integrationKey, actionName);

    if (proxyConfig && provider instanceof NangoProvider) {
      this.logger.log(
        `→ Proxy match found: ${proxyConfig.providerConfigKey}::${proxyConfig.actionName} [${proxyConfig.actionType}]`,
      );
      return provider.executeProxy(
        config.connectionEndpointUrl!,
        config.connectionEndpointApiKey!,
        connectionId,
        integrationKey,
        proxyConfig,
        input,
      );
    }

    // Fallback to standard action/trigger
    this.logger.warn(
      `→ No proxy config found, falling back to Nango action/trigger API: ${actionName} on ${integrationKey}`,
    );

    return provider.executeAction(
      config.connectionEndpointUrl!,
      config.connectionEndpointApiKey!,
      integrationKey,
      connectionId,
      actionName,
      input,
    );
  }
}
