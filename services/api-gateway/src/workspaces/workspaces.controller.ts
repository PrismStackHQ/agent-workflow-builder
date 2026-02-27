import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@agent-workflow/prisma-client';
import { ApiKeyGuard, CurrentWorkspace } from '@agent-workflow/auth';

@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @UseGuards(ApiKeyGuard)
  async listWorkspaces(@CurrentWorkspace() workspace: any) {
    return this.prisma.workspace.findMany({
      where: { orgId: workspace.orgId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, apiKey: true, createdAt: true },
    });
  }

  @Post()
  @UseGuards(ApiKeyGuard)
  async createWorkspace(
    @CurrentWorkspace() workspace: any,
    @Body() body: { name: string },
  ) {
    const newWorkspace = await this.prisma.workspace.create({
      data: { orgId: workspace.orgId, name: body.name },
    });

    await this.prisma.customerConfig.create({
      data: { workspaceId: newWorkspace.id },
    });

    return {
      id: newWorkspace.id,
      name: newWorkspace.name,
      apiKey: newWorkspace.apiKey,
      createdAt: newWorkspace.createdAt,
    };
  }

  @Get(':id')
  @UseGuards(ApiKeyGuard)
  async getWorkspace(
    @CurrentWorkspace() workspace: any,
    @Param('id') id: string,
  ) {
    const target = await this.prisma.workspace.findFirst({
      where: { id, orgId: workspace.orgId, deletedAt: null },
    });
    if (!target) throw new NotFoundException('Workspace not found');
    return {
      id: target.id,
      name: target.name,
      apiKey: target.apiKey,
      createdAt: target.createdAt,
    };
  }
}
