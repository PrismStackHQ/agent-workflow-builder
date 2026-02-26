import { Injectable, Logger } from '@nestjs/common';
import type { ParsedIntent, AgentStep } from '@agent-workflow/shared-types';
import { TemplateMatcherService } from './template-matcher.service';

@Injectable()
export class NlParserService {
  private readonly logger = new Logger(NlParserService.name);

  constructor(private readonly templateMatcher: TemplateMatcherService) {}

  parse(command: string): ParsedIntent {
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

    // Connector detection
    const connectors: string[] = [];
    if (lower.includes('gmail') || lower.includes('email') || lower.includes('mail')) {
      connectors.push('gmail');
    }
    if (lower.includes('gdrive') || lower.includes('google drive') || lower.includes('drive')) {
      connectors.push('gdrive');
    }
    if (lower.includes('slack')) {
      connectors.push('slack');
    }
    if (lower.includes('notion')) {
      connectors.push('notion');
    }
    if (lower.includes('sheets') || lower.includes('spreadsheet')) {
      connectors.push('google_sheets');
    }

    // Step extraction via template matching
    const steps = this.templateMatcher.matchSteps(lower, connectors);

    // Generate a name from the command
    const name = this.generateName(lower);

    this.logger.log(`Parsed: schedule=${schedule}, connectors=${connectors.join(',')}, steps=${steps.length}`);

    return {
      trigger: { type: 'cron', schedule },
      connectors,
      steps,
    };
  }

  private generateName(command: string): string {
    // Extract a meaningful short name from the command
    const words = command.split(/\s+/).slice(0, 6);
    return words
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
      .substring(0, 50);
  }
}
