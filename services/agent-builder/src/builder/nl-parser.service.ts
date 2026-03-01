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
   *
   * Uses a scoring approach: each integration key gets a relevance score
   * based on how well it matches the command. Only the best matches are returned,
   * avoiding false positives like matching "google-calendar" when user said "Google Drive".
   */
  private async resolveConnectors(command: string, workspaceId: string): Promise<string[]> {
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

    const scores = new Map<string, number>();

    // Strategy 1: Full key match (highest confidence)
    // e.g. "google drive" in command → matches "google-drive-4" via base key "google-drive"
    for (const key of availableKeys) {
      const keyLower = key.toLowerCase();
      const keyBase = keyLower.replace(/-\d+$/, ''); // strip version suffix
      const keySpaced = keyBase.replace(/-/g, ' ');

      if (command.includes(keyLower) || command.includes(keyBase) || command.includes(keySpaced)) {
        scores.set(key, (scores.get(key) || 0) + 100);
      }
    }

    // Strategy 2: Keyword alias matching with specificity scoring
    // Multi-word keywords (like "google drive") are more specific than single-word ones
    for (const [keyword, fragments] of Object.entries(KEYWORD_ALIASES)) {
      const isMultiWord = keyword.includes(' ');
      const found = isMultiWord
        ? command.includes(keyword)
        : new RegExp(`\\b${keyword}\\b`).test(command);

      if (found) {
        // Multi-word keywords get a bonus for specificity
        const keywordBonus = isMultiWord ? 20 : 0;
        for (const key of availableKeys) {
          const keyLower = key.toLowerCase();
          for (const f of fragments) {
            if (keyLower.includes(f)) {
              scores.set(key, (scores.get(key) || 0) + f.length * 2 + keywordBonus);
            }
          }
        }
      }
    }

    // Strategy 3: Discriminating segment match — skip generic segments like "google"
    const GENERIC_SEGMENTS = new Set(['google', 'microsoft', 'apple', 'api', 'app', 'service', 'cloud']);
    for (const key of availableKeys) {
      const keyLower = key.toLowerCase();
      const segments = keyLower.split(/[-_]/).filter(
        (s) => s.length >= 3 && !GENERIC_SEGMENTS.has(s) && !/^\d+$/.test(s),
      );
      for (const segment of segments) {
        if (new RegExp(`\\b${segment}\\b`).test(command)) {
          scores.set(key, (scores.get(key) || 0) + segment.length * 3);
        }
      }
    }

    if (scores.size === 0) {
      this.logger.warn('No connectors matched from tool registry, falling back');
      return this.fallbackConnectorExtraction(command);
    }

    // Only keep matches scoring within 40% of the best score to filter out weak matches
    const maxScore = Math.max(...scores.values());
    const threshold = maxScore * 0.4;
    const results = [...scores.entries()]
      .filter(([, score]) => score >= threshold)
      .sort(([, a], [, b]) => b - a)
      .map(([key]) => key);

    this.logger.log(
      `Resolved connectors from registry: ${results.join(', ')} (scores: ${[...scores.entries()].map(([k, v]) => `${k}=${v}`).join(', ')})`,
    );
    return results;
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
