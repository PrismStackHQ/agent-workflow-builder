import {
  Controller,
  Post,
  Get,
  Put,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '@agent-workflow/prisma-client';
import { NatsService } from '@agent-workflow/nats-client';
import { ApiKeyGuard, CurrentOrg } from '@agent-workflow/auth';
import { SUBJECTS } from '@agent-workflow/shared-types';

@Controller()
export class ConnectionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nats: NatsService,
  ) {}

  @Put('config/connection-endpoint')
  @UseGuards(ApiKeyGuard)
  async configureEndpoint(
    @CurrentOrg() org: any,
    @Body() body: { connectionEndpointUrl: string; connectionEndpointApiKey: string },
  ) {
    await this.prisma.customerConfig.update({
      where: { orgId: org.id },
      data: {
        connectionEndpointUrl: body.connectionEndpointUrl,
        connectionEndpointApiKey: body.connectionEndpointApiKey,
      },
    });

    await this.nats.publish(SUBJECTS.CONNECTION_ENDPOINT_CONFIGURED, {
      orgId: org.id,
      connectionEndpointUrl: body.connectionEndpointUrl,
      configuredAt: new Date().toISOString(),
    });

    return { ok: true };
  }

  @Post('connections')
  @UseGuards(ApiKeyGuard)
  async createConnectionRef(
    @CurrentOrg() org: any,
    @Body() body: { provider: string; externalRefId: string },
  ) {
    const ref = await this.prisma.connectionRef.create({
      data: {
        orgId: org.id,
        provider: body.provider,
        externalRefId: body.externalRefId,
      },
    });

    await this.nats.publish(SUBJECTS.CONNECTION_REF_CREATED, {
      orgId: org.id,
      connectionRefId: ref.id,
      provider: ref.provider,
      externalRefId: ref.externalRefId,
      status: ref.status,
    });

    return { connectionRefId: ref.id, status: ref.status };
  }

  @Get('connections')
  @UseGuards(ApiKeyGuard)
  async listConnections(@CurrentOrg() org: any) {
    return this.prisma.connectionRef.findMany({
      where: { orgId: org.id },
    });
  }

  @Get('connections/:refId')
  @UseGuards(ApiKeyGuard)
  async getConnection(@CurrentOrg() org: any, @Param('refId') refId: string) {
    return this.prisma.connectionRef.findFirst({
      where: { id: refId, orgId: org.id },
    });
  }

  @Patch('connections/:refId/ready')
  @UseGuards(ApiKeyGuard)
  async markReady(@CurrentOrg() org: any, @Param('refId') refId: string) {
    const ref = await this.prisma.connectionRef.update({
      where: { id: refId },
      data: { status: 'READY' },
    });

    await this.nats.publish(SUBJECTS.CONNECTION_REF_READY, {
      orgId: org.id,
      connectionRefId: ref.id,
      provider: ref.provider,
    });

    return ref;
  }
}
