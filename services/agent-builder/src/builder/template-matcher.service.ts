import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@agent-workflow/prisma-client';
import type { AgentStep } from '@agent-workflow/shared-types';

// Maps generic action concepts to search terms for finding real actions in the registry
const ACTION_CONCEPT_KEYWORDS: Record<string, string[]> = {
  read: ['list', 'read', 'get', 'fetch', 'search', 'find'],
  send: ['send', 'post', 'create', 'write', 'push', 'publish'],
  upload: ['upload', 'create', 'write', 'save', 'put'],
  download: ['download', 'get', 'read', 'fetch', 'export'],
  search: ['search', 'find', 'list', 'query', 'lookup'],
  delete: ['delete', 'remove', 'trash'],
  update: ['update', 'edit', 'modify', 'patch'],
  summarize: ['summary', 'summarize', 'digest'],
  filter: ['filter', 'search', 'find', 'list'],
};

@Injectable()
export class TemplateMatcherService {
  private readonly logger = new Logger(TemplateMatcherService.name);

  constructor(private readonly prisma: PrismaService) {}

  async matchSteps(
    command: string,
    connectors: string[],
    workspaceId: string,
  ): Promise<AgentStep[]> {
    if (connectors.length === 0) {
      this.logger.log('No connectors provided, returning empty steps');
      return [];
    }

    // Fetch all available actions for the matched connectors from the tool registry
    const registryTools = await this.prisma.toolRegistryEntry.findMany({
      where: {
        workspaceId,
        integrationKey: { in: connectors },
      },
      select: {
        integrationKey: true,
        actionName: true,
        displayName: true,
        description: true,
      },
    });

    if (registryTools.length === 0) {
      this.logger.log('No tools found in registry for connectors, generating generic steps');
      return connectors.map((connector, index) => ({
        index,
        action: 'generic_action',
        connector,
        params: { command },
      }));
    }

    // Group tools by connector
    const toolsByConnector = new Map<
      string,
      Array<{ actionName: string; displayName: string; description: string | null }>
    >();
    for (const tool of registryTools) {
      const list = toolsByConnector.get(tool.integrationKey) || [];
      list.push(tool);
      toolsByConnector.set(tool.integrationKey, list);
    }

    // Extract action intent from the command and match to real actions
    const steps: AgentStep[] = [];
    let stepIndex = 0;

    for (const connector of connectors) {
      const available = toolsByConnector.get(connector);
      if (!available || available.length === 0) continue;

      const bestAction = this.findBestAction(command, available);

      if (bestAction) {
        steps.push({
          index: stepIndex++,
          action: bestAction.actionName,
          connector,
          params: { command },
        });
        this.logger.log(
          `Matched action: ${bestAction.actionName} (${bestAction.displayName}) for connector ${connector}`,
        );
      } else {
        // Use the first available action as a fallback
        steps.push({
          index: stepIndex++,
          action: available[0].actionName,
          connector,
          params: { command },
        });
        this.logger.log(
          `No strong match for connector ${connector}, using default: ${available[0].actionName}`,
        );
      }
    }

    return steps;
  }

  /**
   * Scores each available action against the user's command to find the best match.
   * Uses action name, display name, and description for matching.
   */
  private findBestAction(
    command: string,
    actions: Array<{ actionName: string; displayName: string; description: string | null }>,
  ): { actionName: string; displayName: string } | null {
    let bestAction: { actionName: string; displayName: string } | null = null;
    let bestScore = 0;

    // Determine which action concepts appear in the command
    const activeConceptKeywords: string[] = [];
    for (const [concept, keywords] of Object.entries(ACTION_CONCEPT_KEYWORDS)) {
      if (command.includes(concept)) {
        activeConceptKeywords.push(...keywords);
      }
    }

    for (const action of actions) {
      let score = 0;

      const actionLower = action.actionName.toLowerCase();
      const displayLower = action.displayName.toLowerCase();
      const descLower = (action.description || '').toLowerCase();
      const searchable = `${actionLower} ${displayLower} ${descLower}`;

      // Score: concept keywords match action metadata
      for (const keyword of activeConceptKeywords) {
        if (searchable.includes(keyword)) {
          score += 2;
        }
      }

      // Score: command words appear in action display name or description
      const commandWords = command.split(/\s+/).filter((w) => w.length >= 3);
      for (const word of commandWords) {
        if (displayLower.includes(word)) score += 3;
        if (descLower.includes(word)) score += 1;
      }

      // Score: action name segments match command
      const actionSegments = actionLower.split(/[-_]/);
      for (const segment of actionSegments) {
        if (segment.length >= 3 && command.includes(segment)) {
          score += 2;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    }

    return bestScore >= 2 ? bestAction : null;
  }
}
