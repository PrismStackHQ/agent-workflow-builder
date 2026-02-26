import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@agent-workflow/prisma-client';
import { NatsService } from '@agent-workflow/nats-client';
import { SUBJECTS } from '@agent-workflow/shared-types';
import type { ParsedIntent } from '@agent-workflow/shared-types';

@Injectable()
export class AgentAssemblerService {
  private readonly logger = new Logger(AgentAssemblerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nats: NatsService,
  ) {}

  async assembleAgent(
    orgId: string,
    commandId: string,
    command: string,
    intent: ParsedIntent,
  ) {
    // Check which connections are already ready
    const readyConnections = await this.prisma.connectionRef.findMany({
      where: { orgId, provider: { in: intent.connectors }, status: 'READY' },
    });
    const readyProviders = new Set(readyConnections.map((c) => c.provider));
    const missingProviders = intent.connectors.filter((c) => !readyProviders.has(c));

    // Generate a name from the command
    const name = command.length > 50 ? command.substring(0, 47) + '...' : command;

    const status = missingProviders.length > 0 ? 'WAITING_CONNECTIONS' : 'READY';

    // Create the agent definition
    const agent = await this.prisma.agentDefinition.create({
      data: {
        orgId,
        name,
        naturalLanguageCommand: command,
        scheduleCron: intent.trigger.schedule || null,
        triggerType: intent.trigger.type,
        requiredConnections: intent.connectors,
        steps: intent.steps as any,
        status,
      },
    });

    this.logger.log(`Agent ${agent.id} created with status ${status}`);

    // Emit agent created event
    await this.nats.publish(SUBJECTS.AGENT_DEFINITION_CREATED, {
      orgId,
      agentId: agent.id,
      name: agent.name,
      scheduleCron: agent.scheduleCron,
      requiredConnections: intent.connectors,
      steps: intent.steps,
      status: agent.status,
    });

    // If connections are missing, emit oauth required events
    if (missingProviders.length > 0) {
      for (const provider of missingProviders) {
        await this.nats.publish(SUBJECTS.CONNECTION_OAUTH_REQUIRED, {
          orgId,
          agentDraftId: agent.id,
          provider,
        });
        this.logger.log(`OAuth required for provider: ${provider}`);
      }
    } else {
      // All connections ready, emit ready event
      await this.nats.publish(SUBJECTS.AGENT_DEFINITION_READY, {
        orgId,
        agentId: agent.id,
      });
    }

    return agent;
  }
}
