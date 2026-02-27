import { Injectable, Logger } from '@nestjs/common';
import { K8sClientService } from './k8s-client.service';

@Injectable()
export class NamespaceProvisionerService {
  private readonly logger = new Logger(NamespaceProvisionerService.name);

  constructor(private readonly k8s: K8sClientService) {}

  async provisionNamespace(workspaceId: string): Promise<string> {
    const nsName = `workspace-${workspaceId}`;

    if (!this.k8s.isConnected()) {
      this.logger.warn(`K8s not connected, skipping namespace creation for ${nsName}`);
      return nsName;
    }

    try {
      await this.k8s.getCoreApi().readNamespace({ name: nsName });
      this.logger.log(`Namespace ${nsName} already exists`);
      return nsName;
    } catch {
      await this.k8s.getCoreApi().createNamespace({
        body: {
          metadata: {
            name: nsName,
            labels: {
              'app.kubernetes.io/managed-by': 'agent-workflow',
              'agent-workflow/workspace-id': workspaceId,
            },
          },
        },
      });

      await this.k8s.getCoreApi().createNamespacedSecret({
        namespace: nsName,
        body: {
          metadata: { name: 'db-credentials' },
          stringData: { url: process.env.DATABASE_URL || '' },
        },
      });

      this.logger.log(`Provisioned namespace ${nsName}`);
      return nsName;
    }
  }
}
