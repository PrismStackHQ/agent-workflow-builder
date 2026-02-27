import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { NatsService } from '@agent-workflow/nats-client';
import { SUBJECTS } from '@agent-workflow/shared-types';
import type {
  OrgCreatedEvent,
  AgentDefinitionReadyEvent,
} from '@agent-workflow/shared-types';
import { NamespaceProvisionerService } from './k8s/namespace-provisioner.service';
import { CronJobBuilderService } from './k8s/cronjob-builder.service';

@Injectable()
export class SchedulerHandler implements OnModuleInit {
  private readonly logger = new Logger(SchedulerHandler.name);

  constructor(
    private readonly nats: NatsService,
    private readonly nsProvisioner: NamespaceProvisionerService,
    private readonly cronJobBuilder: CronJobBuilderService,
  ) {}

  async onModuleInit() {
    await this.nats.subscribe<OrgCreatedEvent>(
      SUBJECTS.ORG_CREATED,
      'scheduler-org-created',
      async (data) => {
        this.logger.log(`Provisioning namespace for workspace ${data.workspaceId}`);
        try {
          await this.nsProvisioner.provisionNamespace(data.workspaceId);
        } catch (err) {
          this.logger.error(`Failed to provision namespace: ${err}`);
        }
      },
    );

    await this.nats.subscribe<AgentDefinitionReadyEvent>(
      SUBJECTS.AGENT_DEFINITION_READY,
      'scheduler-agent-ready',
      async (data) => {
        this.logger.log(`Scheduling agent ${data.agentId} for workspace ${data.workspaceId}`);
        try {
          const namespace = `workspace-${data.workspaceId}`;
          const cronJobName = await this.cronJobBuilder.createCronJob(
            data.agentId,
            data.orgId,
            data.workspaceId,
            namespace,
          );

          await this.nats.publish(SUBJECTS.SCHEDULER_AGENT_SCHEDULED, {
            orgId: data.orgId,
            workspaceId: data.workspaceId,
            agentId: data.agentId,
            cronJobName,
            namespace,
          });

          this.logger.log(`Agent ${data.agentId} scheduled as ${cronJobName}`);
        } catch (err) {
          this.logger.error(`Failed to schedule agent: ${err}`);
        }
      },
    );

    this.logger.log('Scheduler handler initialized');
  }
}
