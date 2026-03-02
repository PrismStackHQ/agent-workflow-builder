import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@agent-workflow/prisma-client';
import { ProviderFactory } from './provider-factory.service';
import { ProxyActionRegistry } from './proxy/proxy-action.registry';

@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: ProviderFactory,
    private readonly proxyRegistry: ProxyActionRegistry,
  ) {}

  async syncTools(workspaceId: string): Promise<{ toolCount: number }> {
    const config = await this.prisma.customerConfig.findUnique({
      where: { workspaceId },
    });

    if (!config?.integrationProvider || !config?.connectionEndpointUrl || !config?.connectionEndpointApiKey) {
      this.logger.warn(`No integration provider configured for workspace ${workspaceId}`);
      return { toolCount: 0 };
    }

    const provider = this.providerFactory.getProvider(config.integrationProvider);
    const tools = await provider.listTools(config.connectionEndpointUrl, config.connectionEndpointApiKey);

    // Delete existing tools for this workspace+provider, then insert fresh
    await this.prisma.toolRegistryEntry.deleteMany({
      where: { workspaceId, integrationProvider: config.integrationProvider as any },
    });

    if (tools.length > 0) {
      await this.prisma.toolRegistryEntry.createMany({
        data: tools.map((tool) => ({
          workspaceId,
          integrationProvider: config.integrationProvider as any,
          integrationKey: tool.integrationKey,
          actionName: tool.actionName,
          displayName: tool.displayName,
          description: tool.description || null,
          inputSchema: (tool.inputSchema || undefined) as any,
          outputSchema: (tool.outputSchema || undefined) as any,
          rawDefinition: (tool.rawDefinition || undefined) as any,
        })),
      });
    }

    // Also sync proxy-based tools so they are discoverable
    const proxyCount = await this.syncProxyTools(workspaceId, config.integrationProvider);

    const totalCount = tools.length + proxyCount;
    this.logger.log(`Synced ${tools.length} provider tools + ${proxyCount} proxy tools for workspace ${workspaceId}`);
    return { toolCount: totalCount };
  }

  /**
   * Sync proxy action configs into the tool registry so they are discoverable
   * via getTools() and findToolByAction() alongside Nango-sourced actions.
   *
   * Proxy tools are identified by `rawDefinition.proxyAction: true` so they
   * can be distinguished from provider-native actions when needed.
   */
  private async syncProxyTools(workspaceId: string, integrationProvider: string): Promise<number> {
    const proxyConfigs = this.proxyRegistry.getAll();
    if (proxyConfigs.length === 0) return 0;

    let count = 0;
    for (const config of proxyConfigs) {
      await this.prisma.toolRegistryEntry.upsert({
        where: {
          workspaceId_integrationProvider_actionName: {
            workspaceId,
            integrationProvider: integrationProvider as any,
            actionName: config.actionName,
          },
        },
        update: {
          displayName: config.displayName,
          description: config.description,
          inputSchema: (config.inputSchema || undefined) as any,
          outputSchema: (config.outputSchema || undefined) as any,
          rawDefinition: {
            proxyAction: true,
            actionType: config.actionType,
            method: config.method,
            endpoint: config.endpoint,
            providerConfigKey: config.providerConfigKey,
          } as any,
          syncedAt: new Date(),
        },
        create: {
          workspaceId,
          integrationProvider: integrationProvider as any,
          integrationKey: config.providerConfigKey,
          actionName: config.actionName,
          displayName: config.displayName,
          description: config.description,
          inputSchema: (config.inputSchema || undefined) as any,
          outputSchema: (config.outputSchema || undefined) as any,
          rawDefinition: {
            proxyAction: true,
            actionType: config.actionType,
            method: config.method,
            endpoint: config.endpoint,
            providerConfigKey: config.providerConfigKey,
          } as any,
        },
      });
      count++;
    }

    return count;
  }

  async getTools(workspaceId: string, integrationKey?: string) {
    const where: any = { workspaceId };
    if (integrationKey) where.integrationKey = integrationKey;

    return this.prisma.toolRegistryEntry.findMany({
      where,
      orderBy: [{ integrationKey: 'asc' }, { actionName: 'asc' }],
    });
  }

  async findToolByAction(workspaceId: string, actionName: string) {
    return this.prisma.toolRegistryEntry.findFirst({
      where: { workspaceId, actionName },
    });
  }
}
