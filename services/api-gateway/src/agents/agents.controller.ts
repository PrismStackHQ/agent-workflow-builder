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
import { ApiKeyGuard, CurrentWorkspace } from '@agent-workflow/auth';
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
    @CurrentWorkspace() workspace: any,
    @Body() body: { naturalLanguageCommand: string; endUserId?: string },
  ) {
    const commandId = randomUUID();

    await this.nats.publish(SUBJECTS.AGENT_COMMAND_SUBMITTED, {
      orgId: workspace.orgId,
      workspaceId: workspace.id,
      commandId,
      naturalLanguageCommand: body.naturalLanguageCommand,
      endUserId: body.endUserId,
    });

    return { commandId, status: 'processing' };
  }

  @Post()
  @UseGuards(ApiKeyGuard)
  async createAgent(
    @CurrentWorkspace() workspace: any,
    @Body() body: {
      name: string;
      triggerType: string;
      scheduleCron?: string;
      steps: { index: number; action: string; connector: string; params: Record<string, unknown> }[];
    },
  ) {
    const agent = await this.prisma.agentDefinition.create({
      data: {
        workspaceId: workspace.id,
        name: body.name,
        naturalLanguageCommand: `[SDK] ${body.name}`,
        triggerType: body.triggerType,
        scheduleCron: body.scheduleCron || null,
        steps: body.steps as any,
        requiredConnections: [...new Set(body.steps.map((s) => s.connector))] as any,
        status: 'READY',
      },
    });

    await this.nats.publish(SUBJECTS.AGENT_DEFINITION_CREATED, {
      orgId: workspace.orgId,
      workspaceId: workspace.id,
      agentId: agent.id,
      name: agent.name,
      scheduleCron: agent.scheduleCron,
      requiredConnections: JSON.parse(JSON.stringify(agent.requiredConnections)),
      steps: JSON.parse(JSON.stringify(agent.steps)),
      status: agent.status,
    });

    return agent;
  }

  @Get()
  @UseGuards(ApiKeyGuard)
  async listAgents(@CurrentWorkspace() workspace: any) {
    return this.prisma.agentDefinition.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get(':agentId')
  @UseGuards(ApiKeyGuard)
  async getAgent(@CurrentWorkspace() workspace: any, @Param('agentId') agentId: string) {
    const agent = await this.prisma.agentDefinition.findFirst({
      where: { id: agentId, workspaceId: workspace.id },
    });
    if (!agent) throw new NotFoundException('Agent not found');
    return agent;
  }

  @Get(':agentId/runs')
  @UseGuards(ApiKeyGuard)
  async listRuns(@CurrentWorkspace() workspace: any, @Param('agentId') agentId: string) {
    return this.prisma.agentRun.findMany({
      where: { agent: { id: agentId, workspaceId: workspace.id } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get(':agentId/runs/:runId')
  @UseGuards(ApiKeyGuard)
  async getRun(
    @CurrentWorkspace() workspace: any,
    @Param('agentId') agentId: string,
    @Param('runId') runId: string,
  ) {
    const run = await this.prisma.agentRun.findFirst({
      where: { id: runId, agent: { id: agentId, workspaceId: workspace.id } },
    });
    if (!run) throw new NotFoundException('Run not found');
    return run;
  }

  @Post(':agentId/runs')
  @UseGuards(ApiKeyGuard)
  async triggerRun(
    @CurrentWorkspace() workspace: any,
    @Param('agentId') agentId: string,
    @Body() body: { endUserConnectionId?: string },
  ) {
    const agent = await this.prisma.agentDefinition.findFirst({
      where: { id: agentId, workspaceId: workspace.id },
    });
    if (!agent) throw new NotFoundException('Agent not found');

    const run = await this.prisma.agentRun.create({
      data: {
        agentId: agent.id,
        status: 'PENDING',
        endUserConnectionId: body.endUserConnectionId || null,
      },
    });

    await this.nats.publish(SUBJECTS.SCHEDULER_RUN_TRIGGERED, {
      orgId: workspace.orgId,
      workspaceId: workspace.id,
      agentId: agent.id,
      runId: run.id,
      endUserConnectionId: body.endUserConnectionId,
    });

    return { runId: run.id, status: 'running' };
  }

  @Post(':agentId/runs/:runId/resume')
  @UseGuards(ApiKeyGuard)
  async resumeRun(
    @CurrentWorkspace() workspace: any,
    @Param('agentId') agentId: string,
    @Param('runId') runId: string,
    @Body() body: { connectionId: string },
  ) {
    const run = await this.prisma.agentRun.findFirst({
      where: { id: runId, agent: { id: agentId, workspaceId: workspace.id }, status: 'PAUSED' },
    });
    if (!run) throw new NotFoundException('Paused run not found');

    await this.nats.publish(SUBJECTS.RUNTIME_RUN_RESUME_REQUESTED, {
      orgId: workspace.orgId,
      workspaceId: workspace.id,
      runId,
      connectionId: body.connectionId,
    });

    return { ok: true, runId, status: 'resuming' };
  }

  @Delete(':agentId')
  @UseGuards(ApiKeyGuard)
  async deleteAgent(@CurrentWorkspace() workspace: any, @Param('agentId') agentId: string) {
    await this.prisma.agentRun.deleteMany({ where: { agentId } });
    await this.prisma.agentDefinition.delete({
      where: { id: agentId },
    });
    return { ok: true };
  }
}
