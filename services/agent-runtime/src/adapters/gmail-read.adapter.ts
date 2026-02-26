import { Injectable, Logger } from '@nestjs/common';
import { IStepAdapter, StepContext } from './adapter.interface';

@Injectable()
export class GmailReadAdapter implements IStepAdapter {
  readonly action = 'read_emails';
  private readonly logger = new Logger(GmailReadAdapter.name);

  async execute(params: Record<string, unknown>, context: StepContext): Promise<unknown> {
    this.logger.log(`[STUB] Reading emails with query: ${params.query}`);

    // In production, this would use Gmail API with the token from context
    const token = context.tokens.get('gmail');
    this.logger.log(`[STUB] Gmail token available: ${!!token}`);

    // Return mock email data
    return {
      emails: [
        {
          id: 'mock-email-1',
          subject: 'Your Amazon Order Receipt',
          from: 'auto-confirm@amazon.com',
          date: new Date().toISOString(),
          hasAttachment: true,
          snippet: 'Thank you for your order...',
        },
        {
          id: 'mock-email-2',
          subject: 'Receipt for your Uber trip',
          from: 'receipts@uber.com',
          date: new Date().toISOString(),
          hasAttachment: false,
          snippet: 'Your trip receipt...',
        },
        {
          id: 'mock-email-3',
          subject: 'Payment Confirmation - Netflix',
          from: 'info@netflix.com',
          date: new Date().toISOString(),
          hasAttachment: false,
          snippet: 'Your monthly payment has been processed...',
        },
      ],
      totalFound: 3,
    };
  }
}
