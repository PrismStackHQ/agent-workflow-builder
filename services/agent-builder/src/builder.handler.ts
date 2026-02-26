import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { NatsService } from '@agent-workflow/nats-client';
import { PrismaService } from '@agent-workflow/prisma-client';
import { SUBJECTS } from '@agent-workflow/shared-types';
import type {
  AgentCommandSubmittedEvent,
  ConnectionOAuthCompletedEvent,
} from '@agent-workflow/shared-types';
import { NlParserService } from './builder/nl-parser.service';
import { AgentAssemblerService } from './builder/agent-assembler.service';

@Injectable()
export class BuilderHandler implements OnModuleInit {
  private readonly logger = new Logger(BuilderHandler.name);

  constructor(
    private readonly nats: NatsService,
    private readonly prisma: PrismaService,
    private readonly nlParser: NlParserService,
    private readonly assembler: AgentAssemblerService,
  ) {}

  async onModuleInit() {
    // Handle incoming NL commands
    await this.nats.subscribe<AgentCommandSubmittedEvent>(
      SUBJECTS.AGENT_COMMAND_SUBMITTED,
      'agent-builder-command-submitted',
      async (data) => {
        this.logger.log(`Processing command ${data.commandId} for org ${data.orgId}`);

        try {
          const intent = this.nlParser.parse(data.naturalLanguageCommand);
          await this.assembler.assembleAgent(
            data.orgId,
            data.commandId,
            data.naturalLanguageCommand,
            intent,
          );
        } catch (err) {
          this.logger.error(`Failed to process command: ${err}`);
        }
      },
    );

    // Handle OAuth completion — check if agents can proceed
    await this.nats.subscribe<ConnectionOAuthCompletedEvent>(
      SUBJECTS.CONNECTION_OAUTH_COMPLETED,
      'agent-builder-oauth-completed',
      async (data) => {
        this.logger.log(`OAuth completed for org ${data.orgId}, provider ${data.provider}`);

        // Update connection ref status
        if (data.connectionRefId) {
          await this.prisma.connectionRef.update({
            where: { id: data.connectionRefId },
            data: { status: 'READY' },
          });
        }

        // Check if any waiting agents can now proceed
        const waitingAgents = await this.prisma.agentDefinition.findMany({
          where: { orgId: data.orgId, status: 'WAITING_CONNECTIONS' },
        });

        for (const agent of waitingAgents) {
          const required = agent.requiredConnections as string[];
          const ready = await this.prisma.connectionRef.findMany({
            where: { orgId: data.orgId, provider: { in: required }, status: 'READY' },
          });

          const readyProviders = new Set(ready.map((r) => r.provider));
          const allReady = required.every((p) => readyProviders.has(p));

          if (allReady) {
            await this.prisma.agentDefinition.update({
              where: { id: agent.id },
              data: { status: 'READY' },
            });

            await this.nats.publish(SUBJECTS.AGENT_DEFINITION_READY, {
              orgId: data.orgId,
              agentId: agent.id,
            });

            this.logger.log(`Agent ${agent.id} is now READY`);
          }
        }
      },
    );

    this.logger.log('Agent builder handler initialized');
  }
}
