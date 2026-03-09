import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { NatsService } from '@agent-workflow/nats-client';
import { PrismaService } from '@agent-workflow/prisma-client';
import { SUBJECTS } from '@agent-workflow/shared-types';
import type {
  AgentCommandSubmittedEvent,
  AgentPlanConfirmedEvent,
  ConnectionInfo,
  ParsedIntent,
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
    // Step 1: When a command is submitted, parse it and publish a plan preview
    await this.nats.subscribe<AgentCommandSubmittedEvent>(
      SUBJECTS.AGENT_COMMAND_SUBMITTED,
      'agent-builder-command-submitted',
      async (data) => {
        this.logger.log(`Processing command ${data.commandId} for workspace ${data.workspaceId}`);

        try {
          let intent: ParsedIntent;
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

          // Check which connections are missing
          const connectionWhere: Record<string, unknown> = {
            workspaceId: data.workspaceId,
            provider: { in: intent.connectors },
            status: 'READY',
          };
          if (data.endUserId) {
            connectionWhere.externalRefId = data.endUserId;
          }

          const [readyConnections, availableIntegrations] = await Promise.all([
            this.prisma.connectionRef.findMany({ where: connectionWhere }),
            this.prisma.availableIntegration.findMany({
              where: { workspaceId: data.workspaceId },
              select: { providerKey: true, displayName: true, logoUrl: true },
            }),
          ]);
          const readyProviders = new Set(readyConnections.map((c) => c.provider));
          const missingProviderKeys = intent.connectors.filter((c) => !readyProviders.has(c));

          // Enrich missing connections with displayName and logoUrl from AvailableIntegration
          const integrationLookup = new Map(
            availableIntegrations.map((ai) => [ai.providerKey, ai]),
          );
          const missingConnections: ConnectionInfo[] = missingProviderKeys.map((key) => {
            const ai = integrationLookup.get(key);
            return {
              providerKey: key,
              displayName: ai?.displayName || key,
              logoUrl: ai?.logoUrl || undefined,
            };
          });

          // Build display name map for ALL connectors (not just missing ones)
          const connectorDisplayNames: Record<string, string> = {};
          for (const key of intent.connectors) {
            const ai = integrationLookup.get(key);
            connectorDisplayNames[key] = ai?.displayName || key;
          }

          const name =
            data.naturalLanguageCommand.length > 50
              ? data.naturalLanguageCommand.substring(0, 47) + '...'
              : data.naturalLanguageCommand;

          this.logger.log(`Parsed intent: trigger=${JSON.stringify(intent.trigger)}, connectors=${JSON.stringify(intent.connectors)}`);
          for (const step of intent.steps) {
            this.logger.log(`  Step ${step.index}: action="${step.action}" connector="${step.connector}" params=${JSON.stringify(step.params)} desc="${step.description || ''}"`);
          }

          // Publish plan preview — don't create agent yet
          await this.nats.publish(SUBJECTS.AGENT_PLAN_PREVIEW, {
            orgId: data.orgId,
            workspaceId: data.workspaceId,
            commandId: data.commandId,
            name,
            naturalLanguageCommand: data.naturalLanguageCommand,
            triggerType: intent.trigger.type,
            schedule: intent.trigger.schedule,
            connectors: intent.connectors,
            steps: intent.steps,
            missingConnections,
            connectorDisplayNames,
            instructions: intent.instructions,
            endUserId: data.endUserId,
          });

          this.logger.log(
            `Plan preview published for command ${data.commandId}: ${intent.steps.length} steps, ${missingConnections.length} missing connections`,
          );
        } catch (err) {
          this.logger.error(`Failed to process command: ${err}`);
        }
      },
    );

    // Step 2: When user confirms the plan, create the agent and trigger first run
    await this.nats.subscribe<AgentPlanConfirmedEvent>(
      SUBJECTS.AGENT_PLAN_CONFIRMED,
      'agent-builder-plan-confirmed',
      async (data) => {
        this.logger.log(`Plan confirmed for command ${data.commandId} in workspace ${data.workspaceId}`);
        this.logger.log(`Confirmed plan: triggerType="${data.triggerType}" connectors=${JSON.stringify(data.connectors)}`);
        for (const step of data.steps) {
          this.logger.log(`  Confirmed step ${step.index}: action="${step.action}" connector="${step.connector}" params=${JSON.stringify(step.params)}`);
        }

        try {
          const intent: ParsedIntent = {
            trigger: {
              type: data.triggerType as 'cron' | 'event' | 'manual',
              schedule: data.schedule,
            },
            connectors: data.connectors,
            steps: data.steps,
            instructions: data.instructions,
          };

          const agent = await this.assembler.assembleAgent(
            data.orgId,
            data.workspaceId,
            data.commandId,
            data.naturalLanguageCommand,
            intent,
            data.endUserId,
          );

          // Trigger an immediate first run
          const { randomUUID } = await import('crypto');
          const runId = randomUUID();

          this.logger.log(`Triggering first run ${runId} for agent ${agent.id}`);

          await this.nats.publish(SUBJECTS.SCHEDULER_RUN_TRIGGERED, {
            orgId: data.orgId,
            workspaceId: data.workspaceId,
            agentId: agent.id,
            runId,
            endUserConnectionId: data.endUserId,
          });
        } catch (err) {
          this.logger.error(`Failed to create agent after confirmation: ${err}`);
        }
      },
    );

    this.logger.log('Agent builder handler initialized');
  }
}
