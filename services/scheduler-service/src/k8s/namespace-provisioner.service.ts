import { Injectable, Logger } from '@nestjs/common';
import { K8sClientService } from './k8s-client.service';

@Injectable()
export class NamespaceProvisionerService {
  private readonly logger = new Logger(NamespaceProvisionerService.name);

  constructor(private readonly k8s: K8sClientService) {}

  async provisionNamespace(orgId: string): Promise<string> {
    const nsName = `customer-${orgId}`;

    if (!this.k8s.isConnected()) {
      this.logger.warn(`K8s not connected, skipping namespace creation for ${nsName}`);
      return nsName;
    }

    try {
      // Check if namespace already exists
      await this.k8s.getCoreApi().readNamespace({ name: nsName });
      this.logger.log(`Namespace ${nsName} already exists`);
      return nsName;
    } catch {
      // Create the namespace
      await this.k8s.getCoreApi().createNamespace({
        body: {
          metadata: {
            name: nsName,
            labels: {
              'app.kubernetes.io/managed-by': 'agent-workflow',
              'agent-workflow/org-id': orgId,
            },
          },
        },
      });

      // Create DB credentials secret
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
