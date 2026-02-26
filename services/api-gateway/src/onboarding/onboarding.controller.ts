import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@agent-workflow/prisma-client';
import { NatsService } from '@agent-workflow/nats-client';
import { ApiKeyGuard, CurrentOrg } from '@agent-workflow/auth';
import { SUBJECTS, OrgCreatedEvent } from '@agent-workflow/shared-types';

class CreateOrgBody {
  name!: string;
  orgEmail!: string;
}

class UpdateOrgBody {
  name?: string;
  orgEmail?: string;
}

@Controller('orgs')
export class OnboardingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nats: NatsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createOrg(@Body() body: CreateOrgBody) {
    const org = await this.prisma.organization.create({
      data: { name: body.name, orgEmail: body.orgEmail },
    });

    await this.prisma.customerConfig.create({
      data: { orgId: org.id },
    });

    const event: OrgCreatedEvent = {
      orgId: org.id,
      name: org.name,
      orgEmail: org.orgEmail,
      apiKey: org.apiKey,
      createdAt: org.createdAt.toISOString(),
    };
    await this.nats.publish(SUBJECTS.ORG_CREATED, event);

    return { orgId: org.id, apiKey: org.apiKey };
  }

  @Get(':orgId')
  @UseGuards(ApiKeyGuard)
  async getOrg(@Param('orgId') orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: { config: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  @Patch(':orgId')
  @UseGuards(ApiKeyGuard)
  async updateOrg(@Param('orgId') orgId: string, @Body() body: UpdateOrgBody) {
    const org = await this.prisma.organization.update({
      where: { id: orgId },
      data: body,
    });

    await this.nats.publish(SUBJECTS.ORG_UPDATED, {
      orgId: org.id,
      changes: body,
      updatedAt: org.updatedAt.toISOString(),
    });

    return org;
  }
}
