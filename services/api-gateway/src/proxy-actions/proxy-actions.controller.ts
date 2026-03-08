import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyGuard, CurrentWorkspace } from '@agent-workflow/auth';
import { ProxyActionsService } from './proxy-actions.service';

@Controller('proxy-actions')
export class ProxyActionsController {
  constructor(private readonly proxyActionsService: ProxyActionsService) {}

  @Get()
  @UseGuards(ApiKeyGuard)
  async list(@CurrentWorkspace() workspace: any) {
    return this.proxyActionsService.list(workspace.id);
  }

  @Get(':id')
  @UseGuards(ApiKeyGuard)
  async getById(
    @CurrentWorkspace() workspace: any,
    @Param('id') id: string,
  ) {
    return this.proxyActionsService.getById(workspace.id, id);
  }

  @Post()
  @UseGuards(ApiKeyGuard)
  async create(
    @CurrentWorkspace() workspace: any,
    @Body() body: any,
  ) {
    return this.proxyActionsService.create(workspace.id, body);
  }

  @Put(':id')
  @UseGuards(ApiKeyGuard)
  async update(
    @CurrentWorkspace() workspace: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.proxyActionsService.update(workspace.id, id, body);
  }

  @Delete(':id')
  @UseGuards(ApiKeyGuard)
  async remove(
    @CurrentWorkspace() workspace: any,
    @Param('id') id: string,
  ) {
    return this.proxyActionsService.remove(workspace.id, id);
  }

  @Post(':id/toggle')
  @UseGuards(ApiKeyGuard)
  async toggle(
    @CurrentWorkspace() workspace: any,
    @Param('id') id: string,
  ) {
    return this.proxyActionsService.toggle(workspace.id, id);
  }
}
