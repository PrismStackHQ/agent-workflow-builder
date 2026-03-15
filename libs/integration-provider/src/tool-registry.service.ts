import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@agent-workflow/prisma-client';
import { ProviderFactory } from './provider-factory.service';
import { ProxyActionRegistry } from './proxy/proxy-action.registry';
import { TemplateLoaderService } from './proxy/template-loader.service';

@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: ProviderFactory,
    private readonly proxyRegistry: ProxyActionRegistry,
    private readonly templateLoader: TemplateLoaderService,
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

    // Delete existing non-proxy tools for this workspace+provider, then insert fresh
    // Proxy tools are managed separately via Import Proxy Tools
    await this.prisma.toolRegistryEntry.deleteMany({
      where: {
        workspaceId,
        integrationProvider: config.integrationProvider as any,
        type: { not: 'proxy' },
      },
    });

    if (tools.length > 0) {
      await this.prisma.toolRegistryEntry.createMany({
        data: tools.map((tool) => ({
          workspaceId,
          integrationProvider: config.integrationProvider as any,
          providerConfigKey: tool.providerConfigKey,
          actionName: tool.actionName,
          displayName: tool.displayName,
          description: tool.description || null,
          type: tool.type || null,
          inputSchema: (tool.inputSchema || undefined) as any,
          outputSchema: (tool.outputSchema || undefined) as any,
          rawDefinition: (tool.rawDefinition || undefined) as any,
        })),
      });
    }

    this.logger.log(`Synced ${tools.length} provider tools for workspace ${workspaceId}`);
    return { toolCount: tools.length };
  }

  /**
   * Sync proxy action configs into the tool registry so they are discoverable
   * via getTools() and findToolByAction() alongside Nango-sourced actions.
   *
   * Called explicitly after proxy action imports (not during tool sync).
   */
  async syncProxyTools(workspaceId: string): Promise<number> {
    const config = await this.prisma.customerConfig.findUnique({
      where: { workspaceId },
    });
    if (!config?.integrationProvider) return 0;
    const integrationProvider = config.integrationProvider;
    await this.proxyRegistry.ensureLoaded(workspaceId);
    const proxyConfigs = this.proxyRegistry.getAll(workspaceId);
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
          providerConfigKey: config.providerConfigKey,
          displayName: config.displayName,
          description: config.description,
          type: 'proxy',
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
          providerConfigKey: config.providerConfigKey,
          actionName: config.actionName,
          displayName: config.displayName,
          description: config.description,
          type: 'proxy',
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

  async getTools(workspaceId: string, providerConfigKey?: string) {
    const where: any = { workspaceId };
    if (providerConfigKey) where.providerConfigKey = providerConfigKey;

    return this.prisma.toolRegistryEntry.findMany({
      where,
      orderBy: [{ providerConfigKey: 'asc' }, { actionName: 'asc' }],
    });
  }

  async findToolByAction(workspaceId: string, actionName: string) {
    return this.prisma.toolRegistryEntry.findFirst({
      where: { workspaceId, actionName },
    });
  }
}
