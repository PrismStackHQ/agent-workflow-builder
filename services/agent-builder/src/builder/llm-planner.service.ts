import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@agent-workflow/prisma-client';
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import type { ParsedIntent } from '@agent-workflow/shared-types';

const SYSTEM_PROMPT = `You are a workflow planner that creates execution plans from natural language commands.

You have access to tools to discover available integrations and their actions. Follow this process:

1. ALWAYS call list_integrations first to see what connectors are available
2. For each connector the user mentions, call search_tools to find available actions
3. Call get_tool_details for actions you want to use, to understand their input/output schemas
4. Call check_connection for each required connector to verify the end user has it connected
5. Call submit_plan EXACTLY ONCE with the final structured plan

Rules:
- Only use action names that were returned by search_tools — never invent action names
- Match user intent to the most appropriate actions available
- If the user mentions a schedule (e.g. "every morning", "daily at 8am"), set triggerType to "cron" and provide a cron expression
- If no schedule is mentioned, default triggerType to "manual"
- Generate a concise, descriptive workflow name (max 50 chars)
- Order steps logically — data should flow from source to destination
- Use the input schema from get_tool_details to populate params correctly`;

@Injectable()
export class LlmPlannerService {
  private readonly logger = new Logger(LlmPlannerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async plan(
    workspaceId: string,
    command: string,
    endUserId?: string,
  ): Promise<ParsedIntent> {
    this.logger.log(`Planning command for workspace ${workspaceId}: "${command}"`);

    const result = await generateText({
      model: openai('gpt-4o'),
      system: SYSTEM_PROMPT,
      prompt: command,
      tools: {
        list_integrations: tool({
          description:
            'List all available integration connectors for this workspace',
          parameters: z.object({}),
          execute: async () => {
            const entries = await this.prisma.toolRegistryEntry.findMany({
              where: { workspaceId },
              select: { integrationKey: true },
              distinct: ['integrationKey'],
            });
            return entries.map((e) => e.integrationKey);
          },
        }),

        search_tools: tool({
          description:
            'List all available actions for a specific integration connector',
          parameters: z.object({
            integrationKey: z
              .string()
              .describe('The integration connector key (e.g. "google-mail")'),
          }),
          execute: async ({ integrationKey }) => {
            const tools = await this.prisma.toolRegistryEntry.findMany({
              where: { workspaceId, integrationKey },
              select: {
                actionName: true,
                displayName: true,
                description: true,
              },
            });
            return tools;
          },
        }),

        get_tool_details: tool({
          description:
            'Get detailed input/output schema for a specific action',
          parameters: z.object({
            actionName: z
              .string()
              .describe('The action name (e.g. "EMAILS-LIST")'),
          }),
          execute: async ({ actionName }) => {
            const entry = await this.prisma.toolRegistryEntry.findFirst({
              where: { workspaceId, actionName },
              select: {
                actionName: true,
                displayName: true,
                description: true,
                integrationKey: true,
                inputSchema: true,
                outputSchema: true,
              },
            });
            return entry || { error: `Action "${actionName}" not found` };
          },
        }),

        check_connection: tool({
          description:
            'Check if the end user has a connected (READY) connection for a specific integration',
          parameters: z.object({
            integrationKey: z
              .string()
              .describe('The integration connector key to check'),
          }),
          execute: async ({ integrationKey }) => {
            const where: Record<string, unknown> = {
              workspaceId,
              provider: integrationKey,
              status: 'READY',
            };
            if (endUserId) {
              where.externalRefId = endUserId;
            }
            const connection = await this.prisma.connectionRef.findFirst({
              where,
              select: {
                id: true,
                provider: true,
                externalRefId: true,
                connectionId: true,
                status: true,
              },
            });
            return connection
              ? { connected: true, connectionId: connection.connectionId || connection.id }
              : { connected: false };
          },
        }),

        submit_plan: tool({
          description:
            'Submit the final execution plan. Call this exactly once when you have determined the steps.',
          parameters: z.object({
            name: z
              .string()
              .describe('A concise descriptive name for the workflow (max 50 chars)'),
            triggerType: z.enum(['cron', 'manual', 'event']),
            schedule: z
              .string()
              .optional()
              .describe('Cron expression if triggerType is "cron"'),
            steps: z.array(
              z.object({
                action: z.string().describe('The action name from search_tools'),
                connector: z
                  .string()
                  .describe('The integration key for this action'),
                params: z
                  .record(z.unknown())
                  .describe('Parameters for the action based on its input schema'),
              }),
            ),
          }),
        }),
      },
      maxSteps: 8,
    });

    // Extract the submit_plan tool call from the result
    const submitCall = result.steps
      .flatMap((step) => step.toolCalls)
      .find((call) => call.toolName === 'submit_plan');

    if (!submitCall) {
      throw new Error('LLM planner did not produce a plan (no submit_plan call)');
    }

    const plan = submitCall.args as {
      name: string;
      triggerType: 'cron' | 'manual' | 'event';
      schedule?: string;
      steps: Array<{
        action: string;
        connector: string;
        params: Record<string, unknown>;
      }>;
    };

    // Post-validate: verify each step.action exists in tool registry
    for (const step of plan.steps) {
      const exists = await this.prisma.toolRegistryEntry.findFirst({
        where: { workspaceId, actionName: step.action },
      });
      if (!exists) {
        throw new Error(
          `LLM planner produced invalid action: "${step.action}" not found in tool registry`,
        );
      }
    }

    // Extract unique connectors from steps
    const connectors = [...new Set(plan.steps.map((s) => s.connector))];

    const intent: ParsedIntent = {
      trigger: {
        type: plan.triggerType === 'manual' ? 'event' : plan.triggerType,
        schedule: plan.schedule,
      },
      connectors,
      steps: plan.steps.map((step, index) => ({
        index,
        action: step.action,
        connector: step.connector,
        params: step.params,
      })),
    };

    this.logger.log(
      `LLM planner produced plan: ${plan.name} with ${plan.steps.length} steps`,
    );

    return intent;
  }
}
