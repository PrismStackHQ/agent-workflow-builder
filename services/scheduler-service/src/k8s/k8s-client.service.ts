import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as k8s from '@kubernetes/client-node';

@Injectable()
export class K8sClientService implements OnModuleInit {
  private readonly logger = new Logger(K8sClientService.name);
  private kc!: k8s.KubeConfig;
  private coreApi!: k8s.CoreV1Api;
  private batchApi!: k8s.BatchV1Api;
  private appsApi!: k8s.AppsV1Api;
  private connected = false;

  async onModuleInit() {
    try {
      this.kc = new k8s.KubeConfig();

      if (process.env.KUBERNETES_SERVICE_HOST) {
        this.kc.loadFromCluster();
      } else if (process.env.KUBECONFIG) {
        this.kc.loadFromFile(process.env.KUBECONFIG);
      } else {
        this.kc.loadFromDefault();
      }

      this.coreApi = this.kc.makeApiClient(k8s.CoreV1Api);
      this.batchApi = this.kc.makeApiClient(k8s.BatchV1Api);
      this.appsApi = this.kc.makeApiClient(k8s.AppsV1Api);
      this.connected = true;
      this.logger.log('Kubernetes client initialized');
    } catch (err) {
      this.logger.warn(`K8s client init failed (running without K8s): ${err}`);
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getCoreApi(): k8s.CoreV1Api {
    return this.coreApi;
  }

  getBatchApi(): k8s.BatchV1Api {
    return this.batchApi;
  }

  getAppsApi(): k8s.AppsV1Api {
    return this.appsApi;
  }
}
