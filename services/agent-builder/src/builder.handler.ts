import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { NatsService } from '@agent-workflow/nats-client';
import { PrismaService } from '@agent-workflow/prisma-client';
import { SUBJECTS } from '@agent-workflow/shared-types';
import type {
  AgentCommandSubmittedEvent,
  ConnectionOAuthCompletedEvent,
  ConnectionCompletedEvent,
} from '@agent-workflow/shared-types';
import { NlParserService } from './builder/nl-parser.service';
import { AgentAssemblerService } from './builder/agent-assembler.service';
import { LlmPlannerService } from './builder/llm-planner.service';

@Injectable()
export class BuilderHandler implements OnModuleInit {
  private readonly logger = new Logger(BuilderHandler.name);

  constructor(
    private readonly nats: NatsService,
    private readonly prisma: PrismaService,
    private readonly nlParser: NlParserService,
    private readonly assembler: AgentAssemblerService,
    private readonly llmPlanner: LlmPlannerService,
  ) {}

  async onModuleInit() {
    await this.nats.subscribe<AgentCommandSubmittedEvent>(
      SUBJECTS.AGENT_COMMAND_SUBMITTED,
      'agent-builder-command-submitted',
      async (data) => {
        this.logger.log(`Processing command ${data.commandId} for workspace ${data.workspaceId}`);

        try {
          let intent;
          try {
            if (process.env.OPENAI_API_KEY) {
              intent = await this.llmPlanner.plan(
                data.workspaceId,
                data.naturalLanguageCommand,
                data.endUserId,
              );
            } else {
              intent = await this.nlParser.parse(data.naturalLanguageCommand, data.workspaceId);
            }
          } catch (planErr) {
            this.logger.warn(`LLM planner failed, falling back to regex: ${planErr}`);
            intent = await this.nlParser.parse(data.naturalLanguageCommand, data.workspaceId);
          }

          await this.assembler.assembleAgent(
            data.orgId,
            data.workspaceId,
            data.commandId,
            data.naturalLanguageCommand,
            intent,
            data.endUserId,
          );
        } catch (err) {
          this.logger.error(`Failed to process command: ${err}`);
        }
      },
    );

    await this.nats.subscribe<ConnectionOAuthCompletedEvent>(
      SUBJECTS.CONNECTION_OAUTH_COMPLETED,
      'agent-builder-oauth-completed',
      async (data) => {
        this.logger.log(`OAuth completed for workspace ${data.workspaceId}, provider ${data.provider}`);

        if (data.connectionRefId) {
          await this.prisma.connectionRef.update({
            where: { id: data.connectionRefId },
            data: { status: 'READY' },
          });
        }

        await this.checkWaitingAgents(data.orgId, data.workspaceId);
      },
    );

    // Also listen for CONNECTION_COMPLETED (from REST API POST /connections/complete)
    // This is the path used when the chat-app registers a Nango OAuth completion directly
    await this.nats.subscribe<ConnectionCompletedEvent>(
      SUBJECTS.CONNECTION_COMPLETED,
      'agent-builder-connection-completed',
      async (data) => {
        this.logger.log(`Connection completed for workspace ${data.workspaceId}, provider ${data.integrationKey}, endUser ${data.endUserId}`);
        await this.checkWaitingAgents(data.orgId, data.workspaceId);
      },
    );

    this.logger.log('Agent builder handler initialized');
  }

  private async checkWaitingAgents(orgId: string, workspaceId: string) {
    const waitingAgents = await this.prisma.agentDefinition.findMany({
      where: { workspaceId, status: 'WAITING_CONNECTIONS' },
    });

    for (const agent of waitingAgents) {
      const required = agent.requiredConnections as string[];
      const connectionWhere: Record<string, unknown> = {
        workspaceId,
        provider: { in: required },
        status: 'READY',
      };
      if (agent.endUserId) {
        connectionWhere.externalRefId = agent.endUserId;
      }
      const ready = await this.prisma.connectionRef.findMany({
        where: connectionWhere,
      });

      const readyProviders = new Set(ready.map((r) => r.provider));
      const allReady = required.every((p) => readyProviders.has(p));

      if (allReady) {
        await this.prisma.agentDefinition.update({
          where: { id: agent.id },
          data: { status: 'READY' },
        });

        await this.nats.publish(SUBJECTS.AGENT_DEFINITION_READY, {
          orgId,
          workspaceId,
          agentId: agent.id,
        });

        this.logger.log(`Agent ${agent.id} is now READY`);
      }
    }
  }
}
