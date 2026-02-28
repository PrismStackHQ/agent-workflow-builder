import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@agent-workflow/prisma-client';
import type { ParsedIntent } from '@agent-workflow/shared-types';
import { TemplateMatcherService } from './template-matcher.service';

// Maps common user terms → possible integrationKey fragments
const KEYWORD_ALIASES: Record<string, string[]> = {
  email: ['mail', 'gmail', 'email'],
  gmail: ['mail', 'gmail'],
  mail: ['mail', 'gmail', 'email'],
  drive: ['drive', 'gdrive'],
  'google drive': ['drive', 'gdrive'],
  gdrive: ['drive', 'gdrive'],
  slack: ['slack'],
  notion: ['notion'],
  sheets: ['sheets', 'spreadsheet'],
  spreadsheet: ['sheets', 'spreadsheet'],
  calendar: ['calendar'],
  'google calendar': ['calendar'],
  jira: ['jira'],
  github: ['github'],
  hubspot: ['hubspot'],
  salesforce: ['salesforce'],
  trello: ['trello'],
  asana: ['asana'],
  dropbox: ['dropbox'],
  outlook: ['outlook'],
};

@Injectable()
export class NlParserService {
  private readonly logger = new Logger(NlParserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly templateMatcher: TemplateMatcherService,
  ) {}

  async parse(command: string, workspaceId: string): Promise<ParsedIntent> {
    const lower = command.toLowerCase();
    this.logger.log(`Parsing command: "${command}"`);

    // Trigger detection
    let schedule: string;
    if (lower.includes('every minute')) {
      schedule = '* * * * *';
    } else if (lower.includes('every hour')) {
      schedule = '0 * * * *';
    } else if (lower.includes('every day') || lower.includes('daily')) {
      schedule = '0 8 * * *';
    } else if (lower.includes('every week') || lower.includes('weekly')) {
      schedule = '0 8 * * 1';
    } else if (lower.includes('every month') || lower.includes('monthly')) {
      schedule = '0 8 1 * *';
    } else {
      schedule = '0 8 * * *'; // default daily
    }

    // Connector detection — resolve against actual tool registry
    const connectors = await this.resolveConnectors(lower, workspaceId);

    // Step extraction via template matching (now queries tool registry)
    const steps = await this.templateMatcher.matchSteps(lower, connectors, workspaceId);

    this.logger.log(
      `Parsed: schedule=${schedule}, connectors=${connectors.join(',')}, steps=${steps.length}`,
    );

    return {
      trigger: { type: 'cron', schedule },
      connectors,
      steps,
    };
  }

  /**
   * Resolves user-mentioned providers to actual integrationKey values
   * from the ToolRegistryEntry table.
   */
  private async resolveConnectors(command: string, workspaceId: string): Promise<string[]> {
    // Get all available integration keys from the tool registry
    const entries = await this.prisma.toolRegistryEntry.findMany({
      where: { workspaceId },
      select: { integrationKey: true },
      distinct: ['integrationKey'],
    });
    const availableKeys = entries.map((e) => e.integrationKey);

    if (availableKeys.length === 0) {
      this.logger.warn('No integrations found in tool registry, falling back to keyword extraction');
      return this.fallbackConnectorExtraction(command);
    }

    const matched = new Set<string>();

    // Strategy 1: Check if any known user keyword appears in the command,
    // then find a matching integrationKey
    for (const [keyword, fragments] of Object.entries(KEYWORD_ALIASES)) {
      if (command.includes(keyword)) {
        for (const key of availableKeys) {
          const keyLower = key.toLowerCase();
          if (fragments.some((f) => keyLower.includes(f))) {
            matched.add(key);
          }
        }
      }
    }

    // Strategy 2: Check if any integrationKey (or part of it) appears directly in the command
    for (const key of availableKeys) {
      const keyLower = key.toLowerCase();
      // Check full key (e.g. "google-mail")
      if (command.includes(keyLower) || command.includes(keyLower.replace(/-/g, ' '))) {
        matched.add(key);
        continue;
      }
      // Check each segment of the key (e.g. "mail" from "google-mail")
      const segments = keyLower.split(/[-_]/);
      for (const segment of segments) {
        if (segment.length >= 4 && command.includes(segment)) {
          matched.add(key);
        }
      }
    }

    if (matched.size === 0) {
      this.logger.warn('No connectors matched from tool registry, falling back');
      return this.fallbackConnectorExtraction(command);
    }

    this.logger.log(`Resolved connectors from registry: ${[...matched].join(', ')}`);
    return [...matched];
  }

  /**
   * Fallback: extract connector names from keywords when no tool registry entries exist.
   */
  private fallbackConnectorExtraction(command: string): string[] {
    const connectors: string[] = [];
    if (/\b(gmail|email|mail)\b/.test(command)) connectors.push('gmail');
    if (/\b(gdrive|google\s*drive|drive)\b/.test(command)) connectors.push('gdrive');
    if (/\bslack\b/.test(command)) connectors.push('slack');
    if (/\bnotion\b/.test(command)) connectors.push('notion');
    if (/\b(sheets|spreadsheet)\b/.test(command)) connectors.push('google_sheets');
    return connectors;
  }
}
