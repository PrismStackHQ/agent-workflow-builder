import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@agent-workflow/prisma-client';
import { NatsService } from '@agent-workflow/nats-client';
import { SUBJECTS, CreateOrgDto, OrgCreatedEvent } from '@agent-workflow/shared-types';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nats: NatsService,
  ) {}

  async createOrg(dto: CreateOrgDto) {
    const org = await this.prisma.organization.create({
      data: {
        name: dto.name,
        orgEmail: dto.orgEmail,
      },
    });

    // Create default workspace
    const workspace = await this.prisma.workspace.create({
      data: { orgId: org.id, name: 'Default' },
    });

    // Create default customer config for workspace
    await this.prisma.customerConfig.create({
      data: { workspaceId: workspace.id },
    });

    const event: OrgCreatedEvent = {
      orgId: org.id,
      workspaceId: workspace.id,
      name: org.name,
      orgEmail: org.orgEmail,
      apiKey: workspace.apiKey,
      workspaceName: workspace.name,
      createdAt: org.createdAt.toISOString(),
    };

    await this.nats.publish(SUBJECTS.ORG_CREATED, event);
    this.logger.log(`Organization created: ${org.id}, workspace: ${workspace.id}`);

    return { orgId: org.id, workspaceId: workspace.id, apiKey: workspace.apiKey };
  }

  async getOrg(orgId: string) {
    return this.prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        workspaces: {
          where: { deletedAt: null },
          include: { config: true },
        },
      },
    });
  }

  async updateOrg(orgId: string, changes: Partial<{ name: string; orgEmail: string }>) {
    const org = await this.prisma.organization.update({
      where: { id: orgId },
      data: changes,
    });

    await this.nats.publish(SUBJECTS.ORG_UPDATED, {
      orgId: org.id,
      changes,
      updatedAt: org.updatedAt.toISOString(),
    });

    return org;
  }
}
