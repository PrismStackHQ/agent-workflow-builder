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

## Advanced Step Types

### for_each — Iterate Over Items
Use when you need to run operations on EACH item in an array individually.
Trigger words: "for each", "one by one", "individually", "every", "each", "all of them"

Step format:
{
  action: "for_each",
  connector: "",
  params: { items: "{{step[N].result}}", onError: "skip" },
  description: "For each company, create records",
  steps: [
    { action: "...", connector: "...", params: { name: "{{item.fieldName}}" }, description: "..." },
    { action: "...", connector: "...", params: { id: "{{step[0].result.id}}" }, description: "..." }
  ]
}

Inside for_each:
- {{item}} — current array item
- {{item.fieldName}} — field of current item
- {{loop.index}} — current iteration index (0-based)
- {{step[N].result}} — inner step N's result (within this iteration, NOT outer steps)
- {{parent[N].result}} — outer step N's result (from the parent workflow scope)
- {{parent[N].result.field}} — access a field of an outer step result

IMPORTANT: Inside for_each, {{step[N].result}} refers to INNER steps only. To access outer step data, use {{parent[N].result}}. For example, if outer step 1 returns an email with messageId, use {{parent[1].result.id}} inside the loop to reference it.

### llm_transform — AI Data Extraction
Use when unstructured text needs to be converted to structured data.
For example: extracting company names, parsing documents, classifying items, summarizing.

IMPORTANT constraints for llm_transform:
- The prompt MUST only contain TEXT data — never embed base64, binary, or raw file content
- Reference specific text fields (e.g. {{step[0].result.subject}}, {{step[0].result.body}}) rather than entire result objects
- Keep referenced data concise — use | map(fieldName) to extract only the fields needed
- If previous step results are arrays, use | map(relevantField) or | join to extract just the text parts
- NEVER pass raw attachment data, file downloads, or binary content into the prompt

{
  action: "llm_transform",
  connector: "",
  params: {
    prompt: "Extract all records from the following text:\n{{step[0].result.textContent}}",
    outputSchema: {
      type: "object",
      properties: {
        records: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              category: { type: "string" }
            }
          }
        }
      }
    }
  },
  description: "Extract structured records from text"
}

## Process
1. IDENTIFY which connectors the user needs from the catalog
2. EXTRACT entities: search terms, folder names, file names, recipients, labels, etc.
3. SELECT the correct action for each operation — ONLY use action names from the catalog
4. COMPOSE steps following the 4-stage methodology (DISCOVER → ENRICH → PREPARE → OUTPUT)
5. WIRE data flow between steps using {{step[N].result}} expressions
6. Call check_connection for each required connector to verify the user has it connected
7. Call submit_plan EXACTLY ONCE with the final structured plan

CRITICAL: You MUST ALWAYS call submit_plan with the complete plan, even if check_connection returns { connected: false } for one or more connectors. The runtime handles missing connections by prompting the user for OAuth authorization. Never refuse to submit a plan due to missing connections — that is not your responsibility.

## Rules
- ONLY use action names that appear in the catalog above — never invent action names
- Use EXACT field names from each action's inputSchema for params
- EVERY step MUST include a "params" object — use {} if no parameters are needed
- Order steps logically following the 4-stage methodology
- Default triggerType to "manual" unless the user explicitly mentions a schedule (e.g. "every day", "daily", "weekly")
- For each step, provide a human-readable description of what it does
- Generate a concise workflow name (max 50 chars)

## Examples

The examples below use placeholder connector/action names. In practice, use ONLY the connector keys and action names from the catalog above.

### Example 1: Search + Enrich + Save (3-step linear)
→ Step 0: <search_action> on <connector-a>, params: { query: "..." }
  Description: "Search for matching items"
→ Step 1: <get_detail_action> on <connector-a>, params: { id: "{{step[0].result[0].id}}" }
  Description: "Get full details of the first result"
→ Step 2: <save_action> on <connector-b>, params: { name: "{{step[1].result.title}}", content: "{{step[1].result.snippet}}" }
  Description: "Save the item to the destination"

### Example 2: Search + Summarize with pipes
→ Step 0: <list_action> on <connector-a>, params: { query: "label:bug is:open" }
  Description: "List open items matching criteria"
→ Step 1: <post_action> on <connector-b>, params: { channel: "general", text: "Found {{step[0].result | count}} items" }
  Description: "Post summary to the destination"

### Example 3: llm_transform — Extract structured data from text
→ Step 0: <fetch_action> on <connector-a>, params: { id: "..." }
  Description: "Fetch the source document or record"
→ Step 1: llm_transform (local), params: { prompt: "Extract all person records from:\n{{step[0].result.textContent}}", outputSchema: { type: "object", properties: { people: { type: "array", items: { type: "object", properties: { name: { type: "string" }, role: { type: "string" } } } } } } }
  Description: "Extract structured data from text content"

### Example 4: for_each — Process items individually with parent references
→ Step 0: <search_action> on <connector-a>, params: { query: "..." }
  Description: "Find items to process"
→ Step 1: llm_transform (local), params: { prompt: "Categorize these items:\n{{step[0].result | map(title) | join(\\n)}}", outputSchema: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { title: { type: "string" }, category: { type: "string" } } } } } } }
  Description: "Categorize items using AI"
→ Step 2: for_each, params: { items: "{{step[1].result.items}}", onError: "skip" }
  Description: "For each categorized item, create a record"
  Inner steps:
    → 0: <create_action> on <connector-b>, params: { name: "{{item.title}}", category: "{{item.category}}" }
    → 1: <link_action> on <connector-b>, params: { recordId: "{{step[0].result.id}}", sourceId: "{{parent[0].result[0].id}}" }
  Note: {{item}} = current loop item, {{step[N].result}} = inner step result, {{parent[N].result}} = outer step result`;
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

  /**
   * Build a catalog of existing reusable agents in the workspace
   * so the LLM can compose them as sub-agent steps.
   */
  private async buildAgentCatalog(workspaceId: string): Promise<string> {
    const agents = await this.prisma.agentDefinition.findMany({
      where: { workspaceId, status: { in: ['READY', 'SCHEDULED'] } },
      select: {
        id: true,
        name: true,
        naturalLanguageCommand: true,
        requiredConnections: true,
      },
      take: 20,
    });

    if (agents.length === 0) return '';

    const lines = agents.map((a) => {
      const conns = Array.isArray(a.requiredConnections)
        ? (a.requiredConnections as string[]).join(', ')
        : '';
      return `### ${a.id} — "${a.name}"\nOriginal command: "${a.naturalLanguageCommand}"\nConnections: ${conns || 'none'}`;
    });

    return `\n\n## Available Sub-Agents
You can invoke existing agents as sub-steps using action "invoke_sub_agent" with connector "" and subAgentId/subAgentName fields.
Only use sub-agents when the user's request clearly maps to an existing agent's capability. Prefer direct action steps when possible.

${lines.join('\n\n')}`;
  }

  async plan(
    workspaceId: string,
    command: string,
    endUserId?: string,
  ): Promise<ParsedIntent> {
    this.logger.log(`Planning command for workspace ${workspaceId}: "${command}"`);

    const [actionCatalog, agentCatalog] = await Promise.all([
      this.buildActionCatalog(workspaceId),
      this.buildAgentCatalog(workspaceId),
    ]);
    const systemPrompt = buildSystemPrompt(actionCatalog) + agentCatalog;

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
            // Try exact match first
            const baseWhere: Record<string, unknown> = {
              workspaceId,
              status: 'READY',
            };
            if (endUserId) baseWhere.externalRefId = endUserId;

            const exact = await this.prisma.connectionRef.findFirst({
              where: { ...baseWhere, provider: integrationKey },
              select: { id: true, connectionId: true },
            });
            if (exact?.connectionId) {
              return { connected: true, connectionId: exact.connectionId || exact.id };
            }

            // Resolve via AvailableIntegration (dynamic — no hardcoded mappings)
            const availableIntegrations = await this.prisma.availableIntegration.findMany({
              where: { workspaceId },
              select: { providerKey: true, displayName: true, rawMetadata: true },
            });
            const keyLower = integrationKey.toLowerCase();
            const matched = availableIntegrations.find((ai) => {
              const meta = ai.rawMetadata as Record<string, unknown> | null;
              const nangoProvider = ((meta?.provider as string) || '').toLowerCase();
              const displayLower = ai.displayName.toLowerCase().replace(/\s*\(.*\)/, '').replace(/\s+/g, '-');
              return (
                ai.providerKey.toLowerCase() === keyLower ||
                nangoProvider === keyLower ||
                displayLower === keyLower ||
                keyLower.includes(nangoProvider) ||
                nangoProvider.includes(keyLower)
              );
            });
            if (matched) {
              const ref = await this.prisma.connectionRef.findFirst({
                where: { ...baseWhere, provider: matched.providerKey },
                select: { id: true, connectionId: true },
              });
              if (ref?.connectionId) {
                return { connected: true, connectionId: ref.connectionId || ref.id };
              }
            }

            return { connected: false };
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
                action: z.string().describe('The action name from the catalog, or "invoke_sub_agent" for sub-agent steps'),
                connector: z
                  .string()
                  .describe('The integration key for this action, or "" for sub-agent steps'),
                params: z
                  .record(z.unknown())
                  .default({})
                  .describe('REQUIRED: Parameters matching the action inputSchema. Always include params even if empty {}. Use {{step[N].result}} syntax for data flow.'),
                description: z
                  .string()
                  .describe('Human-readable description of what this step does'),
                subAgentId: z.string().optional().describe('AgentDefinition ID when action is "invoke_sub_agent"'),
                subAgentName: z.string().optional().describe('Display name of the sub-agent when action is "invoke_sub_agent"'),
                steps: z.array(z.object({
                  action: z.string().describe('The action name for this inner step'),
                  connector: z.string().describe('The integration key for this inner step'),
                  params: z.record(z.string()).default({}).describe('Parameters for inner step. Use {{item.field}} for iteration data, {{step[N].result}} for inner step results.'),
                  description: z.string().describe('Human-readable description of what this inner step does'),
                })).optional().describe('Nested steps for for_each iterations'),
                outputSchema: z.record(z.unknown()).optional().describe('JSON Schema for llm_transform structured output'),
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
        subAgentId?: string;
        subAgentName?: string;
        steps?: Array<Record<string, unknown>>;
        outputSchema?: Record<string, unknown>;
      }>;
      extractedEntities?: Record<string, string>;
    };

    // Post-validate: verify each step.action exists in tool registry or proxy registry
    for (const step of plan.steps) {
      if (['invoke_sub_agent', 'for_each', 'llm_transform'].includes(step.action)) continue;
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

    // Extract unique connectors from steps and nested steps (filter out empty strings)
    const allSteps = plan.steps.flatMap((s) => [s, ...((s.steps as Array<{ connector?: string }>) || [])]);
    const connectors = [...new Set(allSteps.map((s) => s.connector).filter(Boolean))] as string[];

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
        ...(step.subAgentId && { subAgentId: step.subAgentId }),
        ...(step.subAgentName && { subAgentName: step.subAgentName }),
        ...(step.steps && { steps: (step.steps as Array<Record<string, unknown>>).map((s, si) => ({ index: si, action: s.action as string, connector: (s.connector as string) || '', params: (s.params as Record<string, unknown>) || {}, description: s.description as string })) }),
        ...(step.outputSchema && { outputSchema: step.outputSchema }),
      })),
    };

    this.logger.log(
      `LLM planner produced plan: ${plan.name} with ${plan.steps.length} steps`,
    );

    // Generate elaborative instructions in parallel (non-blocking for plan)
    try {
      intent.instructions = await this.generateInstructions(
        command,
        intent,
        actionCatalog,
      );
      this.logger.log(`Generated instructions (${intent.instructions.length} chars)`);
    } catch (err) {
      this.logger.warn(`Failed to generate instructions: ${err}`);
      // Non-fatal — plan still works without instructions
    }

    return intent;
  }

  /**
   * Generate comprehensive execution instructions for the workflow.
   * Makes a second LLM call with a focused documentation prompt.
   */
  private async generateInstructions(
    command: string,
    intent: ParsedIntent,
    actionCatalog: string,
  ): Promise<string> {
    const model = this.getModel();

    const systemPrompt = `You are a workflow documentation specialist. Given a user's natural language command and a structured execution plan, generate comprehensive execution instructions in markdown format.

## Output Structure

Write a clear, detailed instruction document following this exact structure:

### Agent Role
One sentence describing what this agent does end-to-end.

### Connections Required
For each integration connector used:
- **[Connector Display Name]** — what it's used for in this workflow

### Workflow — Step by Step

For each step in the plan, write a detailed subsection:

#### Step {N}: {description}
- **Action:** \`{action_name}\` via {connector}
- **Parameters:**
  - Explain each parameter, its purpose, and its value
  - For expression parameters (e.g., \`{{step[0].result.id}}\`), explain which prior step's output is being used and what field is being accessed
- **Expects:** What input data this step needs (from a prior step or user input)
- **Produces:** What this step returns (reference the outputSchema if available)
- **On failure:** What should happen if this step fails

### Expected Output
Describe the final result of the complete workflow — what the user will get.

### Error Handling
- List per-step failure modes and recovery strategies
- Note which steps are critical vs. which can be skipped
- Describe global error handling rules

### Constraints & Notes
- Processing limits, edge cases, or important assumptions
- Any data format considerations

## Rules
- Be specific and actionable — reference actual action names, parameter names, and data paths
- Explain data flow between steps clearly using the expression syntax
- Keep it practical — focus on what matters for execution
- Use the action catalog schemas to accurately describe inputs and outputs
- Do NOT include placeholder IDs or connection IDs — those are resolved at runtime`;

    const userPrompt = `## User Command
"${command}"

## Execution Plan
${JSON.stringify(intent.steps, null, 2)}

## Connectors Used
${intent.connectors.join(', ')}

## Trigger Type
${intent.trigger.type}${intent.trigger.schedule ? ` (schedule: ${intent.trigger.schedule})` : ''}

## Available Action Catalog (for schema reference)
${actionCatalog}`;

    const result = await generateText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens: 2000,
    });

    return result.text;
  }
}
