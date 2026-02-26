import { Injectable, Logger } from '@nestjs/common';
import { K8sClientService } from './k8s-client.service';
import { PrismaService } from '@agent-workflow/prisma-client';

@Injectable()
export class CronJobBuilderService {
  private readonly logger = new Logger(CronJobBuilderService.name);

  constructor(
    private readonly k8s: K8sClientService,
    private readonly prisma: PrismaService,
  ) {}

  async createCronJob(agentId: string, orgId: string, namespace: string): Promise<string> {
    const agent = await this.prisma.agentDefinition.findUnique({ where: { id: agentId } });
    if (!agent || !agent.scheduleCron) {
      throw new Error(`Agent ${agentId} not found or has no schedule`);
    }

    const cronJobName = `agent-${agentId.substring(0, 8)}`;
    const runtimeImage = process.env.AGENT_RUNTIME_IMAGE || 'agent-runtime:latest';

    if (!this.k8s.isConnected()) {
      this.logger.warn(`K8s not connected, simulating CronJob creation: ${cronJobName}`);
      // Update agent with simulated K8s info
      await this.prisma.agentDefinition.update({
        where: { id: agentId },
        data: {
          status: 'SCHEDULED',
          k8sCronJobName: cronJobName,
          k8sNamespace: namespace,
        },
      });
      return cronJobName;
    }

    await this.k8s.getBatchApi().createNamespacedCronJob({
      namespace,
      body: {
        metadata: { name: cronJobName },
        spec: {
          schedule: agent.scheduleCron,
          concurrencyPolicy: 'Forbid',
          jobTemplate: {
            spec: {
              template: {
                spec: {
                  containers: [
                    {
                      name: 'agent-runtime',
                      image: runtimeImage,
                      env: [
                        { name: 'AGENT_ID', value: agentId },
                        { name: 'ORG_ID', value: orgId },
                        { name: 'NATS_URL', value: process.env.NATS_URL || 'nats://nats.agent-workflow-system:4222' },
                      ],
                      envFrom: [
                        { secretRef: { name: 'db-credentials' } },
                      ],
                    },
                  ],
                  restartPolicy: 'Never',
                },
              },
              backoffLimit: 2,
            },
          },
        },
      },
    });

    await this.prisma.agentDefinition.update({
      where: { id: agentId },
      data: {
        status: 'SCHEDULED',
        k8sCronJobName: cronJobName,
        k8sNamespace: namespace,
      },
    });

    this.logger.log(`Created CronJob ${cronJobName} in namespace ${namespace}`);
    return cronJobName;
  }
}
