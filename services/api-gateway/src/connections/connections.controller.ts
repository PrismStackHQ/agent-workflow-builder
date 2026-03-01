import {
  Controller,
  Post,
  Get,
  Put,
  Patch,
  Body,
  Param,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@agent-workflow/prisma-client';
import { NatsService } from '@agent-workflow/nats-client';
import { ApiKeyGuard, CurrentWorkspace } from '@agent-workflow/auth';
import { SUBJECTS } from '@agent-workflow/shared-types';
import { IntegrationFetcherService } from './integration-fetcher.service';
import { ProviderExecutorService, ToolRegistryService } from '@agent-workflow/integration-provider';

@Controller()
export class ConnectionsController {
  private readonly logger = new Logger(ConnectionsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nats: NatsService,
    private readonly integrationFetcher: IntegrationFetcherService,
    private readonly providerExecutor: ProviderExecutorService,
    private readonly toolRegistry: ToolRegistryService,
  ) {}

  @Get('config/connection-endpoint')
  @UseGuards(ApiKeyGuard)
  async getEndpointConfig(@CurrentWorkspace() workspace: any) {
    const config = await this.prisma.customerConfig.findUnique({
      where: { workspaceId: workspace.id },
      select: {
        integrationProvider: true,
        connectionEndpointUrl: true,
        connectionEndpointApiKey: true,
        lastSyncedAt: true,
      },
    });
    return config || { integrationProvider: null, connectionEndpointUrl: null, connectionEndpointApiKey: null, lastSyncedAt: null };
  }

  @Put('config/connection-endpoint')
  @UseGuards(ApiKeyGuard)
  async configureEndpoint(
    @CurrentWorkspace() workspace: any,
    @Body() body: { integrationProvider: string; connectionEndpointUrl: string; connectionEndpointApiKey: string },
  ) {
    await this.prisma.customerConfig.update({
      where: { workspaceId: workspace.id },
      data: {
        integrationProvider: body.integrationProvider as any,
        connectionEndpointUrl: body.connectionEndpointUrl,
        connectionEndpointApiKey: body.connectionEndpointApiKey,
      },
    });

    await this.nats.publish(SUBJECTS.CONNECTION_ENDPOINT_CONFIGURED, {
      orgId: workspace.orgId,
      workspaceId: workspace.id,
      integrationProvider: body.integrationProvider,
      connectionEndpointUrl: body.connectionEndpointUrl,
      configuredAt: new Date().toISOString(),
    });

    // Fetch available integrations from the provider and store them
    let integrations: any[] = [];
    try {
      const fetched = await this.integrationFetcher.fetchIntegrations(
        body.integrationProvider,
        body.connectionEndpointUrl,
        body.connectionEndpointApiKey,
      );

      // Delete stale entries for this workspace+provider, then insert fresh
      await this.prisma.availableIntegration.deleteMany({
        where: { workspaceId: workspace.id, integrationProvider: body.integrationProvider as any },
      });

      if (fetched.length > 0) {
        await this.prisma.availableIntegration.createMany({
          data: fetched.map((item) => ({
            workspaceId: workspace.id,
            integrationProvider: body.integrationProvider as any,
            providerKey: item.providerKey,
            displayName: item.displayName,
            logoUrl: item.logoUrl,
            rawMetadata: item.rawMetadata,
          })),
        });
      }

      integrations = await this.prisma.availableIntegration.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { displayName: 'asc' },
      });

      // Update lastSyncedAt
      await this.prisma.customerConfig.update({
        where: { workspaceId: workspace.id },
        data: { lastSyncedAt: new Date() },
      });
    } catch (err) {
      this.logger.error(`Failed to fetch integrations from provider: ${err}`);
    }

    // Also sync tool definitions from the provider
    try {
      const toolResult = await this.toolRegistry.syncTools(workspace.id);
      this.logger.log(`Synced ${toolResult.toolCount} tools for workspace ${workspace.id}`);
    } catch (err) {
      this.logger.error(`Failed to sync tools from provider: ${err}`);
    }

    const config = await this.prisma.customerConfig.findUnique({
      where: { workspaceId: workspace.id },
      select: { lastSyncedAt: true },
    });

    return { ok: true, integrations, lastSyncedAt: config?.lastSyncedAt || null };
  }

  @Post('integrations/sync')
  @UseGuards(ApiKeyGuard)
  async syncIntegrations(@CurrentWorkspace() workspace: any) {
    const config = await this.prisma.customerConfig.findUnique({
      where: { workspaceId: workspace.id },
    });

    if (!config?.integrationProvider || !config?.connectionEndpointUrl || !config?.connectionEndpointApiKey) {
      return { ok: false, error: 'No integration provider configured' };
    }

    const fetched = await this.integrationFetcher.fetchIntegrations(
      config.integrationProvider,
      config.connectionEndpointUrl,
      config.connectionEndpointApiKey,
    );

    await this.prisma.availableIntegration.deleteMany({
      where: { workspaceId: workspace.id, integrationProvider: config.integrationProvider as any },
    });

    if (fetched.length > 0) {
      await this.prisma.availableIntegration.createMany({
        data: fetched.map((item) => ({
          workspaceId: workspace.id,
          integrationProvider: config.integrationProvider as any,
          providerKey: item.providerKey,
          displayName: item.displayName,
          logoUrl: item.logoUrl,
          rawMetadata: item.rawMetadata,
        })),
      });
    }

    const now = new Date();
    await this.prisma.customerConfig.update({
      where: { workspaceId: workspace.id },
      data: { lastSyncedAt: now },
    });

    const integrations = await this.prisma.availableIntegration.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { displayName: 'asc' },
    });

    return { ok: true, integrations, lastSyncedAt: now };
  }

  @Get('integrations')
  @UseGuards(ApiKeyGuard)
  async listAvailableIntegrations(@CurrentWorkspace() workspace: any) {
    return this.prisma.availableIntegration.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { displayName: 'asc' },
    });
  }

  @Post('connections/sync')
  @UseGuards(ApiKeyGuard)
  async syncConnections(@CurrentWorkspace() workspace: any) {
    const config = await this.prisma.customerConfig.findUnique({
      where: { workspaceId: workspace.id },
    });

    if (!config?.integrationProvider || !config?.connectionEndpointUrl || !config?.connectionEndpointApiKey) {
      return { ok: false, error: 'No integration provider configured', connections: [] };
    }

    try {
      const providerConnections = await this.providerExecutor.listConnections(workspace.id);

      for (const conn of providerConnections) {
        const externalRefId = conn.endUserId || conn.connectionId;
        const status = conn.status === 'error' ? 'FAILED' : 'READY';

        await this.prisma.connectionRef.upsert({
          where: {
            workspaceId_provider_externalRefId: {
              workspaceId: workspace.id,
              provider: conn.providerConfigKey,
              externalRefId,
            },
          },
          update: {
            connectionId: conn.connectionId,
            status: status as any,
            metadata: conn.metadata as any || undefined,
          },
          create: {
            workspaceId: workspace.id,
            provider: conn.providerConfigKey,
            externalRefId,
            connectionId: conn.connectionId,
            status: status as any,
            metadata: conn.metadata as any || undefined,
          },
        });
      }

      const connections = await this.prisma.connectionRef.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { updatedAt: 'desc' },
      });

      this.logger.log(`Synced ${providerConnections.length} connections for workspace ${workspace.id}`);
      return { ok: true, connections, syncedCount: providerConnections.length };
    } catch (err) {
      this.logger.error(`Failed to sync connections: ${err}`);
      return { ok: false, error: String(err), connections: [] };
    }
  }

  @Post('connections/check')
  @UseGuards(ApiKeyGuard)
  async checkConnection(
    @CurrentWorkspace() workspace: any,
    @Body() body: { integrationKey: string; connectionId: string },
  ) {
    const result = await this.providerExecutor.checkConnection(
      workspace.id,
      body.connectionId,
      body.integrationKey,
    );
    return result;
  }

  @Post('connections/complete')
  @UseGuards(ApiKeyGuard)
  async connectionComplete(
    @CurrentWorkspace() workspace: any,
    @Body()
    body: {
      integrationKey: string;
      connectionId: string;
      endUserId: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    // Upsert ConnectionRef: externalRefId = org's endUserId, connectionId = Nango's connectionId
    await this.prisma.connectionRef.upsert({
      where: {
        workspaceId_provider_externalRefId: {
          workspaceId: workspace.id,
          provider: body.integrationKey,
          externalRefId: body.endUserId,
        },
      },
      update: {
        connectionId: body.connectionId,
        status: 'READY',
        metadata: body.metadata as any || undefined,
      },
      create: {
        workspaceId: workspace.id,
        provider: body.integrationKey,
        externalRefId: body.endUserId,
        connectionId: body.connectionId,
        status: 'READY',
        metadata: body.metadata as any || undefined,
      },
    });

    await this.nats.publish(SUBJECTS.CONNECTION_COMPLETED, {
      orgId: workspace.orgId,
      workspaceId: workspace.id,
      integrationKey: body.integrationKey,
      connectionId: body.connectionId,
      endUserId: body.endUserId,
    });

    return { ok: true };
  }

  @Post('connections')
  @UseGuards(ApiKeyGuard)
  async createConnectionRef(
    @CurrentWorkspace() workspace: any,
    @Body() body: { provider: string; externalRefId: string },
  ) {
    const ref = await this.prisma.connectionRef.create({
      data: {
        workspaceId: workspace.id,
        provider: body.provider,
        externalRefId: body.externalRefId,
      },
    });

    await this.nats.publish(SUBJECTS.CONNECTION_REF_CREATED, {
      orgId: workspace.orgId,
      workspaceId: workspace.id,
      connectionRefId: ref.id,
      provider: ref.provider,
      externalRefId: ref.externalRefId,
      status: ref.status,
    });

    return { connectionRefId: ref.id, status: ref.status };
  }

  @Get('connections')
  @UseGuards(ApiKeyGuard)
  async listConnections(@CurrentWorkspace() workspace: any) {
    return this.prisma.connectionRef.findMany({
      where: { workspaceId: workspace.id },
    });
  }

  @Get('connections/:refId')
  @UseGuards(ApiKeyGuard)
  async getConnection(@CurrentWorkspace() workspace: any, @Param('refId') refId: string) {
    return this.prisma.connectionRef.findFirst({
      where: { id: refId, workspaceId: workspace.id },
    });
  }

  @Patch('connections/:refId/ready')
  @UseGuards(ApiKeyGuard)
  async markReady(@CurrentWorkspace() workspace: any, @Param('refId') refId: string) {
    const ref = await this.prisma.connectionRef.update({
      where: { id: refId },
      data: { status: 'READY' },
    });

    await this.nats.publish(SUBJECTS.CONNECTION_REF_READY, {
      orgId: workspace.orgId,
      workspaceId: workspace.id,
      connectionRefId: ref.id,
      provider: ref.provider,
    });

    return ref;
  }
}
