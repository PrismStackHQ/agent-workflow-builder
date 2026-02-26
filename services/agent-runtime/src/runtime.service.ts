import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@agent-workflow/prisma-client';
import { NatsService } from '@agent-workflow/nats-client';
import { SUBJECTS } from '@agent-workflow/shared-types';
import type { AgentStep } from '@agent-workflow/shared-types';
import { TokenResolverService } from './token-resolver.service';
import { IStepAdapter, StepContext } from './adapters/adapter.interface';
import { GmailReadAdapter } from './adapters/gmail-read.adapter';
import { ReceiptFilterAdapter } from './adapters/receipt-filter.adapter';
import { GdriveUploadAdapter } from './adapters/gdrive-upload.adapter';

@Injectable()
export class RuntimeService {
  private readonly logger = new Logger(RuntimeService.name);
  private readonly adapterMap: Map<string, IStepAdapter>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly nats: NatsService,
    private readonly tokenResolver: TokenResolverService,
    gmailRead: GmailReadAdapter,
    receiptFilter: ReceiptFilterAdapter,
    gdriveUpload: GdriveUploadAdapter,
  ) {
    this.adapterMap = new Map<string, IStepAdapter>([
      [gmailRead.action, gmailRead],
      [receiptFilter.action, receiptFilter],
      [gdriveUpload.action, gdriveUpload],
    ]);
  }

  async executeRun(agentId: string, orgId: string): Promise<void> {
    const runId = randomUUID();

    const agent = await this.prisma.agentDefinition.findUnique({ where: { id: agentId } });
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Create run record
    const run = await this.prisma.agentRun.create({
      data: {
        id: runId,
        agentId,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    await this.nats.publish(SUBJECTS.RUNTIME_RUN_STARTED, {
      orgId,
      agentId,
      runId,
      startedAt: run.startedAt!.toISOString(),
    });

    const steps = agent.steps as unknown as AgentStep[];
    const requiredConnections = agent.requiredConnections as string[];

    // Resolve tokens
    const tokens = await this.tokenResolver.resolveTokens(orgId, requiredConnections);

    const context: StepContext = {
      orgId,
      agentId,
      runId,
      tokens,
      previousResults: [],
    };

    try {
      for (const step of steps) {
        this.logger.log(`Executing step ${step.index}: ${step.action}`);

        const adapter = this.adapterMap.get(step.action);
        if (!adapter) {
          // Use a generic passthrough for unknown actions
          this.logger.warn(`No adapter for action ${step.action}, skipping`);
          context.previousResults.push({ skipped: true, action: step.action });
        } else {
          const result = await adapter.execute(step.params, context);
          context.previousResults.push(result);
        }

        await this.prisma.agentRun.update({
          where: { id: runId },
          data: { stepsCompleted: step.index + 1 },
        });

        await this.nats.publish(SUBJECTS.RUNTIME_RUN_STEP_COMPLETED, {
          orgId,
          agentId,
          runId,
          stepIndex: step.index,
          stepName: step.action,
          result: context.previousResults[context.previousResults.length - 1],
        });
      }

      // Run succeeded
      const endedAt = new Date();
      await this.prisma.agentRun.update({
        where: { id: runId },
        data: { status: 'SUCCEEDED', endedAt },
      });

      await this.nats.publish(SUBJECTS.RUNTIME_RUN_SUCCEEDED, {
        orgId,
        agentId,
        runId,
        endedAt: endedAt.toISOString(),
        summary: `Completed ${steps.length} steps successfully`,
      });

      this.logger.log(`Run ${runId} completed successfully`);
    } catch (err) {
      const endedAt = new Date();
      const errorMsg = String(err);

      await this.prisma.agentRun.update({
        where: { id: runId },
        data: { status: 'FAILED', endedAt, errorMessage: errorMsg },
      });

      await this.nats.publish(SUBJECTS.RUNTIME_RUN_FAILED, {
        orgId,
        agentId,
        runId,
        endedAt: endedAt.toISOString(),
        error: errorMsg,
      });

      this.logger.error(`Run ${runId} failed: ${err}`);
      throw err;
    }
  }
}
