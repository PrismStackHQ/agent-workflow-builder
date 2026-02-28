import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiKeyGuard, CurrentWorkspace } from '@agent-workflow/auth';
import { NatsService } from '@agent-workflow/nats-client';
import { SUBJECTS } from '@agent-workflow/shared-types';
import { ToolRegistryService } from '@agent-workflow/integration-provider';

@Controller()
export class ToolsController {
  private readonly logger = new Logger(ToolsController.name);

  constructor(
    private readonly toolRegistry: ToolRegistryService,
    private readonly nats: NatsService,
  ) {}

  @Get('tools')
  @UseGuards(ApiKeyGuard)
  async listTools(
    @CurrentWorkspace() workspace: any,
    @Query('integrationKey') integrationKey?: string,
  ) {
    return this.toolRegistry.getTools(workspace.id, integrationKey);
  }

  @Post('tools/sync')
  @UseGuards(ApiKeyGuard)
  async syncTools(@CurrentWorkspace() workspace: any) {
    const result = await this.toolRegistry.syncTools(workspace.id);

    await this.nats.publish(SUBJECTS.TOOL_REGISTRY_SYNCED, {
      orgId: workspace.orgId,
      workspaceId: workspace.id,
      toolCount: result.toolCount,
      syncedAt: new Date().toISOString(),
    });

    return { ok: true, toolCount: result.toolCount };
  }

  @Get('tools/:actionName')
  @UseGuards(ApiKeyGuard)
  async getToolByAction(
    @CurrentWorkspace() workspace: any,
    @Param('actionName') actionName: string,
  ) {
    const tool = await this.toolRegistry.findToolByAction(workspace.id, actionName);
    if (!tool) {
      return { error: 'Tool not found', actionName };
    }
    return tool;
  }
}
