import { Controller, Put, Body, UseGuards } from '@nestjs/common';
import { PrismaService } from '@agent-workflow/prisma-client';
import { NatsService } from '@agent-workflow/nats-client';
import { ApiKeyGuard, CurrentWorkspace } from '@agent-workflow/auth';
import { SUBJECTS } from '@agent-workflow/shared-types';

@Controller()
export class RagController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nats: NatsService,
  ) {}

  @Put('config/rag-endpoint')
  @UseGuards(ApiKeyGuard)
  async configureRag(
    @CurrentWorkspace() workspace: any,
    @Body() body: { ragEndpointUrl: string; ragEndpointApiKey: string },
  ) {
    await this.prisma.customerConfig.update({
      where: { workspaceId: workspace.id },
      data: {
        ragEndpointUrl: body.ragEndpointUrl,
        ragEndpointApiKey: body.ragEndpointApiKey,
      },
    });

    await this.nats.publish(SUBJECTS.RAG_CONFIGURED, {
      orgId: workspace.orgId,
      workspaceId: workspace.id,
      ragEndpointUrl: body.ragEndpointUrl,
      configuredAt: new Date().toISOString(),
    });

    return { ok: true };
  }
}
