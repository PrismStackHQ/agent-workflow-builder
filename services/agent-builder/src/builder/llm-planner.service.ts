import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@agent-workflow/prisma-client';
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import type { ParsedIntent } from '@agent-workflow/shared-types';

/**
 * Build the system prompt with pre-loaded action catalog.
 * The catalog is dynamically injected so the LLM knows exactly which actions
 * and param names are available — no discovery round-trips needed.
 */
function buildSystemPrompt(actionCatalog: string): string {
  return `You are a workflow planner that creates structured, multi-step execution plans from natural language commands.

You have a pre-loaded catalog of available actions below. Your job is to decompose the user's request into granular, single-responsibility steps with proper data flow between them.

## Planning Methodology

Break every task into granular, single-responsibility steps following this 4-stage pattern:

### Stage 1: DISCOVER — Find/search for the data
Use SEARCH or LIST actions to locate items. These return IDs or summaries, NOT full content.
CRITICAL: search_emails returns ONLY message IDs [{id, threadId}], NOT email content.

### Stage 2: ENRICH — Get full details
Use GET actions to fetch complete data for items found in Stage 1.
MANDATORY: After search_emails, you MUST add a get_email step to fetch full content (subject, body, from, to, attachments).
Never skip this stage — search results are IDs that need enrichment before use.

### Stage 3: PREPARE — Set up the destination
Create folders, channels, or other containers needed for the output.

### Stage 4: OUTPUT — Write/send/upload the results
Upload files, send messages, create records using enriched data from previous stages.

### Key Rules for Multi-Step Plans
- NEVER skip the ENRICH stage. Search results are IDs, not content.
- Each step does ONE thing. Don't combine search + create in one step.
- ALWAYS wire data flow: later steps MUST reference earlier steps using {{step[N].result}} syntax.
- Minimum 3 steps for any cross-connector workflow.
- Minimum 4 steps when searching emails and saving to another service (search → get details → prepare destination → output).

## Available Actions Catalog
${actionCatalog}

## Data Flow Between Steps
When a later step needs output from an earlier step, use expression syntax in param values:
- {{step[0].result}} — entire result object/array from step 0
- {{step[0].result.id}} — specific field from step 0's result
- {{step[0].result[0].id}} — first item's id field (when result is an array)
- {{step[0].result | filter(type=invoice)}} — filter array items by field value
- {{step[0].result | map(id)}} — extract a single field from each array item
- {{step[0].result | first}} — first item from an array
- {{step[0].result | last}} — last item from an array
- {{step[0].result | count}} — count of items in an array
- "Invoice: {{step[0].result.subject}}" — string interpolation (embed in larger strings)

Pipes can be chained: {{step[0].result | filter(type=email) | map(id) | first}}

## Process
1. IDENTIFY which connectors the user needs from the catalog
2. EXTRACT entities: search terms, folder names, file names, recipients, labels, etc.
3. SELECT the correct action for each operation — ONLY use action names from the catalog
4. COMPOSE steps following the 4-stage methodology (DISCOVER → ENRICH → PREPARE → OUTPUT)
5. WIRE data flow between steps using {{step[N].result}} expressions
6. Call check_connection for each required connector to verify the user has it connected
7. Call submit_plan EXACTLY ONCE with the final structured plan

## Rules
- ONLY use action names that appear in the catalog above — never invent action names
- Use EXACT field names from each action's inputSchema for params
- EVERY step MUST include a "params" object — use {} if no parameters are needed
- Order steps logically following the 4-stage methodology
- Default triggerType to "manual" unless the user explicitly mentions a schedule (e.g. "every day", "daily", "weekly")
- For each step, provide a human-readable description of what it does
- Generate a concise workflow name (max 50 chars)

## Examples

### Example 1: "Search Gmail for receipts and save to a Drive folder"
→ Step 0: search_emails on gmail, params: { query: "receipts" }
  Description: "Search Gmail for emails matching 'receipts'"
→ Step 1: get_email on gmail, params: { messageId: "{{step[0].result[0].id}}" }
  Description: "Get full details of the first matching email"
→ Step 2: create_folder on google-drive, params: { folderName: "Receipts" }
  Description: "Create a 'Receipts' folder in Google Drive"
→ Step 3: upload_file on google-drive, params: { fileName: "{{step[1].result.subject}}", folderId: "{{step[2].result.id}}", content: "{{step[1].result.snippet}}" }
  Description: "Save the email content to the new Drive folder"

### Example 2: "Find issues labeled bug on GitHub and post a summary to Slack"
→ Step 0: search_issues on github, params: { query: "label:bug is:open" }
  Description: "Search GitHub for open issues labeled 'bug'"
→ Step 1: list_channels on slack, params: { limit: 10 }
  Description: "List available Slack channels"
→ Step 2: post_message on slack, params: { channel: "general", text: "Found {{step[0].result | count}} open bugs" }
  Description: "Post bug summary to Slack"

### Example 3: "Find emails about invoices from gmail and save them to a new folder in drive"
→ Step 0: search_emails on gmail, params: { query: "invoices" }
  Description: "Search Gmail for emails about invoices"
→ Step 1: get_email on gmail, params: { messageId: "{{step[0].result[0].id}}" }
  Description: "Get full content of the first invoice email"
→ Step 2: create_folder on google-drive, params: { folderName: "Invoices" }
  Description: "Create an 'Invoices' folder in Google Drive"
→ Step 3: upload_file on google-drive, params: { fileName: "{{step[1].result.subject}}", folderId: "{{step[2].result.id}}", content: "From: {{step[1].result.from}} — {{step[1].result.snippet}}" }
  Description: "Save the email data to the new Drive folder"`;
}

@Injectable()
export class LlmPlannerService {
  private readonly logger = new Logger(LlmPlannerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get the AI model based on environment configuration.
   * Supports OpenAI (default) and Anthropic via the Vercel AI SDK.
   */
  private getModel() {
    const provider = process.env.PLANNER_LLM_PROVIDER || 'openai';
    const modelName = process.env.PLANNER_LLM_MODEL;

    if (provider === 'anthropic') {
      try {
        // Dynamic import to avoid hard dependency when not using Anthropic
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { anthropic } = require('@ai-sdk/anthropic');
        return anthropic(modelName || 'claude-sonnet-4-20250514');
      } catch {
        this.logger.warn('Failed to load @ai-sdk/anthropic, falling back to OpenAI');
        return openai(modelName || 'gpt-4o');
      }
    }

    return openai(modelName || 'gpt-4o');
  }

  /**
   * Build a formatted action catalog from the tool registry and proxy registry.
   * Groups actions by connector with their inputSchema for schema-grounded planning.
   */
  private async buildActionCatalog(workspaceId: string): Promise<string> {
    const [tools, availableIntegrations] = await Promise.all([
      this.prisma.toolRegistryEntry.findMany({
        where: { workspaceId },
        select: {
          integrationKey: true,
          actionName: true,
          displayName: true,
          description: true,
          inputSchema: true,
          outputSchema: true,
        },
      }),
      this.prisma.availableIntegration.findMany({
        where: { workspaceId },
        select: { providerKey: true, displayName: true },
      }),
    ]);

    if (tools.length === 0) {
      return '(No actions available — the workspace has no registered integrations)';
    }

    // Build a displayName lookup from AvailableIntegration (e.g., "google-mail" → "Gmail")
    const integrationDisplayNames = new Map<string, string>();
    for (const ai of availableIntegrations) {
      integrationDisplayNames.set(ai.providerKey, ai.displayName);
    }

    // Group by integrationKey (which is now the Nango provider key after syncProxyTools fix)
    const byConnector = new Map<string, typeof tools>();
    for (const t of tools) {
      const list = byConnector.get(t.integrationKey) || [];
      list.push(t);
      byConnector.set(t.integrationKey, list);
    }

    const sections: string[] = [];
    for (const [connector, actions] of byConnector) {
      const displayName = integrationDisplayNames.get(connector) || connector;
      const lines = actions.map((a) => {
        const schema = a.inputSchema
          ? `\n    inputSchema: ${JSON.stringify(a.inputSchema)}`
          : '';
        const output = a.outputSchema
          ? `\n    outputSchema: ${JSON.stringify(a.outputSchema)}`
          : '';
        return `  - ${a.actionName} (${a.displayName}): ${a.description || 'No description'}${schema}${output}`;
      });
      // Use connector key as the identifier, with display name for clarity
      // e.g., "### google-mail (Gmail)" — LLM uses "google-mail" as the connector value
      sections.push(`### ${connector} (${displayName})\nConnector key to use in steps: "${connector}"\n${lines.join('\n')}`);
    }

    return sections.join('\n\n');
  }

  async plan(
    workspaceId: string,
    command: string,
    endUserId?: string,
  ): Promise<ParsedIntent> {
    this.logger.log(`Planning command for workspace ${workspaceId}: "${command}"`);

    const actionCatalog = await this.buildActionCatalog(workspaceId);
    const systemPrompt = buildSystemPrompt(actionCatalog);

    const model = this.getModel();

    const result = await generateText({
      model,
      system: systemPrompt,
      prompt: command,
      tools: {
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
              .max(50)
              .describe('A concise descriptive name for the workflow'),
            triggerType: z.enum(['cron', 'manual']),
            schedule: z
              .string()
              .optional()
              .describe('Cron expression if triggerType is "cron"'),
            steps: z.array(
              z.object({
                action: z.string().describe('The action name from the catalog'),
                connector: z
                  .string()
                  .describe('The integration key for this action'),
                params: z
                  .record(z.unknown())
                  .default({})
                  .describe('REQUIRED: Parameters matching the action inputSchema. Always include params even if empty {}. Use {{step[N].result}} syntax for data flow.'),
                description: z
                  .string()
                  .describe('Human-readable description of what this step does'),
              }),
            ),
            extractedEntities: z
              .record(z.string())
              .optional()
              .describe('Key entities extracted from the command: { searchTerm, folderName, ... }'),
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
      // Debug: log what the LLM actually returned
      const allToolCalls = result.steps.flatMap((step) => step.toolCalls);
      this.logger.warn(`LLM returned ${result.steps.length} steps, ${allToolCalls.length} tool calls: ${allToolCalls.map((c) => c.toolName).join(', ')}`);
      this.logger.warn(`LLM text response: ${result.text?.substring(0, 500) || '(no text)'}`);
      throw new Error('LLM planner did not produce a plan (no submit_plan call)');
    }

    const plan = submitCall.args as {
      name: string;
      triggerType: 'cron' | 'manual';
      schedule?: string;
      steps: Array<{
        action: string;
        connector: string;
        params: Record<string, unknown>;
        description?: string;
      }>;
      extractedEntities?: Record<string, string>;
    };

    // Post-validate: verify each step.action exists in tool registry or proxy registry
    for (const step of plan.steps) {
      const exists = await this.prisma.toolRegistryEntry.findFirst({
        where: { workspaceId, actionName: step.action },
      });
      if (!exists) {
        this.logger.warn(
          `LLM planner produced action "${step.action}" not in tool registry — may be a proxy-only action`,
        );
      }
    }

    if (plan.extractedEntities) {
      this.logger.log(`Extracted entities: ${JSON.stringify(plan.extractedEntities)}`);
    }

    // Extract unique connectors from steps
    const connectors = [...new Set(plan.steps.map((s) => s.connector))];

    const intent: ParsedIntent = {
      trigger: {
        type: plan.triggerType,
        schedule: plan.schedule,
      },
      connectors,
      steps: plan.steps.map((step, index) => ({
        index,
        action: step.action,
        connector: step.connector,
        params: step.params,
        description: step.description,
      })),
    };

    this.logger.log(
      `LLM planner produced plan: ${plan.name} with ${plan.steps.length} steps`,
    );

    return intent;
  }
}
