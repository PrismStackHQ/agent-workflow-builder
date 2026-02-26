import { Injectable, Logger } from '@nestjs/common';
import type { AgentStep } from '@agent-workflow/shared-types';

interface WorkflowTemplate {
  name: string;
  matchKeywords: string[];
  requiredConnectors: string[];
  steps: AgentStep[];
}

@Injectable()
export class TemplateMatcherService {
  private readonly logger = new Logger(TemplateMatcherService.name);

  private readonly templates: WorkflowTemplate[] = [
    {
      name: 'email-receipts-to-drive',
      matchKeywords: ['receipt', 'email', 'drive', 'upload'],
      requiredConnectors: ['gmail', 'gdrive'],
      steps: [
        {
          index: 0,
          action: 'read_emails',
          connector: 'gmail',
          params: { query: 'subject:receipt OR subject:order OR subject:invoice', maxResults: 50 },
        },
        {
          index: 1,
          action: 'filter_receipts',
          connector: 'gmail',
          params: { filterType: 'receipt_detection' },
        },
        {
          index: 2,
          action: 'upload_files',
          connector: 'gdrive',
          params: { folder: 'Receipts', createFolder: true },
        },
      ],
    },
    {
      name: 'email-summary-to-slack',
      matchKeywords: ['email', 'summary', 'slack'],
      requiredConnectors: ['gmail', 'slack'],
      steps: [
        {
          index: 0,
          action: 'read_emails',
          connector: 'gmail',
          params: { query: 'is:unread', maxResults: 20 },
        },
        {
          index: 1,
          action: 'summarize',
          connector: 'gmail',
          params: { format: 'bullet_points' },
        },
        {
          index: 2,
          action: 'send_message',
          connector: 'slack',
          params: { channel: '#email-summary' },
        },
      ],
    },
    {
      name: 'generic-email-read',
      matchKeywords: ['email', 'read', 'mail'],
      requiredConnectors: ['gmail'],
      steps: [
        {
          index: 0,
          action: 'read_emails',
          connector: 'gmail',
          params: { query: 'is:unread', maxResults: 50 },
        },
      ],
    },
  ];

  matchSteps(command: string, connectors: string[]): AgentStep[] {
    // Score each template by keyword matches
    let bestMatch: WorkflowTemplate | null = null;
    let bestScore = 0;

    for (const template of this.templates) {
      const score = template.matchKeywords.filter((kw) => command.includes(kw)).length;
      const connectorMatch = template.requiredConnectors.every((c) => connectors.includes(c));

      if (score > bestScore && connectorMatch) {
        bestScore = score;
        bestMatch = template;
      }
    }

    if (bestMatch) {
      this.logger.log(`Matched template: ${bestMatch.name} (score: ${bestScore})`);
      return bestMatch.steps;
    }

    // Fallback: generate generic steps from connectors
    this.logger.log('No template match, generating generic steps');
    return connectors.map((connector, index) => ({
      index,
      action: 'generic_action',
      connector,
      params: { command },
    }));
  }
}
