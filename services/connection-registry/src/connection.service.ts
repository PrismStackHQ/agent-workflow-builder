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

  async getConfig(orgId: string) {
    return this.prisma.customerConfig.findUnique({ where: { orgId } });
  }

  async getConnectionRef(connectionRefId: string) {
    return this.prisma.connectionRef.findUnique({ where: { id: connectionRefId } });
  }

  async getConnectionsByOrg(orgId: string) {
    return this.prisma.connectionRef.findMany({ where: { orgId } });
  }

  async getReadyConnections(orgId: string, providers: string[]) {
    return this.prisma.connectionRef.findMany({
      where: { orgId, provider: { in: providers }, status: 'READY' },
    });
  }
}
