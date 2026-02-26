import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { NatsService } from '@agent-workflow/nats-client';
import { SUBJECTS } from '@agent-workflow/shared-types';
import type { AgentRunTriggeredEvent } from '@agent-workflow/shared-types';
import { RuntimeService } from './runtime.service';

@Injectable()
export class RuntimeHandler implements OnModuleInit {
  private readonly logger = new Logger(RuntimeHandler.name);

  constructor(
    private readonly nats: NatsService,
    private readonly runtime: RuntimeService,
  ) {}

  async onModuleInit() {
    // Listen for run triggers (when running as a long-lived service in dev mode)
    await this.nats.subscribe<AgentRunTriggeredEvent>(
      SUBJECTS.SCHEDULER_RUN_TRIGGERED,
      'runtime-run-triggered',
      async (data) => {
        this.logger.log(`Run triggered for agent ${data.agentId}, org ${data.orgId}`);
        try {
          await this.runtime.executeRun(data.agentId, data.orgId);
        } catch (err) {
          this.logger.error(`Run execution failed: ${err}`);
        }
      },
    );

    this.logger.log('Runtime handler initialized');
  }
}
