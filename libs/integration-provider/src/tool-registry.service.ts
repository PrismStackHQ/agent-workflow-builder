import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@agent-workflow/prisma-client';
import { ProviderFactory } from './provider-factory.service';

@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: ProviderFactory,
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

    this.logger.log(`Synced ${tools.length} tools for workspace ${workspaceId}`);
    return { toolCount: tools.length };
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
