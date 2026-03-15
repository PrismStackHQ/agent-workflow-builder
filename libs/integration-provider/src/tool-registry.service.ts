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

    // Delete existing tools for this workspace+provider, then insert fresh
    await this.prisma.toolRegistryEntry.deleteMany({
      where: { workspaceId, integrationProvider: config.integrationProvider as any },
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

    // Auto-generate ProxyActionDefinitions from templates for each available integration
    await this.ensureProxyActionDefinitions(workspaceId);

    // Invalidate proxy registry cache so it picks up newly created definitions
    this.proxyRegistry.invalidateCache(workspaceId);

    // Sync proxy-based tools into ToolRegistryEntry so they are discoverable
    const proxyCount = await this.syncProxyTools(workspaceId, config.integrationProvider);

    const totalCount = tools.length + proxyCount;
    this.logger.log(`Synced ${tools.length} provider tools + ${proxyCount} proxy tools for workspace ${workspaceId}`);
    return { toolCount: totalCount };
  }

  /**
   * Auto-generate ProxyActionDefinition rows for each AvailableIntegration
   * that has templates defined.
   *
   * Uses the actual Nango integration key (AvailableIntegration.providerConfigKey)
   * as providerConfigKey, so it matches ToolRegistryEntry.providerConfigKey directly.
   */
  private async ensureProxyActionDefinitions(workspaceId: string): Promise<void> {
    const availableIntegrations = await this.prisma.availableIntegration.findMany({
      where: { workspaceId },
      select: { providerConfigKey: true, displayName: true, rawMetadata: true },
    });

    for (const ai of availableIntegrations) {
      const meta = ai.rawMetadata as Record<string, unknown> | null;
      const providerType = (meta?.provider as string) || ai.providerConfigKey;
      const nangoKey = ai.providerConfigKey; // actual Nango integration key

      const templates = this.templateLoader.getTemplateForProvider(providerType);
      if (templates.length === 0) {
        this.logger.debug(`No proxy templates for provider type "${providerType}" (${ai.displayName})`);
        continue;
      }

      // Check which actions already exist for this workspace + providerConfigKey
      const existing = await this.prisma.proxyActionDefinition.findMany({
        where: { workspaceId, providerConfigKey: nangoKey },
        select: { actionName: true },
      });
      const existingActions = new Set(existing.map((e: { actionName: string }) => e.actionName));

      let created = 0;
      for (const template of templates) {
        if (existingActions.has(template.actionName)) continue;

        await this.prisma.proxyActionDefinition.create({
          data: {
            workspaceId,
            providerConfigKey: nangoKey,
            actionName: template.actionName,
            actionType: template.actionType,
            displayName: template.displayName,
            description: template.description,
            method: template.method,
            endpoint: template.endpoint,
            paramsConfig: (template.paramsConfig || undefined) as any,
            bodyConfig: (template.bodyConfig || undefined) as any,
            headersConfig: (template.headersConfig || undefined) as any,
            responseConfig: (template.responseConfig || undefined) as any,
            postProcessConfig: (template.postProcessConfig || undefined) as any,
            inputSchema: (template.inputSchema || undefined) as any,
            outputSchema: (template.outputSchema || undefined) as any,
            isDefault: true,
            isEnabled: true,
          },
        });
        created++;
      }

      if (created > 0) {
        this.logger.log(
          `Auto-generated ${created} proxy actions for "${ai.displayName}" (${nangoKey}) in workspace ${workspaceId}`,
        );
      }
    }
  }

  /**
   * Sync proxy action configs into the tool registry so they are discoverable
   * via getTools() and findToolByAction() alongside Nango-sourced actions.
   *
   * Since ProxyActionDefinition.providerConfigKey stores the actual Nango
   * integration key, no key resolution is needed -- they match directly.
   */
  private async syncProxyTools(workspaceId: string, integrationProvider: string): Promise<number> {
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
