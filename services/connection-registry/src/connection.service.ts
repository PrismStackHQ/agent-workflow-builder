import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@agent-workflow/prisma-client';
import { NatsService } from '@agent-workflow/nats-client';
import { SUBJECTS } from '@agent-workflow/shared-types';

@Injectable()
export class ConnectionService {
  private readonly logger = new Logger(ConnectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nats: NatsService,
  ) {}

  async getConfig(workspaceId: string) {
    return this.prisma.customerConfig.findUnique({ where: { workspaceId } });
  }

  async getConnectionRef(connectionRefId: string) {
    return this.prisma.connectionRef.findUnique({ where: { id: connectionRefId } });
  }

  async getConnectionsByWorkspace(workspaceId: string) {
    return this.prisma.connectionRef.findMany({ where: { workspaceId } });
  }

  async getReadyConnections(workspaceId: string, providers: string[]) {
    return this.prisma.connectionRef.findMany({
      where: { workspaceId, providerConfigKey: { in: providers }, status: 'READY' },
    });
  }
}
