import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@agent-workflow/prisma-client';
import { NatsService } from '@agent-workflow/nats-client';
import { ApiKeyGuard, CurrentOrg } from '@agent-workflow/auth';
import { SUBJECTS } from '@agent-workflow/shared-types';

@Controller('agents')
export class AgentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nats: NatsService,
  ) {}

  @Post('command')
  @UseGuards(ApiKeyGuard)
  async submitCommand(
    @CurrentOrg() org: any,
    @Body() body: { naturalLanguageCommand: string },
  ) {
    const commandId = randomUUID();

    await this.nats.publish(SUBJECTS.AGENT_COMMAND_SUBMITTED, {
      orgId: org.id,
      commandId,
      naturalLanguageCommand: body.naturalLanguageCommand,
    });

    return { commandId, status: 'processing' };
  }

  @Get()
  @UseGuards(ApiKeyGuard)
  async listAgents(@CurrentOrg() org: any) {
    return this.prisma.agentDefinition.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get(':agentId')
  @UseGuards(ApiKeyGuard)
  async getAgent(@CurrentOrg() org: any, @Param('agentId') agentId: string) {
    const agent = await this.prisma.agentDefinition.findFirst({
      where: { id: agentId, orgId: org.id },
    });
    if (!agent) throw new NotFoundException('Agent not found');
    return agent;
  }

  @Get(':agentId/runs')
  @UseGuards(ApiKeyGuard)
  async listRuns(@CurrentOrg() org: any, @Param('agentId') agentId: string) {
    return this.prisma.agentRun.findMany({
      where: { agent: { id: agentId, orgId: org.id } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get(':agentId/runs/:runId')
  @UseGuards(ApiKeyGuard)
  async getRun(
    @CurrentOrg() org: any,
    @Param('agentId') agentId: string,
    @Param('runId') runId: string,
  ) {
    const run = await this.prisma.agentRun.findFirst({
      where: { id: runId, agent: { id: agentId, orgId: org.id } },
    });
    if (!run) throw new NotFoundException('Run not found');
    return run;
  }

  @Delete(':agentId')
  @UseGuards(ApiKeyGuard)
  async deleteAgent(@CurrentOrg() org: any, @Param('agentId') agentId: string) {
    await this.prisma.agentRun.deleteMany({ where: { agentId } });
    await this.prisma.agentDefinition.delete({
      where: { id: agentId },
    });
    return { ok: true };
  }
}
