import { Injectable, Logger } from '@nestjs/common';
import { IStepAdapter, StepContext } from './adapter.interface';

@Injectable()
export class ReceiptFilterAdapter implements IStepAdapter {
  readonly action = 'filter_receipts';
  private readonly logger = new Logger(ReceiptFilterAdapter.name);

  async execute(params: Record<string, unknown>, context: StepContext): Promise<unknown> {
    this.logger.log(`[STUB] Filtering receipts from previous step results`);

    // Get emails from previous step
    const previousResult = context.previousResults[context.previousResults.length - 1] as any;
    const emails = previousResult?.emails || [];

    // In production, this would use NLP/heuristics to detect receipt emails
    const receipts = emails.filter((email: any) =>
      email.subject.toLowerCase().includes('receipt') ||
      email.subject.toLowerCase().includes('payment') ||
      email.subject.toLowerCase().includes('order') ||
      email.subject.toLowerCase().includes('invoice'),
    );

    this.logger.log(`[STUB] Found ${receipts.length} receipts out of ${emails.length} emails`);

    return {
      receipts,
      totalFiltered: receipts.length,
    };
  }
}
