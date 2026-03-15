import { Module } from '@nestjs/common';
import { IntegrationProviderModule } from '@agent-workflow/integration-provider';
import { ToolsController } from './tools.controller';

@Module({
  imports: [IntegrationProviderModule],
  controllers: [ToolsController],
})
export class ToolsModule {}
