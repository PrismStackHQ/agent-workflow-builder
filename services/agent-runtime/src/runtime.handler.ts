import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { NatsService } from '@agent-workflow/nats-client';
import { PrismaService } from '@agent-workflow/prisma-client';
import { SUBJECTS } from '@agent-workflow/shared-types';
import type {
  AgentRunTriggeredEvent,
  AgentRunResumeRequestedEvent,
  ConnectionCompletedEvent,
} from '@agent-workflow/shared-types';
import { RuntimeService } from './runtime.service';

@Injectable()
export class RuntimeHandler implements OnModuleInit {
  private readonly logger = new Logger(RuntimeHandler.name);

  constructor(
    private readonly nats: NatsService,
    private readonly prisma: PrismaService,
    private readonly runtime: RuntimeService,
  ) {}

  async onModuleInit() {
    // Handle scheduled/triggered runs
    await this.nats.subscribe<AgentRunTriggeredEvent>(
      SUBJECTS.SCHEDULER_RUN_TRIGGERED,
      'runtime-run-triggered',
      async (data) => {
        this.logger.log(`Run triggered for agent ${data.agentId}, workspace ${data.workspaceId}`);
        try {
          await this.runtime.executeRun(data.agentId, data.orgId, data.workspaceId);
        } catch (err) {
          this.logger.error(`Run execution failed: ${err}`);
        }
      },
    );

    // Handle resume requests for paused runs
    await this.nats.subscribe<AgentRunResumeRequestedEvent>(
      SUBJECTS.RUNTIME_RUN_RESUME_REQUESTED,
      'runtime-run-resume',
      async (data) => {
        this.logger.log(`Resume requested for run ${data.runId}`);
        try {
          await this.runtime.resumeRun(data.runId, data.connectionId);
        } catch (err) {
          this.logger.error(`Failed to resume run ${data.runId}: ${err}`);
        }
      },
    );

    // Handle connection completed — find and resume paused runs
    await this.nats.subscribe<ConnectionCompletedEvent>(
      SUBJECTS.CONNECTION_COMPLETED,
      'runtime-connection-completed',
      async (data) => {
        this.logger.log(
          `Connection completed for ${data.integrationKey}, workspace ${data.workspaceId}`,
        );

        // Find paused runs that need this integration
        const pausedRuns = await this.prisma.agentRun.findMany({
          where: {
            status: 'PAUSED',
            agent: { workspaceId: data.workspaceId },
            pauseReason: { startsWith: `connection_required:${data.integrationKey}` },
          },
        });

        for (const run of pausedRuns) {
          this.logger.log(`Auto-resuming run ${run.id} after connection completed`);
          await this.nats.publish(SUBJECTS.RUNTIME_RUN_RESUME_REQUESTED, {
            orgId: data.orgId,
            workspaceId: data.workspaceId,
            runId: run.id,
            connectionId: data.connectionId,
          });
        }
      },
    );

    this.logger.log('Runtime handler initialized');
  }
}
